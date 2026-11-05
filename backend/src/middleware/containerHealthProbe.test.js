import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import express from "express";

import { getLiveness, createReadinessHandler } from "../controllers/healthController.js";
import { protect } from "./auth.js";
import { containerHealthProbe } from "./containerHealthProbe.js";
import { apiNotFound, errorHandler } from "./errorHandler.js";
import { apiNoStore, createSecurityHeaders } from "./securityHeaders.js";

const SPA_HTML = "<!doctype html><html><body>SYNTHETIC_SPA</body></html>";

const startApp = async (t, { buildExists = false, handlerEnabled = true, production = true } = {}) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dr-vips-probes-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  if (buildExists) await writeFile(path.join(directory, "index.html"), SPA_HTML);
  const app = express();
  app.set("trust proxy", 1);
  app.use(createSecurityHeaders({ isProduction: true }));
  app.use("/api", apiNoStore);
  app.get("/api/health/live", getLiveness);
  let readyState = 0;
  app.get("/api/health/ready", createReadinessHandler({ getReadyState: () => readyState }));
  app.get("/api/protected", protect, (_req, res) => res.json({ private: "NEVER_EXPOSE" }));
  app.use("/api", apiNotFound);
  if (production) {
    if (handlerEnabled) app.use(containerHealthProbe);
    app.use(express.static(directory));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(directory, "index.html")));
  }
  app.use(errorHandler);
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.once("error", reject);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  }));
  const request = ({ host = "app.example.test", target = "/", method = "GET", headers = {} } = {}) =>
    new Promise((resolve, reject) => {
      const outgoing = http.request({
        hostname: "127.0.0.1", port: server.address().port,
        path: target, method, headers: { host, ...headers },
      }, response => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", chunk => { body += chunk; });
        response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
      });
      outgoing.once("error", reject);
      outgoing.end();
    });
  return { request, setReadyState: value => { readyState = value; } };
};

const captureErrors = async (action) => {
  const original = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try { return { result: await action(), logs }; }
  finally { console.error = original; }
};

test("both exact probe authorities avoid the real missing-build fallback and preserve HEAD", async (t) => {
  const before = await startApp(t, { handlerEnabled: false });
  const after = await startApp(t);
  for (const host of ["containerstarthealthcheck", "ping"]) {
    const baseline = await captureErrors(() => before.request({ host }));
    assert.equal(baseline.result.status, 500);
    assert.deepEqual(JSON.parse(baseline.result.body), { error: "Internal server error" });
    assert.equal(baseline.logs[0][1].pathname, "non_api_request");
    const fixed = await captureErrors(() => after.request({ host }));
    assert.equal(fixed.result.status, 200);
    assert.deepEqual(JSON.parse(fixed.result.body), { status: "ok" });
    assert.deepEqual(fixed.logs, []);
    assert.equal(fixed.result.headers["x-content-type-options"], "nosniff");
    const head = await after.request({ host, method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.body, "");
  }
});

test("ordinary root and frontend SPA requests retain real static-file behavior", async (t) => {
  const { request } = await startApp(t, { buildExists: true });
  for (const target of ["/", "/patients", "/records/history?view=summary"]) {
    const response = await request({ target });
    assert.equal(response.status, 200);
    assert.equal(response.body, SPA_HTML);
  }
  for (const host of ["containerstarthealthcheck", "ping"]) {
    const response = await request({ host, target: "/patients" });
    assert.equal(response.body, SPA_HTML);
  }
  const noBuild = await startApp(t);
  const originalFailure = await captureErrors(() => noBuild.request());
  assert.equal(originalFailure.result.status, 500);
  assert.equal(originalFailure.logs[0][1].pathname, "non_api_request");
});

test("strict matching rejects authority variations and ignores forwarded-host spoofing", async (t) => {
  const { request } = await startApp(t, { buildExists: true });
  for (const host of [
    "app.example.test", "ping.example.test", "evilping", "ping:8080", "ping:80",
    "PING", "Ping", "ping.", "containerstarthealthcheck.example.test",
    "containerstarthealthcheck:8080", "CONTAINERSTARTHEALTHCHECK",
  ]) {
    const response = await request({ host, headers: { "x-forwarded-host": "ping" } });
    assert.equal(response.status, 200);
    assert.equal(response.body, SPA_HTML, host);
  }
  const probeWithUnrelatedForwardedHost = await request({
    host: "ping", headers: { "x-forwarded-host": "app.example.test" },
  });
  assert.deepEqual(JSON.parse(probeWithUnrelatedForwardedHost.body), { status: "ok" });
});

test("queries, encoded paths, extra slashes and nonprobe methods are not intercepted", async (t) => {
  const { request } = await startApp(t, { buildExists: true });
  const baseline = await startApp(t, { buildExists: true, handlerEnabled: false });
  for (const target of ["/?probe=1", "//", "/%2f", "/%70ing", "/ping", "/./"]) {
    const response = await request({ host: "ping", target });
    const original = await baseline.request({ host: "ping", target });
    assert.equal(response.status, original.status, target);
    assert.equal(response.body, original.body, target);
    assert.equal(response.headers.location, original.headers.location, target);
    assert.notEqual(response.body, '{"status":"ok"}', target);
  }
  for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
    const response = await request({ host: "ping", method });
    const original = await baseline.request({ host: "ping", method });
    assert.notEqual(response.body, '{"status":"ok"}', method);
    assert.equal(response.status, original.status, method);
    assert.equal(response.body, original.body, method);
  }
});

