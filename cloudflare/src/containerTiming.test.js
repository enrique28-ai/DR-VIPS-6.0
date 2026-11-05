import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { sanitizeContainerTimingPayload, withContainerTiming } from "./containerTiming.js";
import { fetchContainerWithTiming, TIMING_REQUEST_HEADER } from "./requestTiming.js";

const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const OTHER_REQUEST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

const fixture = (script = {}, options = {}) => {
  const calls = [];
  const logs = [];
  let tick = 0;
  let sequence = 0;
  class FakeContainer {
    fetch(...args) {
      calls.push({ method: "fetch", receiver: this, args });
      return script.fetch.apply(this, args);
    }
    startAndWaitForPorts(...args) {
      calls.push({ method: "startAndWaitForPorts", receiver: this, args });
      return script.startAndWaitForPorts.apply(this, args);
    }
    waitForPort(...args) {
      calls.push({ method: "waitForPort", receiver: this, args });
      return script.waitForPort.apply(this, args);
    }
  }
  const Instrumented = withContainerTiming(FakeContainer, {
    logger: {
      info: (prefix, payload) => logs.push({ prefix, payload }),
      error: (prefix, payload) => logs.push({ prefix, payload }),
    },
    now: () => ++tick,
    createUuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    ...options,
  });
  return { instance: new Instrumented(), Instrumented, calls, logs };
};

test("container timing payloads allow only bounded durations, fixed classes and opaque IDs", () => {
  assert.deepEqual(sanitizeContainerTimingPayload({
    stage: "container_port_wait", durationMs: 1e10, status: "success",
    durableObjectRuntimeId: REQUEST_ID, operationId: OTHER_REQUEST_ID,
    requestId: "PRIVATE_EMAIL@example.test", endpointClass: "PRIVATE_PATIENT",
    host: "PRIVATE_HOST", url: "PRIVATE_URL", token: "PRIVATE_TOKEN",
    cookie: "PRIVATE_COOKIE", error: new Error("PRIVATE_ERROR"), retries: 100,
  }), {
    event: "timing", stage: "container_port_wait", durationMs: 86_400_000,
    status: "success", durableObjectRuntimeId: REQUEST_ID, operationId: OTHER_REQUEST_ID,
  });
  assert.deepEqual(sanitizeContainerTimingPayload({
    stage: "PRIVATE_STAGE", status: "PRIVATE_STATUS", durationMs: -1,
  }), { event: "timing" });
});

test("Worker and object wrappers preserve forwarding, response identity and authoritative correlation", async () => {
  const response = new Response("PRIVATE_BODY", { status: 201 });
  const delegated = Promise.resolve(response);
  const { instance, calls, logs } = fixture({ fetch: () => delegated });
  const request = new Request("https://private.example.test/api/auth/me?email=PRIVATE_EMAIL", {
    headers: { cookie: "PRIVATE_COOKIE", authorization: "PRIVATE_TOKEN", [TIMING_REQUEST_HEADER]: OTHER_REQUEST_ID },
  });
  const result = await fetchContainerWithTiming({
    request, container: instance, createUuid: () => REQUEST_ID,
    logger: { info: () => {} },
  });
  assert.equal(result, response);
  assert.equal(response.bodyUsed, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].receiver, instance);
  assert.equal(calls[0].args[0].headers.get(TIMING_REQUEST_HEADER), REQUEST_ID);
  assert.equal(calls[0].args[0].headers.get("cookie"), "PRIVATE_COOKIE");
  assert.equal(logs[0].payload.requestId, REQUEST_ID);
  assert.equal(logs[0].payload.endpointClass, "auth_me");
  assert.equal(logs[0].payload.status, 201);
  assert.equal(logs[0].payload.stage, "durable_object_request");
  assert.equal(logs[0].payload.durationMs, 1);
  assert.equal(JSON.stringify(logs).includes("PRIVATE"), false);
  assert.equal(JSON.stringify(logs).includes("private.example.test"), false);
});

test("each public wrapper delegates once with exact arguments, this, signal and original Promise", async () => {
  const response = new Response("ok");
  for (const method of ["fetch", "startAndWaitForPorts", "waitForPort"]) {
    const delegated = Promise.resolve(method === "fetch" ? response : 67);
    const { instance, calls } = fixture({ [method]: () => delegated });
    const signal = new AbortController().signal;
    const overloads = method === "startAndWaitForPorts"
      ? [[{ ports: [8080], cancellationOptions: { abort: signal }, startOptions: { envVars: { PRIVATE: "secret" } } }],
        [[8080], { abort: signal }, { envVars: { PRIVATE: "secret" } }], []]
      : method === "waitForPort"
        ? [[{ portToCheck: 8080, signal, retries: 67, waitInterval: 300 }]]
        : [[new Request("https://example.test/api/health/live", { signal })]];
    for (const args of overloads) {
      const promise = instance[method](...args);
      assert.equal(promise, delegated);
      assert.equal(await promise, method === "fetch" ? response : 67);
      const call = calls.at(-1);
      assert.equal(call.receiver, instance);
      assert.equal(call.args.length, args.length);
      args.forEach((arg, index) => assert.equal(call.args[index], arg));
    }
    assert.equal(calls.length, overloads.length);
  }
});

