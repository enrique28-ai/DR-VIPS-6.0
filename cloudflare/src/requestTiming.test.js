import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  boundedDurationMs,
  classifyApiEndpoint,
  fetchContainerWithTiming,
  sanitizeWorkerTimingPayload,
  TIMING_REQUEST_HEADER,
} from "./requestTiming.js";

const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const CLIENT_REQUEST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("Worker timing utilities bound durations and classify only coarse endpoints", () => {
  assert.equal(boundedDurationMs(1, 6.12345), 5.123);
  assert.equal(boundedDurationMs(20, 10), 0);
  assert.equal(boundedDurationMs(0, 999_999_999), 86_400_000);
  assert.equal(classifyApiEndpoint("/api/auth/me"), "auth_me");
  assert.equal(classifyApiEndpoint("/api/health/live"), "health_live");
  assert.equal(classifyApiEndpoint("/api/health/ready"), "health_ready");
  assert.equal(classifyApiEndpoint("/api/patients/PRIVATE_PATIENT"), "other_api");
});

test("Worker timing payloads drop forbidden and unvalidated values", () => {
  const safe = sanitizeWorkerTimingPayload({
    durationMs: 9.87654,
    status: 200,
    endpointClass: "auth_me",
    requestId: REQUEST_ID,
    url: "https://dr-vips.com/api/auth/me?email=private@example.test",
    cookie: "PRIVATE_COOKIE",
    authorization: "PRIVATE_TOKEN",
    userId: "PRIVATE_USER",
    error: new Error("PRIVATE_DATABASE_ERROR"),
  });

  assert.deepEqual(safe, {
    event: "timing",
    stage: "container_request",
    durationMs: 9.877,
    status: 200,
    endpointClass: "auth_me",
    requestId: REQUEST_ID,
  });
  assert.equal(JSON.stringify(safe).includes("PRIVATE"), false);
});

test("Worker overwrites correlation and logs container request duration without URL data", async () => {
  const logs = [];
  let forwardedRequest;
  const privateQuery = "private@example.test";
  const request = new Request(
    `https://dr-vips.com/api/auth/me?email=${encodeURIComponent(privateQuery)}`,
    { headers: { [TIMING_REQUEST_HEADER]: CLIENT_REQUEST_ID, cookie: "PRIVATE_COOKIE" } },
  );
  const times = [100, 137.25];
  const response = new Response(JSON.stringify({ user: null }), { status: 200 });

  const result = await fetchContainerWithTiming({
    request,
    container: {
      async fetch(nextRequest) {
        forwardedRequest = nextRequest;
        return response;
      },
    },
    logger: { info: (prefix, payload) => logs.push({ prefix, payload }) },
    now: () => times.shift(),
    createUuid: () => REQUEST_ID,
  });

  assert.equal(result, response);
  assert.equal(forwardedRequest.headers.get(TIMING_REQUEST_HEADER), REQUEST_ID);
  assert.deepEqual(logs, [{
    prefix: "[timing]",
    payload: {
      event: "timing",
      stage: "container_request",
      durationMs: 37.25,
      status: 200,
      endpointClass: "auth_me",
      requestId: REQUEST_ID,
    },
  }]);
  const exposed = JSON.stringify(logs);
  assert.equal(exposed.includes(privateQuery), false);
  assert.equal(exposed.includes("PRIVATE_COOKIE"), false);
  assert.equal(exposed.includes(CLIENT_REQUEST_ID), false);
});

test("Worker timing logger failure does not alter success or forwarding errors", async () => {
  const throwingLogger = {
    info() { throw new Error("PRIVATE_LOGGER_FAILURE"); },
    error() { throw new Error("PRIVATE_LOGGER_FAILURE"); },
  };
  const request = new Request("https://dr-vips.com/api/health/live");
  const response = new Response("ok", { status: 200 });

  assert.equal(await fetchContainerWithTiming({
    request,
    container: { fetch: async () => response },
    logger: throwingLogger,
    createUuid: () => REQUEST_ID,
  }), response);

  const forwardingError = new Error("PRIVATE_FORWARDING_ERROR");
  await assert.rejects(
    fetchContainerWithTiming({
      request,
      container: { fetch: async () => { throw forwardingError; } },
      logger: throwingLogger,
      createUuid: () => REQUEST_ID,
    }),
    (error) => error === forwardingError,
  );
});

test("Worker source uses the neutral container request timing wrapper", async () => {
  const source = await readFile(new URL("./index.js", import.meta.url), "utf8");
  assert.match(source, /fetchContainerWithTiming\s*\(\s*\{\s*request,\s*container\s*\}\s*\)/);
  assert.equal(source.includes("containerWakeMs"), false);
  assert.equal(source.includes("return container.fetch(request)"), false);
});