test("probe-shaped Host cannot bypass real auth, API 404 or database readiness", async (t) => {
  const { request, setReadyState } = await startApp(t);
  for (const host of ["ping", "containerstarthealthcheck"]) {
    const protectedResponse = await request({ host, target: "/api/protected" });
    assert.equal(protectedResponse.status, 401);
    assert.deepEqual(JSON.parse(protectedResponse.body), { error: "Not authenticated" });
    assert.equal(protectedResponse.body.includes("NEVER_EXPOSE"), false);
    const missing = await request({ host, target: "/api/missing" });
    assert.equal(missing.status, 404);
    assert.deepEqual(JSON.parse(missing.body), { error: "API route not found" });
    const live = await request({ host, target: "/api/health/live" });
    assert.equal(live.status, 200);
    assert.deepEqual(JSON.parse(live.body), { status: "ok" });
    for (const state of [0, 1, 2, 3]) {
      setReadyState(state);
      const ready = await request({ host, target: "/api/health/ready" });
      assert.equal(ready.status, state === 1 ? 200 : 503);
      assert.deepEqual(JSON.parse(ready.body), { status: state === 1 ? "ready" : "not_ready" });
    }
  }
});

test("production-only wiring preserves API order and leaves nonproduction untouched", async (t) => {
  const source = await readFile(new URL("../server.js", import.meta.url), "utf8");
  const api404 = source.indexOf('app.use("/api", apiNotFound);');
  const productionBlock = source.indexOf('if (process.env.NODE_ENV === "production") {');
  const probe = source.indexOf("app.use(containerHealthProbe);");
  const staticFiles = source.indexOf("app.use(express.static(distPath));");
  assert.ok(api404 >= 0 && productionBlock > api404 && probe > productionBlock && staticFiles > probe);
  const { request } = await startApp(t, { production: false });
  assert.equal((await request({ host: "ping" })).status, 404);
});

test("installed SDK 0.3.7 generates both GET root probes compatible with the Express boundary", async (t) => {
  const entry = import.meta.resolve("@cloudflare/containers");
  const metadata = JSON.parse(await readFile(new URL("../package.json", entry), "utf8"));
  assert.equal(metadata.version, "0.3.7", "Re-audit probe compatibility when the locked SDK changes");
  const sdkUrl = new URL("./lib/container.js", entry);
  let source = await readFile(sdkUrl, "utf8");
  assert.match(source, /pingEndpoint = 'ping';/);
  // Only adapt module imports to run the installed implementation in Node.
  // This is not a production SDK patch, private override or workerd wire capture.
  source = source.replace("from './helpers'", `from ${JSON.stringify(new URL("./helpers.js", sdkUrl).href)}`);
  source = source.replace("import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';",
    "class DurableObject {}\nclass WorkerEntrypoint {}");
  source += "\n//# sourceURL=installed-cloudflare-containers.js\n";
  const { Container } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const { request } = await startApp(t);
  const observed = [];
  const context = {
    pingEndpoint: "ping",
    container: {
      running: true,
      getTcpPort(port) {
        assert.equal(port, 8080);
        return { async fetch(input, init) {
          const probe = new Request(input, init);
          const url = new URL(probe.url);
          observed.push({ url: url.href, method: probe.method, path: url.pathname, authority: url.host });
          // Model normal Fetcher URL-authority -> HTTP Host semantics locally;
          // this does not independently establish production wire headers.
          const response = await request({ host: url.host, target: url.pathname, method: probe.method });
          assert.equal(response.status, 200);
          assert.deepEqual(JSON.parse(response.body), { status: "ok" });
          return new Response(response.body, { status: response.status });
        } };
      },
    },
    renewActivityTimeout() {},
    async scheduleNextAlarm() {},
  };
  const { logs } = await captureErrors(async () => {
    await Container.prototype.doStartContainer.call(context,
      { portToCheck: 8080, retries: 1, waitInterval: 300 });
    await Container.prototype.waitForPort.call(context,
      { portToCheck: 8080, retries: 1, waitInterval: 300 });
  });
  assert.deepEqual(observed, [
    { url: "http://containerstarthealthcheck/", method: "GET", path: "/", authority: "containerstarthealthcheck" },
    { url: "http://ping/", method: "GET", path: "/", authority: "ping" },
  ]);
  assert.deepEqual(logs, []);
});
