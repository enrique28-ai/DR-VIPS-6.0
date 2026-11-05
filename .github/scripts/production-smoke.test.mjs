import assert from "node:assert/strict";
import { test } from "node:test";

import { checkProduction } from "./production-smoke.mjs";

const BASE_URL = "https://dr-vips.com";

function response(status, { jsonBody, textBody = "" } = {}) {
  return {
    status,
    async json() {
      return jsonBody;
    },
    async text() {
      return textBody;
    },
  };
}

const liveOk = () => response(200, { jsonBody: { status: "ok" } });
const readyOk = () => response(200, { jsonBody: { status: "ready" } });
const landingOk = () => response(200, { textBody: "<!doctype html><HTML>healthy</HTML>" });

function createLogger() {
  const calls = [];
  const logger = {};

  for (const level of ["log", "info", "warn", "error"]) {
    logger[level] = (...args) => calls.push({ level, args });
  }

  return { calls, logger };
}

function createFetchSequence(entries) {
  const calls = [];
  let index = 0;

  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const entry = entries[index];
    index += 1;

    if (entry === undefined) throw new Error("PRIVATE_UNEXPECTED_FETCH");
    if (entry instanceof Error) throw entry;
    return typeof entry === "function" ? entry(url, options) : entry;
  };

  return { calls, fetchImpl };
}

function createHealthyFetch() {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const pathname = new URL(url).pathname;
    if (pathname === "/api/health/live") return liveOk();
    if (pathname === "/api/health/ready") return readyOk();
    if (pathname === "/") return landingOk();
    throw new Error("PRIVATE_UNEXPECTED_PATH");
  };
  return { calls, fetchImpl };
}

async function captureFailure(action) {
  try {
    await action();
  } catch (error) {
    return error;
  }
  assert.fail("Expected production smoke check to fail");
}

function failureCode(error) {
  return error?.code ?? error?.message;
}

async function checkFailure({
  attempts = 1,
  delayMs = 123,
  fetchImpl,
  logger = createLogger().logger,
  sleep = async () => {},
  baseUrl = BASE_URL,
} = {}, expectedCode) {
  const error = await captureFailure(() => checkProduction({
    attempts,
    baseUrl,
    delayMs,
    fetchImpl,
    logger,
    requestTimeoutMs: 60_000,
    sleep,
  }));
  assert.equal(failureCode(error), expectedCode);
  return error;
}

test("1. healthy live, ready, and landing checks pass using public GET requests", async () => {
  const fake = createHealthyFetch();
  const { logger } = createLogger();

  await assert.doesNotReject(checkProduction({
    fetchImpl: fake.fetchImpl,
    logger,
    sleep: async () => {},
    requestTimeoutMs: 60_000,
  }));

  assert.deepEqual(fake.calls.map(({ url }) => new URL(url).pathname), [
    "/api/health/live",
    "/api/health/ready",
    "/",
  ]);
  for (const { options, url } of fake.calls) {
    assert.equal(options.method, "GET");
    assert.ok(options.signal);
    assert.equal(new URL(url).origin, BASE_URL);
  }
});

test("2. a live HTTP 500 retries the complete check", async () => {
  const fake = createFetchSequence([response(500), liveOk(), readyOk(), landingOk()]);
  const sleeps = [];

  await checkProduction({
    attempts: 2,
    delayMs: 75,
    fetchImpl: fake.fetchImpl,
    logger: createLogger().logger,
    requestTimeoutMs: 60_000,
    sleep: async (delayMs) => sleeps.push(delayMs),
  });

  assert.equal(fake.calls.length, 4);
  assert.deepEqual(sleeps, [75]);
});

test("3. an incorrect live JSON body fails with LIVE_BODY", async () => {
  const fake = createFetchSequence([response(200, { jsonBody: { status: "wrong" } })]);

  await checkFailure({ fetchImpl: fake.fetchImpl }, "LIVE_BODY");
});

test("4. readiness HTTP 503 retries and is never accepted as success", async () => {
  const fake = createFetchSequence([
    liveOk(),
    response(503, { jsonBody: { status: "not_ready" } }),
    liveOk(),
    readyOk(),
    landingOk(),
  ]);

  await assert.doesNotReject(checkProduction({
    attempts: 2,
    fetchImpl: fake.fetchImpl,
    logger: createLogger().logger,
    requestTimeoutMs: 60_000,
    sleep: async () => {},
  }));
  assert.equal(fake.calls.length, 5);
});

test("5. an incorrect ready JSON body fails with READY_BODY", async () => {
  const fake = createFetchSequence([liveOk(), response(200, { jsonBody: { status: "wrong" } })]);

  await checkFailure({ fetchImpl: fake.fetchImpl }, "READY_BODY");
});

test("6. a landing HTTP 500 fails with LANDING_HTTP", async () => {
  const fake = createFetchSequence([liveOk(), readyOk(), response(500, { textBody: "private" })]);

  const error = await checkFailure({ fetchImpl: fake.fetchImpl }, "LANDING_HTTP");
  assert.equal(error.status, 500);
});

