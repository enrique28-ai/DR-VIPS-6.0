import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  boundedDurationMs,
  createAuthMeRequestTiming,
  RUNTIME_TIMING_ID,
  sanitizeTimingPayload,
  TIMING_REQUEST_HEADER,
} from "./timing.js";

const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";

test("boundedDurationMs returns finite nonnegative bounded values", () => {
  assert.equal(boundedDurationMs(10, 14.56789), 4.568);
  assert.equal(boundedDurationMs(20, 10), 0);
  assert.equal(boundedDurationMs(Number.NaN, 10), 0);
  assert.equal(boundedDurationMs(0, Number.POSITIVE_INFINITY), 0);
  assert.equal(boundedDurationMs(0, 999_999_999), 86_400_000);
});

test("timing payloads keep only validated operational fields", () => {
  const safe = sanitizeTimingPayload({
    event: "PRIVATE_EVENT",
    stage: "protect",
    durationMs: 12.34567,
    attempt: 2,
    status: "success",
    endpointClass: "auth_me",
    requestId: REQUEST_ID,
    runtimeId: REQUEST_ID,
    token: "PRIVATE_TOKEN",
    cookie: "PRIVATE_COOKIE",
    email: "private@example.test",
    userId: "PRIVATE_USER_ID",
    query: "?patient=PRIVATE_PATIENT",
    error: new Error("PRIVATE_DATABASE_ERROR"),
  });

  assert.deepEqual(safe, {
    event: "timing",
    stage: "protect",
    durationMs: 12.346,
    attempt: 2,
    status: "success",
    endpointClass: "auth_me",
    requestId: REQUEST_ID,
    runtimeId: REQUEST_ID,
  });
  assert.equal(JSON.stringify(safe).includes("PRIVATE"), false);
});

test("auth/me request timing replaces an invalid client ID and remains nonfatal", () => {
  const logs = [];
  const logger = {
    info(prefix, payload) {
      logs.push({ prefix, payload });
      throw new Error("PRIVATE_LOGGER_FAILURE");
    },
  };
  const req = {
    method: "GET",
    path: "/api/auth/me",
    headers: { [TIMING_REQUEST_HEADER]: "client-controlled-private-value" },
  };
  const res = new EventEmitter();
  res.statusCode = 200;
  let nextCalls = 0;
  const times = [10, 24];

  assert.doesNotThrow(() => createAuthMeRequestTiming({
    logger,
    now: () => times.shift(),
    createUuid: () => REQUEST_ID,
  })(req, res, () => { nextCalls += 1; }));
  assert.equal(nextCalls, 1);
  assert.doesNotThrow(() => res.emit("finish"));
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0], {
    prefix: "[timing]",
    payload: {
      event: "timing",
      stage: "express_request",
      durationMs: 14,
      status: 200,
      endpointClass: "auth_me",
      requestId: REQUEST_ID,
      runtimeId: RUNTIME_TIMING_ID,
    },
  });
  assert.equal(JSON.stringify(logs).includes("client-controlled"), false);
});

test("request timing ignores every route except exact GET /api/auth/me", () => {
  const logs = [];
  const middleware = createAuthMeRequestTiming({
    logger: { info: (...args) => logs.push(args) },
    createUuid: () => REQUEST_ID,
  });

  for (const [method, path] of [
    ["DELETE", "/api/auth/me"],
    ["GET", "/api/auth/me/extra"],
    ["GET", "/api/patients/PRIVATE_PATIENT"],
  ]) {
    let nextCalls = 0;
    middleware({ method, path }, {}, () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
  }

  assert.deepEqual(logs, []);
});

test("server installs auth/me request timing before the auth router without timing headers", async () => {
  const source = await readFile(new URL("../server.js", import.meta.url), "utf8");
  const timingIndex = source.indexOf("app.use(createAuthMeRequestTiming())");
  const authRouterIndex = source.indexOf('app.use("/api/auth", authRoutes)');

  assert.ok(timingIndex >= 0);
  assert.ok(authRouterIndex > timingIndex);
  assert.equal(source.includes("Server-Timing"), false);
});
