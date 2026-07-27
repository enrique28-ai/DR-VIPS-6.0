import assert from "node:assert/strict";
import { test } from "node:test";

import express from "express";

import { apiNoStore, createSecurityHeaders } from "./securityHeaders.js";

const REQUIRED_CSP_DIRECTIVES = {
  "default-src": ["'self'"],
  "base-uri": ["'self'"],
  "object-src": ["'none'"],
  "frame-ancestors": ["'none'"],
  "form-action": ["'self'"],
  "script-src": [
    "'self'",
    "https://www.google.com",
    "https://www.gstatic.com",
    "https://www.recaptcha.net",
    "https://challenges.cloudflare.com",
  ],
  "frame-src": [
    "https://www.google.com",
    "https://recaptcha.google.com",
    "https://www.recaptcha.net",
    "https://challenges.cloudflare.com",
  ],
  "connect-src": [
    "'self'",
    "https://www.google.com",
    "https://www.gstatic.com",
    "https://www.recaptcha.net",
  ],
  "img-src": [
    "'self'",
    "data:",
    "blob:",
    "https://res.cloudinary.com",
    "https://*.googleusercontent.com",
  ],
  "style-src": ["'self'", "'unsafe-inline'"],
  "font-src": ["'self'", "data:"],
};

const HELMET_DEFAULT_HEADERS = {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "origin-agent-cluster": "?1",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-dns-prefetch-control": "off",
  "x-download-options": "noopen",
  "x-frame-options": "SAMEORIGIN",
  "x-permitted-cross-domain-policies": "none",
  "x-xss-protection": "0",
};

const API_NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  "surrogate-control": "no-store",
  pragma: "no-cache",
  expires: "0",
};

function parseContentSecurityPolicy(value) {
  assert.ok(value, "Content-Security-Policy header should be present");

  return Object.fromEntries(
    value
      .split(";")
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name, ...sources] = directive.split(/\s+/);
        return [name, sources];
      }),
  );
}

function assertRequiredCsp(response) {
  const directives = parseContentSecurityPolicy(
    response.headers.get("content-security-policy"),
  );

  for (const [directive, sources] of Object.entries(REQUIRED_CSP_DIRECTIVES)) {
    assert.deepEqual(directives[directive], sources, `${directive} sources`);
  }

  assert.equal(directives["script-src"].includes("https:"), false);
  assert.equal(directives["frame-src"].includes("https:"), false);

  return directives;
}

function assertHelmetDefaults(response) {
  for (const [header, value] of Object.entries(HELMET_DEFAULT_HEADERS)) {
    assert.equal(response.headers.get(header), value, header);
  }

  assert.equal(response.headers.get("x-powered-by"), null);
}

function assertApiNoStoreHeaders(response) {
  for (const [header, value] of Object.entries(API_NO_STORE_HEADERS)) {
    assert.equal(response.headers.get(header), value, header);
  }
}

async function startApp(t, { isProduction = false } = {}) {
  const app = express();

  app.use(createSecurityHeaders({ isProduction }));
  app.use("/api", apiNoStore);
  app.get("/api/ok", (_req, res) => res.status(200).json({ ok: true }));
  app.get("/page", (_req, res) => res.status(200).send("page"));

  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.once("error", reject);
  });

  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );

  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

test("development security headers keep Helmet defaults and omit production-only directives", async (t) => {
  const baseUrl = await startApp(t, { isProduction: false });
  const response = await fetch(`${baseUrl}/page`);

  assert.equal(response.status, 200);
  assertHelmetDefaults(response);

  const directives = assertRequiredCsp(response);
  assert.equal(directives["upgrade-insecure-requests"], undefined);
  assert.equal(response.headers.get("strict-transport-security"), null);
});

test("production security headers enable HSTS and upgrade-insecure-requests", async (t) => {
  const baseUrl = await startApp(t, { isProduction: true });
  const response = await fetch(`${baseUrl}/page`);

  assert.equal(response.status, 200);
  assertHelmetDefaults(response);

  const directives = assertRequiredCsp(response);
  assert.deepEqual(directives["upgrade-insecure-requests"], []);
  assert.equal(
    response.headers.get("strict-transport-security"),
    "max-age=31536000; includeSubDomains",
  );
});

test("API responses include no-store headers", async (t) => {
  const baseUrl = await startApp(t);
  const response = await fetch(`${baseUrl}/api/ok`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assertApiNoStoreHeaders(response);
});

test("API no-store middleware preserves a downstream 404 response", async (t) => {
  const baseUrl = await startApp(t);
  const response = await fetch(`${baseUrl}/api/missing`);

  assert.equal(response.status, 404);
  assertApiNoStoreHeaders(response);
});

test("non-API responses keep security headers without API no-store headers", async (t) => {
  const baseUrl = await startApp(t);
  const response = await fetch(`${baseUrl}/page`);

  assert.equal(response.status, 200);
  assertHelmetDefaults(response);
  assertRequiredCsp(response);

  for (const header of Object.keys(API_NO_STORE_HEADERS)) {
    assert.equal(response.headers.get(header), null, header);
  }
});

test("apiNoStore sets all cache headers and calls next exactly once", () => {
  const headers = new Map();
  let nextCalls = 0;
  const res = {
    setHeader(name, value) {
      headers.set(name, value);
    },
  };

  apiNoStore({}, res, () => {
    nextCalls += 1;
  });

  assert.deepEqual(Object.fromEntries(headers), {
    "Cache-Control": "private, no-store, max-age=0",
    "Surrogate-Control": "no-store",
    Pragma: "no-cache",
    Expires: "0",
  });
  assert.equal(nextCalls, 1);
});