test("7. an empty landing body fails with LANDING_BODY", async () => {
  const fake = createFetchSequence([liveOk(), readyOk(), response(200, { textBody: "" })]);

  await checkFailure({ fetchImpl: fake.fetchImpl }, "LANDING_BODY");
});

test("8. a nonempty landing body without html fails with LANDING_BODY", async () => {
  const fake = createFetchSequence([liveOk(), readyOk(), response(200, { textBody: "plain text" })]);

  await checkFailure({ fetchImpl: fake.fetchImpl }, "LANDING_BODY");
});

test("9. a rejected fetch is converted to the sanitized FETCH_FAILED code", async () => {
  const fake = createFetchSequence([new Error("PRIVATE_NETWORK_FAILURE")]);

  const error = await checkFailure({ fetchImpl: fake.fetchImpl }, "FETCH_FAILED");
  assert.equal(error.message.includes("PRIVATE_NETWORK_FAILURE"), false);
});

test("10. a timeout rejection is converted to the sanitized TIMEOUT code", async () => {
  const timeout = new Error("PRIVATE_TIMEOUT_DETAILS");
  timeout.name = "TimeoutError";
  const fake = createFetchSequence([timeout]);

  const error = await checkFailure({ fetchImpl: fake.fetchImpl }, "TIMEOUT");
  assert.equal(error.message.includes("PRIVATE_TIMEOUT_DETAILS"), false);
});

test("11. the smoke succeeds after failures in multiple earlier attempts", async () => {
  const fake = createFetchSequence([
    response(500),
    liveOk(),
    response(503),
    liveOk(),
    readyOk(),
    landingOk(),
  ]);
  const sleeps = [];

  await checkProduction({
    attempts: 3,
    delayMs: 10,
    fetchImpl: fake.fetchImpl,
    logger: createLogger().logger,
    requestTimeoutMs: 60_000,
    sleep: async (delayMs) => sleeps.push(delayMs),
  });

  assert.deepEqual(sleeps, [10, 10]);
  assert.equal(fake.calls.length, 6);
});

test("12. exhausting the bounded attempts rejects with the final allowlisted failure", async () => {
  const fake = createFetchSequence([response(500), response(500), response(500)]);

  const error = await checkFailure({ attempts: 3, fetchImpl: fake.fetchImpl }, "LIVE_HTTP");
  assert.equal(fake.calls.length, 3);
  assert.equal(error.status, 500);
});

test("13. sleep receives the configured delay between attempts", async () => {
  const fake = createFetchSequence([response(500), liveOk(), readyOk(), landingOk()]);
  const sleeps = [];

  await checkProduction({
    attempts: 2,
    delayMs: 4321,
    fetchImpl: fake.fetchImpl,
    logger: createLogger().logger,
    requestTimeoutMs: 60_000,
    sleep: async (delayMs) => sleeps.push(delayMs),
  });

  assert.deepEqual(sleeps, [4321]);
});

test("14. no sleep occurs after the last failed attempt", async () => {
  const fake = createFetchSequence([response(500), response(500)]);
  const sleeps = [];

  await checkFailure({
    attempts: 2,
    fetchImpl: fake.fetchImpl,
    sleep: async (delayMs) => sleeps.push(delayMs),
  }, "LIVE_HTTP");

  assert.equal(fake.calls.length, 2);
  assert.deepEqual(sleeps, [123]);
});

test("15. a non-HTTPS base URL is rejected before fetch", async () => {
  let fetchCalls = 0;

  const error = await checkFailure({
    baseUrl: "http://dr-vips.com",
    fetchImpl: async () => {
      fetchCalls += 1;
      return liveOk();
    },
  }, "INVALID_BASE_URL");

  assert.equal(fetchCalls, 0);
  assert.equal(Object.hasOwn(error, "cause"), false);
});

test("16. response bodies never appear in exported errors", async () => {
  const privateBody = "PRIVATE_RESPONSE_BODY";
  const fake = createFetchSequence([
    response(200, { jsonBody: { status: privateBody, detail: privateBody } }),
  ]);

  const error = await checkFailure({ fetchImpl: fake.fetchImpl }, "LIVE_BODY");
  const exposed = JSON.stringify({ code: error.code, message: error.message, cause: error.cause });
  assert.equal(exposed.includes(privateBody), false);
});

test("17. private network messages never appear in exported errors or logs", async () => {
  const privateMessage = "PRIVATE_NETWORK_HOST TOKEN_VALUE";
  const fake = createFetchSequence([new Error(privateMessage)]);
  const logging = createLogger();

  const error = await checkFailure({
    fetchImpl: fake.fetchImpl,
    logger: logging.logger,
  }, "FETCH_FAILED");
  const exposed = JSON.stringify({ error, logs: logging.calls });

  assert.equal(exposed.includes(privateMessage), false);
});

test("18. exported smoke failures never retain a cause", async () => {
  const original = new Error("PRIVATE_ORIGINAL_CAUSE");
  original.cause = new Error("PRIVATE_NESTED_CAUSE");
  const fake = createFetchSequence([original]);

  const error = await checkFailure({ fetchImpl: fake.fetchImpl }, "FETCH_FAILED");

  assert.equal(Object.hasOwn(error, "cause"), false);
  assert.notEqual(error, original);
});
