import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { connectDB, sleepMs } from "./db.js";

const PRIVATE_URI = "mongodb://private-user:private-password@private-host/private-db";
const MONGOOSE_OPTIONS = {
  serverSelectionTimeoutMS: 8000,
  socketTimeoutMS: 20000,
  family: 4,
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(count = 8) {
  for (let index = 0; index < count; index += 1) await Promise.resolve();
}

function createLogger({ throws = false } = {}) {
  const calls = [];
  const logger = {};

  for (const level of ["info", "error"]) {
    logger[level] = (...args) => {
      if (throws) throw new Error("PRIVATE_LOGGER_FAILURE");
      calls.push({ level, args });
    };
  }

  return { calls, logger };
}

function payloads(calls) {
  return calls.map(({ level, args }) => {
    assert.equal(args[0], "[startup]");
    assert.equal(args.length, 2);
    return { level, payload: args[1] };
  });
}

test("connectDB returns the first successful result without sleeping", async () => {
  const connection = { connection: "fake" };
  const connectCalls = [];
  const sleeps = [];
  const { calls, logger } = createLogger();

  const result = await connectDB({
    connect: async (uri, options) => {
      connectCalls.push({ uri, options });
      return connection;
    },
    uri: PRIVATE_URI,
    sleep: async (delayMs) => sleeps.push(delayMs),
    logger,
  });

  assert.equal(result, connection);
  assert.deepEqual(connectCalls, [{ uri: PRIVATE_URI, options: MONGOOSE_OPTIONS }]);
  assert.deepEqual(sleeps, []);
  assert.deepEqual(payloads(calls), [
    {
      level: "info",
      payload: {
        event: "mongo_connect_attempt",
        stage: "mongo",
        attempt: 1,
        maxAttempts: 3,
      },
    },
    {
      level: "info",
      payload: {
        event: "mongo_connect_success",
        stage: "mongo",
        attempt: 1,
        maxAttempts: 3,
      },
    },
  ]);
});

test("connectDB retries once after 1000 ms and returns the second result", async () => {
  const connection = { connection: "second" };
  const sleeps = [];
  let attempts = 0;

  const result = await connectDB({
    connect: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("PRIVATE_FIRST_FAILURE");
      return connection;
    },
    uri: PRIVATE_URI,
    sleep: async (delayMs) => sleeps.push(delayMs),
    logger: createLogger().logger,
  });

  assert.equal(result, connection);
  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [1000]);
});

test("connectDB retries twice using 1000 and 2000 ms before third-attempt success", async () => {
  const connection = { connection: "third" };
  const connectCalls = [];
  const sleeps = [];
  const { calls, logger } = createLogger();

  const result = await connectDB({
    connect: async (uri, options) => {
      connectCalls.push({ uri, options });
      if (connectCalls.length < 3) throw new Error(`PRIVATE_FAILURE_${connectCalls.length}`);
      return connection;
    },
    uri: PRIVATE_URI,
    sleep: async (delayMs) => sleeps.push(delayMs),
    logger,
  });

  assert.equal(result, connection);
  assert.equal(connectCalls.length, 3);
  assert.deepEqual(sleeps, [1000, 2000]);
  for (const call of connectCalls) {
    assert.equal(call.uri, PRIVATE_URI);
    assert.deepEqual(call.options, MONGOOSE_OPTIONS);
  }
  assert.deepEqual(
    payloads(calls)
      .filter(({ payload }) => payload.event === "mongo_connect_retry")
      .map(({ payload }) => ({ attempt: payload.attempt, delayMs: payload.delayMs })),
    [
      { attempt: 1, delayMs: 1000 },
      { attempt: 2, delayMs: 2000 },
    ],
  );
});

test("three failures stop at three calls with no final sleep and a constant fresh error", async () => {
  const privateError = new Error("PRIVATE_ORIGINAL_ERROR");
  privateError.cause = new Error("PRIVATE_CAUSE");
  privateError.stack = "PRIVATE_STACK";
  const sleeps = [];
  let attempts = 0;

  let finalError;
  try {
    await connectDB({
      connect: async () => {
        attempts += 1;
        throw privateError;
      },
      uri: PRIVATE_URI,
      sleep: async (delayMs) => sleeps.push(delayMs),
      logger: createLogger().logger,
    });
  } catch (error) {
    finalError = error;
  }

  assert.equal(attempts, 3);
  assert.deepEqual(sleeps, [1000, 2000]);
  assert.ok(finalError instanceof Error);
  assert.notEqual(finalError, privateError);
  assert.equal(finalError.message, "MONGO_CONNECT_FAILED");
  assert.equal(Object.hasOwn(finalError, "cause"), false);
  assert.equal(String(finalError).includes("PRIVATE_ORIGINAL_ERROR"), false);
});

