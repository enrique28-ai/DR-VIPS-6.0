import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import multer from "multer";

import {
  apiNotFound,
  classifyError,
  errorHandler,
} from "./errorHandler.js";
import { createSecurityHeaders } from "./securityHeaders.js";

const API_NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  "surrogate-control": "no-store",
  pragma: "no-cache",
  expires: "0",
};

const SANITIZED_API_LOG = {
  level: "error",
  type: "internal_error",
  method: "GET",
  pathname: "api_request",
  status: 500,
  message: "unhandled_request_error",
};

function assertClassification(error, status, body, type) {
  assert.deepEqual(classifyError(error), { status, body, type });
}

function assertApiNoStoreHeaders(response) {
  for (const [header, value] of Object.entries(API_NO_STORE_HEADERS)) {
    assert.equal(response.headers.get(header), value, header);
  }
}

async function captureConsoleError(action) {
  const originalConsoleError = console.error;
  const calls = [];
  console.error = (...args) => calls.push(args);

  try {
    const value = await action();
    return { calls, value };
  } finally {
    console.error = originalConsoleError;
  }
}

async function startApp(t) {
  const app = express();

  app.use(createSecurityHeaders({ isProduction: false }));
  app.use(express.json());
  app.post("/api/json", (_req, res) => res.status(200).json({ ok: true }));
  app.get("/api/async-error", async () => {
    throw new Error("PRIVATE_ASYNC_MEDICAL_MESSAGE");
  });
  app.get("/api/sync-error", () => {
    throw new Error("PRIVATE_SYNC_MEDICAL_MESSAGE");
  });
  app.get("/api/cast-error", () => {
    throw new mongoose.Error.CastError("ObjectId", "PRIVATE_VALUE", "patient");
  });
  app.post("/api/private-error", (req) => {
    const error = new Error("PRIVATE_MEDICAL_MESSAGE");
    error.stack = "PRIVATE_INTERNAL_STACK";
    error.cause = new Error("PRIVATE_CAUSE");
    error.keyValue = { email: "PRIVATE_DUPLICATE_VALUE" };
    error.errors = { diagnosis: "PRIVATE_DIAGNOSIS" };
    error.collection = "PRIVATE_COLLECTION";
    error.requestBodyReference = req.body;
    throw error;
  });
  app.get("/apiincorrecto/error", () => {
    throw new Error("PRIVATE_NON_API_MESSAGE");
  });
  app.use("/api", apiNotFound);
  app.use(errorHandler);

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

test("classifyError maps malformed JSON and does not trust a plain SyntaxError", () => {
  const malformedJson = new SyntaxError("PRIVATE_PARSE_MESSAGE");
  malformedJson.type = "entity.parse.failed";
  malformedJson.status = 400;

  assertClassification(
    malformedJson,
    400,
    { error: "Invalid JSON payload" },
    "invalid_json",
  );
  assertClassification(
    new SyntaxError("PRIVATE_INTERNAL_SYNTAX"),
    500,
    { error: "Internal server error" },
    "internal_error",
  );
});

test("classifyError maps body-parser payload limits without trusting arbitrary status", () => {
  assertClassification(
    Object.assign(new Error("PRIVATE_PAYLOAD_MESSAGE"), {
      type: "entity.too.large",
      status: 413,
    }),
    413,
    { error: "Payload too large" },
    "payload_too_large",
  );
  assertClassification(
    Object.assign(new Error("PRIVATE_ARBITRARY_STATUS"), { status: 413 }),
    500,
    { error: "Internal server error" },
    "internal_error",
  );
});

test("classifyError maps Mongoose CastError and ValidationError", () => {
  assertClassification(
    new mongoose.Error.CastError("ObjectId", "PRIVATE_VALUE", "patient"),
    400,
    { error: "Invalid request data" },
    "invalid_request_data",
  );
  assertClassification(
    new mongoose.Error.ValidationError(),
    400,
    { error: "Invalid request data" },
    "invalid_request_data",
  );
});

test("classifyError maps numeric and string duplicate key codes", () => {
  for (const code of [11000, "11000"]) {
    const error = Object.assign(new Error("PRIVATE_DUPLICATE_MESSAGE"), {
      code,
      keyValue: { email: "PRIVATE_DUPLICATE_VALUE" },
      keyPattern: { email: 1 },
    });
    assertClassification(
      error,
      409,
      { error: "Resource already exists" },
      "duplicate_key",
    );
  }
});

test("classifyError maps real MulterError instances", () => {
  assertClassification(
    new multer.MulterError("LIMIT_FILE_SIZE", "avatar"),
    413,
    { error: "File too large" },
    "file_too_large",
  );
  assertClassification(
    new multer.MulterError("LIMIT_UNEXPECTED_FILE", "avatar"),
    400,
    { error: "Invalid file upload" },
    "invalid_file_upload",
  );
  assertClassification(
    { name: "MulterError", code: "LIMIT_FILE_SIZE" },
    500,
    { error: "Internal server error" },
    "internal_error",
  );
});

test("classifyError maps real JWT errors", () => {
  assertClassification(
    new jwt.JsonWebTokenError("PRIVATE_TOKEN_MESSAGE"),
    401,
    { error: "Invalid or expired session" },
    "invalid_session",
  );
  assertClassification(
    new jwt.TokenExpiredError("PRIVATE_EXPIRY_MESSAGE", new Date()),
    401,
    { error: "Invalid or expired session" },
    "invalid_session",
  );
});

test("classifyError maps unknown errors to a generic 500", () => {
  assertClassification(
    Object.assign(new Error("PRIVATE_UNKNOWN_MESSAGE"), {
      status: 418,
      errorCode: "PRIVATE_ERROR_CODE",
    }),
    500,
    { error: "Internal server error" },
    "internal_error",
  );
});

test("API 404 is exact JSON with security and no-store headers and no reflection", async (t) => {
  const baseUrl = await startApp(t);
  const { calls, value: response } = await captureConsoleError(() =>
    fetch(`${baseUrl}/api/PRIVATE_PATH_SENTINEL?token=PRIVATE_QUERY_SENTINEL`),
  );
  const body = await response.text();
  const exposed = `${body}\n${JSON.stringify(Object.fromEntries(response.headers))}`;

  assert.equal(response.status, 404);
  assert.equal(body, '{"error":"API route not found"}');
  assert.match(response.headers.get("content-type"), /^application\/json\b/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.ok(response.headers.get("content-security-policy"));
  assertApiNoStoreHeaders(response);
  assert.equal(exposed.includes("PRIVATE_PATH_SENTINEL"), false);
  assert.equal(exposed.includes("PRIVATE_QUERY_SENTINEL"), false);
  assert.deepEqual(calls, []);
});

test("malformed API JSON is exact JSON with no-store headers and no HTML", async (t) => {
  const baseUrl = await startApp(t);
  const { calls, value: response } = await captureConsoleError(() =>
    fetch(`${baseUrl}/api/json`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"broken":',
    }),
  );
  const body = await response.text();

  assert.equal(response.status, 400);
  assert.equal(body, '{"error":"Invalid JSON payload"}');
  assert.match(response.headers.get("content-type"), /^application\/json\b/);
  assert.equal(body.includes("<html"), false);
  assertApiNoStoreHeaders(response);
  assert.deepEqual(calls, []);
});

test("oversized API JSON preserves a safe 413 contract", async (t) => {
  const baseUrl = await startApp(t);
  const { calls, value: response } = await captureConsoleError(() =>
    fetch(`${baseUrl}/api/json`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "PRIVATE_LARGE_VALUE".repeat(10000) }),
    }),
  );
  const body = await response.text();

  assert.equal(response.status, 413);
  assert.equal(body, '{"error":"Payload too large"}');
  assertApiNoStoreHeaders(response);
  assert.equal(body.includes("PRIVATE_LARGE_VALUE"), false);
  assert.deepEqual(calls, []);
});