test("nested startup and port spans remain distinct and do not claim a triggering request", async () => {
  const response = new Response("ok");
  const { instance, calls, logs } = fixture({
    async fetch() { await this.startAndWaitForPorts(8080); return response; },
    async startAndWaitForPorts() { await this.waitForPort({ portToCheck: 8080 }); },
    waitForPort: () => Promise.resolve(67),
  });
  assert.equal(await instance.fetch(new Request("https://example.test/api/auth/me", {
    headers: { [TIMING_REQUEST_HEADER]: REQUEST_ID },
  })), response);
  assert.deepEqual(calls.map(call => call.method), ["fetch", "startAndWaitForPorts", "waitForPort"]);
  assert.deepEqual(logs.map(log => log.payload.stage), [
    "container_port_wait", "container_start_readiness", "durable_object_request",
  ]);
  assert.deepEqual(logs.map(log => log.payload.durationMs), [1, 3, 5]);
  assert.equal(new Set(logs.map(log => log.payload.durableObjectRuntimeId)).size, 1);
  assert.equal(new Set(logs.map(log => log.payload.operationId)).size, 3);
  for (const log of logs.slice(0, 2)) {
    assert.equal(log.payload.requestId, undefined);
    assert.equal(log.payload.endpointClass, undefined);
    assert.equal(log.payload.status, "success");
    assert.equal(log.payload.retries, undefined);
  }
});

test("concurrent requests keep correlation local and preserve shared startup Promises", async () => {
  const first = deferred();
  const second = deferred();
  const startup = deferred();
  const { instance, Instrumented, logs, calls } = fixture({
    fetch: (request) => request.headers.get(TIMING_REQUEST_HEADER) === REQUEST_ID ? first.promise : second.promise,
    startAndWaitForPorts: () => startup.promise,
  });
  const request = (id) => new Request("https://example.test/api/auth/me", {
    headers: { [TIMING_REQUEST_HEADER]: id },
  });
  const firstCall = instance.fetch(request(REQUEST_ID));
  const secondCall = instance.fetch(request(OTHER_REQUEST_ID));
  assert.equal(instance.startAndWaitForPorts(8080), startup.promise);
  assert.equal(instance.startAndWaitForPorts(8080), startup.promise);
  const secondResponse = new Response("second");
  second.resolve(secondResponse);
  assert.equal(await secondCall, secondResponse);
  assert.equal(logs[0].payload.requestId, OTHER_REQUEST_ID);
  const firstResponse = new Response("first");
  first.resolve(firstResponse);
  assert.equal(await firstCall, firstResponse);
  assert.equal(logs[1].payload.requestId, REQUEST_ID);
  startup.resolve();
  await startup.promise;
  assert.equal(calls.length, 4);
  assert.ok(logs.slice(2).every(log => !Object.hasOwn(log.payload, "requestId")));
  const other = new Instrumented();
  assert.equal(other.startAndWaitForPorts(8080), startup.promise);
  await startup.promise;
  assert.notEqual(logs[0].payload.durableObjectRuntimeId, logs.at(-1).payload.durableObjectRuntimeId);
});

test("public wrappers preserve rejected errors and synchronous exceptions without logging details", async () => {
  for (const method of ["fetch", "startAndWaitForPorts", "waitForPort"]) {
    const error = new Error("PRIVATE_CREDENTIAL_ERROR");
    const delegated = Promise.reject(error);
    const { instance, logs } = fixture({ [method]: () => delegated });
    assert.equal(instance[method](), delegated);
    await assert.rejects(delegated, (actual) => actual === error);
    assert.equal(logs[0].payload.status, "failed");
    assert.equal(JSON.stringify(logs).includes("PRIVATE"), false);
    const sync = fixture({ [method]: () => { throw error; } });
    assert.throws(() => sync.instance[method](), (actual) => actual === error);
    assert.equal(sync.logs[0].payload.status, "failed");
  }
});

test("broken clocks omit duration rather than fabricate zero", async () => {
  for (const now of [() => NaN, () => Infinity, () => { throw new Error("clock"); },
    (() => { let tick = 2; return () => tick--; })()]) {
    const { instance, logs } = fixture({ waitForPort: () => Promise.resolve(67) }, { now });
    assert.equal(await instance.waitForPort({}), 67);
    assert.equal(Object.hasOwn(logs[0].payload, "durationMs"), false);
  }
});

test("UUID, logger and request metadata failures never change delegation or cause observer rejection", async () => {
  const error = new Error("PRIVATE_FAILURE");
  const response = new Response("ok");
  for (const createUuid of [() => { throw error; }, () => "PRIVATE_INVALID_ID"]) {
    const { instance, logs } = fixture({ fetch: () => Promise.resolve(response) }, { createUuid });
    assert.equal(await instance.fetch({ get url() { throw error; } }), response);
    assert.equal(logs[0].payload.operationId, undefined);
    assert.equal(logs[0].payload.durableObjectRuntimeId, undefined);
    assert.equal(logs[0].payload.requestId, undefined);
  }
  const logger = { get info() { throw error; }, get error() { throw error; } };
  const delegated = Promise.reject(error);
  const { instance } = fixture({
    fetch: () => Promise.resolve({ get status() { throw error; } }),
    waitForPort: () => delegated,
  }, { logger, now: () => { throw error; }, createUuid: () => { throw error; } });
  assert.ok(await instance.fetch(undefined));
  assert.equal(instance.waitForPort(), delegated);
  await assert.rejects(delegated, (actual) => actual === error);
  // Node's runner would also report any unhandled observer Promise rejection.
});

test("production class uses only the public SDK timing decorator and preserves probe configuration", async () => {
  const source = await readFile(new URL("./index.js", import.meta.url), "utf8");
  assert.match(source, /class DrVipsApi extends withContainerTiming\(Container\)/);
  assert.match(source, /defaultPort = 8080/);
  assert.match(source, /sleepAfter = "10m"/);
  assert.equal(source.includes("pingEndpoint"), false);
  const helper = await readFile(new URL("./containerTiming.js", import.meta.url), "utf8");
  assert.equal(helper.includes("super.doStartContainer"), false);
  assert.equal(helper.includes("getTcpPort("), false);
});