test("connect attempts remain strictly sequential with at most one active call", async () => {
  const gates = [deferred(), deferred(), deferred()];
  const callEvents = [];
  let active = 0;
  let maxActive = 0;

  const connecting = connectDB({
    connect: async () => {
      const attempt = callEvents.filter((event) => event.startsWith("start")).length;
      active += 1;
      maxActive = Math.max(maxActive, active);
      callEvents.push(`start.${attempt + 1}`);
      try {
        return await gates[attempt].promise;
      } finally {
        active -= 1;
        callEvents.push(`end.${attempt + 1}`);
      }
    },
    uri: PRIVATE_URI,
    sleep: async (delayMs) => callEvents.push(`sleep.${delayMs}`),
    logger: createLogger().logger,
  });

  await Promise.resolve();
  assert.deepEqual(callEvents, ["start.1"]);
  gates[0].reject(new Error("PRIVATE_FIRST"));
  await flushMicrotasks();
  assert.deepEqual(callEvents, ["start.1", "end.1", "sleep.1000", "start.2"]);
  gates[1].reject(new Error("PRIVATE_SECOND"));
  await flushMicrotasks();
  assert.deepEqual(callEvents.slice(-3), ["end.2", "sleep.2000", "start.3"]);
  const connection = { connection: "sequential" };
  gates[2].resolve(connection);

  assert.equal(await connecting, connection);
  assert.equal(maxActive, 1);
});

test("throwing logger methods do not alter retry success or final failure", async () => {
  let successAttempts = 0;
  const success = await connectDB({
    connect: async () => {
      successAttempts += 1;
      if (successAttempts === 1) throw new Error("PRIVATE_TRANSIENT");
      return "connected";
    },
    uri: PRIVATE_URI,
    sleep: async () => {},
    logger: createLogger({ throws: true }).logger,
  });

  assert.equal(success, "connected");
  await assert.rejects(
    connectDB({
      connect: async () => {
        throw new Error("PRIVATE_PERSISTENT");
      },
      uri: PRIVATE_URI,
      sleep: async () => {},
      logger: createLogger({ throws: true }).logger,
    }),
    { message: "MONGO_CONNECT_FAILED" },
  );
});

test("database logs use only allowlisted fields and expose no URI or private errors", async () => {
  const sentinels = [PRIVATE_URI, "PRIVATE_TOKEN", "PRIVATE_STACK", "PRIVATE_CAUSE"];
  const privateError = new Error(sentinels.join(" "));
  privateError.stack = sentinels[2];
  privateError.cause = new Error(sentinels[3]);
  const { calls, logger } = createLogger();

  await assert.rejects(
    connectDB({
      connect: async () => {
        throw privateError;
      },
      uri: PRIVATE_URI,
      sleep: async () => {},
      logger,
    }),
    { message: "MONGO_CONNECT_FAILED" },
  );

  const allowedFields = new Set(["event", "stage", "attempt", "maxAttempts", "delayMs"]);
  const allowedEvents = new Set([
    "mongo_connect_attempt",
    "mongo_connect_retry",
    "mongo_connect_success",
    "mongo_connect_failed",
  ]);
  const exposed = JSON.stringify(calls);
  for (const { payload } of payloads(calls)) {
    assert.equal(allowedEvents.has(payload.event), true, payload.event);
    for (const field of Object.keys(payload)) {
      assert.equal(allowedFields.has(field), true, field);
    }
    assert.equal(payload.stage, "mongo");
  }
  for (const sentinel of sentinels) assert.equal(exposed.includes(sentinel), false, sentinel);
});

test("connectDB owns no process exit and preserves the exact options on failures", async () => {
  const optionsSeen = [];
  const source = await readFile(new URL("./db.js", import.meta.url), "utf8");

  await assert.rejects(
    connectDB({
      connect: async (_uri, options) => {
        optionsSeen.push(options);
        throw new Error("PRIVATE_FAILURE");
      },
      uri: PRIVATE_URI,
      sleep: async () => {},
      logger: createLogger().logger,
    }),
    { message: "MONGO_CONNECT_FAILED" },
  );

  assert.equal(/process\.exit\s*\(/.test(source), false);
  assert.equal(optionsSeen.length, 3);
  for (const options of optionsSeen) assert.deepEqual(options, MONGOOSE_OPTIONS);
});

test("sleepMs delegates once to a referenced timeout and never calls unref", async () => {
  const handles = [];
  const delays = [];
  const handle = {
    unrefCalls: 0,
    unref() {
      this.unrefCalls += 1;
    },
  };

  await sleepMs(1234, {
    setTimeoutFn(callback, delayMs) {
      delays.push(delayMs);
      handles.push(handle);
      callback();
      return handle;
    },
  });

  assert.deepEqual(delays, [1234]);
  assert.deepEqual(handles, [handle]);
  assert.equal(handle.unrefCalls, 0);
});