test("Express 5 forwards async rejections to one sanitized 500 log", async (t) => {
  const baseUrl = await startApp(t);
  const { calls, value: response } = await captureConsoleError(() =>
    fetch(`${baseUrl}/api/async-error`),
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Internal server error" });
  assertApiNoStoreHeaders(response);
  assert.deepEqual(calls, [["[backend-error]", SANITIZED_API_LOG]]);
});

test("synchronous errors use the same generic API contract", async (t) => {
  const baseUrl = await startApp(t);
  const { calls, value: response } = await captureConsoleError(() =>
    fetch(`${baseUrl}/api/sync-error`),
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Internal server error" });
  assertApiNoStoreHeaders(response);
  assert.deepEqual(calls, [["[backend-error]", SANITIZED_API_LOG]]);
});

test("known route errors use their allowlisted contract without logging", async (t) => {
  const baseUrl = await startApp(t);
  const { calls, value: response } = await captureConsoleError(() =>
    fetch(`${baseUrl}/api/cast-error`),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid request data" });
  assertApiNoStoreHeaders(response);
  assert.deepEqual(calls, []);
});

test("non-API prefix lookalikes stay generic without API no-store headers", async (t) => {
  const baseUrl = await startApp(t);
  const { calls, value: response } = await captureConsoleError(() =>
    fetch(`${baseUrl}/apiincorrecto/error`),
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Internal server error" });
  for (const header of Object.keys(API_NO_STORE_HEADERS)) {
    assert.equal(response.headers.get(header), null, header);
  }
  assert.deepEqual(calls, [[
    "[backend-error]",
    { ...SANITIZED_API_LOG, pathname: "non_api_request" },
  ]]);
});

test("headersSent delegates the original error without writing a response", () => {
  const originalError = new Error("PRIVATE_HEADERS_SENT_MESSAGE");
  let delegatedError;
  const res = {
    headersSent: true,
    json() {
      assert.fail("json should not be called");
    },
    setHeader() {
      assert.fail("setHeader should not be called");
    },
    status() {
      assert.fail("status should not be called");
    },
  };

  errorHandler(originalError, { method: "GET", path: "/api/test" }, res, (error) => {
    delegatedError = error;
  });

  assert.equal(errorHandler.length, 4);
  assert.equal(delegatedError, originalError);
});

test("private sentinels never appear in response headers, body, or logs", async (t) => {
  const sentinels = [
    "PRIVATE_MEDICAL_MESSAGE",
    "private@example.test",
    "+15555550199",
    "PRIVATE_TOKEN",
    "PRIVATE_COOKIE",
    "mongodb://PRIVATE_URI",
    "PRIVATE_COLLECTION",
    "PRIVATE_DUPLICATE_VALUE",
    "PRIVATE_INTERNAL_STACK",
    "PRIVATE_CAUSE",
    "PRIVATE_DIAGNOSIS",
  ];
  const baseUrl = await startApp(t);
  const { calls, value: response } = await captureConsoleError(() =>
    fetch(`${baseUrl}/api/private-error?token=PRIVATE_TOKEN`, {
      method: "POST",
      headers: {
        authorization: "Bearer PRIVATE_TOKEN",
        cookie: "session=PRIVATE_COOKIE",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        diagnosis: "PRIVATE_MEDICAL_MESSAGE",
        email: "private@example.test",
        phone: "+15555550199",
        uri: "mongodb://PRIVATE_URI",
      }),
    }),
  );
  const body = await response.text();
  const exposed = JSON.stringify({
    body,
    headers: Object.fromEntries(response.headers),
    logs: calls,
  });

  assert.equal(response.status, 500);
  assert.equal(body, '{"error":"Internal server error"}');
  assertApiNoStoreHeaders(response);
  assert.deepEqual(calls, [[
    "[backend-error]",
    { ...SANITIZED_API_LOG, method: "POST" },
  ]]);
  for (const sentinel of sentinels) {
    assert.equal(exposed.includes(sentinel), false, sentinel);
  }
});

test("server registers API 404 before static handling and errorHandler last", async () => {
  const serverSource = await readFile(
    path.resolve("backend/src/server.js"),
    "utf8",
  );
  const notificationRoutes = serverSource.indexOf(
    'app.use("/api/notifications", notificationRoutes);',
  );
  const api404 = serverSource.indexOf('app.use("/api", apiNotFound);');
  const uploads = serverSource.indexOf('app.use("/uploads"');
  const spaFallback = serverSource.indexOf("app.get(/^(?!\\/api).*/");
  const globalHandler = serverSource.indexOf("app.use(errorHandler);");
  const connect = serverSource.indexOf("connectDB().then");

  assert.ok(notificationRoutes >= 0);
  assert.ok(api404 > notificationRoutes);
  assert.ok(uploads > api404);
  assert.ok(spaFallback > uploads);
  assert.ok(globalHandler > spaFallback);
  assert.ok(connect > globalHandler);
});
