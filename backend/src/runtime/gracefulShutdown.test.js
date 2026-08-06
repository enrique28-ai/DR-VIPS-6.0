import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { createGracefulShutdown } from "./gracefulShutdown.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createFakes() {
  const events = [];
  const logs = [];
  const exits = [];
  const timers = [];
  const clearedTimers = [];
  const processRef = new EventEmitter();
  const logger = {};

  for (const level of ["info", "error"]) {
    logger[level] = (...args) => logs.push({ level, args });
  }

  const server = {
    close(callback) {
      events.push("http.close");
      callback();
    },
    closeAllConnections() {
      events.push("http.force-close");
    },
  };
  const reminderJob = {
    stop() {
      events.push("reminder.stop");
    },
  };
  const disconnectMongo = async () => {
    events.push("mongo.disconnect");
  };
  const exitProcess = (code) => {
    exits.push(code);
    events.push(`exit.${code}`);
  };
  const setTimeoutFn = (callback, timeoutMs) => {
    const handle = {
      callback,
      timeoutMs,
      unrefCalls: 0,
      unref() {
        this.unrefCalls += 1;
      },
    };
    timers.push(handle);
    return handle;
  };
  const clearTimeoutFn = (handle) => {
    clearedTimers.push(handle);
  };

  return {
    clearedTimers,
    disconnectMongo,
    events,
    exitProcess,
    exits,
    logger,
    logs,
    processRef,
    reminderJob,
    server,
    setTimeoutFn,
    clearTimeoutFn,
    timers,
  };
}

function createLifecycle(fakes, overrides = {}) {
  return createGracefulShutdown({
    server: fakes.server,
    reminderJob: fakes.reminderJob,
    disconnectMongo: fakes.disconnectMongo,
    processRef: fakes.processRef,
    exitProcess: fakes.exitProcess,
    logger: fakes.logger,
    setTimeoutFn: fakes.setTimeoutFn,
    clearTimeoutFn: fakes.clearTimeoutFn,
    ...overrides,
  });
}

function logPayloads(fakes) {
  return fakes.logs.map(({ level, args }) => {
    assert.equal(args[0], "[shutdown]");
    return { level, payload: args[1] };
  });
}

async function assertPending(promise) {
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(settled, false);
}

test("createGracefulShutdown exposes only the lifecycle API", () => {
  const fakes = createFakes();
  const lifecycle = createLifecycle(fakes);

  assert.deepEqual(Object.keys(lifecycle), [
    "shutdown",
    "registerSignalHandlers",
    "unregisterSignalHandlers",
  ]);
  for (const method of Object.values(lifecycle)) assert.equal(typeof method, "function");
});

test("registerSignalHandlers installs one SIGTERM and one SIGINT listener", () => {
  const fakes = createFakes();
  const lifecycle = createLifecycle(fakes);

  lifecycle.registerSignalHandlers();

  assert.equal(fakes.processRef.listenerCount("SIGTERM"), 1);
  assert.equal(fakes.processRef.listenerCount("SIGINT"), 1);
});

test("registerSignalHandlers is idempotent", () => {
  const fakes = createFakes();
  const lifecycle = createLifecycle(fakes);

  lifecycle.registerSignalHandlers();
  lifecycle.registerSignalHandlers();

  assert.equal(fakes.processRef.listenerCount("SIGTERM"), 1);
  assert.equal(fakes.processRef.listenerCount("SIGINT"), 1);
});

test("unregisterSignalHandlers removes both listeners idempotently", () => {
  const fakes = createFakes();
  const lifecycle = createLifecycle(fakes);
  lifecycle.registerSignalHandlers();

  lifecycle.unregisterSignalHandlers();
  lifecycle.unregisterSignalHandlers();

  assert.equal(fakes.processRef.listenerCount("SIGTERM"), 0);
  assert.equal(fakes.processRef.listenerCount("SIGINT"), 0);
});

test("an emitted SIGTERM starts shutdown with SIGTERM", async () => {
  const fakes = createFakes();
  const lifecycle = createLifecycle(fakes);
  lifecycle.registerSignalHandlers();

  fakes.processRef.emit("SIGTERM");
  assert.equal(await lifecycle.shutdown("SIGINT"), 0);

  assert.deepEqual(logPayloads(fakes)[0], {
    level: "info",
    payload: { event: "shutdown_started", signal: "SIGTERM" },
  });
});

test("an emitted SIGINT starts shutdown with SIGINT", async () => {
  const fakes = createFakes();
  const lifecycle = createLifecycle(fakes);
  lifecycle.registerSignalHandlers();

  fakes.processRef.emit("SIGINT");
  assert.equal(await lifecycle.shutdown("SIGTERM"), 0);

  assert.equal(logPayloads(fakes)[0].payload.signal, "SIGINT");
});

test("direct unknown or omitted signals are sanitized to UNKNOWN", async () => {
  for (const signal of ["PRIVATE_SIGNAL", undefined]) {
    const fakes = createFakes();
    const lifecycle = createLifecycle(fakes);

    await lifecycle.shutdown(signal);

    assert.equal(logPayloads(fakes)[0].payload.signal, "UNKNOWN");
  }
});

test("repeated shutdown calls preserve the same promise after completion", async () => {
  const fakes = createFakes();
  const lifecycle = createLifecycle(fakes);

  const first = lifecycle.shutdown("SIGTERM");
  const second = lifecycle.shutdown("SIGINT");

  assert.equal(second, first);
  await first;
  assert.equal(lifecycle.shutdown(), first);
});

test("the first signal wins and concurrent calls clean each resource once", async () => {
  const fakes = createFakes();
  const lifecycle = createLifecycle(fakes);

  await Promise.all([
    lifecycle.shutdown("SIGINT"),
    lifecycle.shutdown("SIGTERM"),
    lifecycle.shutdown("SIGTERM"),
  ]);

  assert.deepEqual(fakes.events, [
    "reminder.stop",
    "http.close",
    "mongo.disconnect",
    "exit.0",
  ]);
  assert.equal(logPayloads(fakes)[0].payload.signal, "SIGINT");
});

test("shutdown invokes reminder stop immediately before HTTP close", async () => {
  const fakes = createFakes();
  const lifecycle = createLifecycle(fakes);

  await lifecycle.shutdown("SIGTERM");

  assert.deepEqual(fakes.events.slice(0, 2), ["reminder.stop", "http.close"]);
});

test("Mongo disconnect waits for both reminder and HTTP drains", async () => {
  const fakes = createFakes();
  const reminderDrain = deferred();
  let httpCallback;
  fakes.reminderJob.stop = () => {
    fakes.events.push("reminder.stop");
    return reminderDrain.promise;
  };
  fakes.server.close = (callback) => {
    fakes.events.push("http.close");
    httpCallback = callback;
  };
  const lifecycle = createLifecycle(fakes);

  const shutdown = lifecycle.shutdown("SIGTERM");
  reminderDrain.resolve();
  await assertPending(shutdown);
  assert.equal(fakes.events.includes("mongo.disconnect"), false);
  httpCallback();

  await shutdown;
  assert.equal(fakes.events.includes("mongo.disconnect"), true);
});

test("HTTP may drain before the reminder without starting Mongo early", async () => {
  const fakes = createFakes();
  const reminderDrain = deferred();
  let httpCallback;
  fakes.reminderJob.stop = () => {
    fakes.events.push("reminder.stop");
    return reminderDrain.promise;
  };
  fakes.server.close = (callback) => {
    fakes.events.push("http.close");
    httpCallback = callback;
  };
  const lifecycle = createLifecycle(fakes);

  const shutdown = lifecycle.shutdown("SIGTERM");
  httpCallback();
  await assertPending(shutdown);
  assert.equal(fakes.events.includes("mongo.disconnect"), false);
  reminderDrain.resolve();

  await shutdown;
  assert.equal(fakes.events.includes("mongo.disconnect"), true);
});

test("successful shutdown clears its timer, removes listeners, logs complete, and exits zero", async () => {
  const fakes = createFakes();
  const lifecycle = createLifecycle(fakes);
  lifecycle.registerSignalHandlers();

  assert.equal(await lifecycle.shutdown("SIGTERM"), 0);

  assert.equal(fakes.timers.length, 1);
  assert.deepEqual(fakes.clearedTimers, [fakes.timers[0]]);
  assert.equal(fakes.processRef.listenerCount("SIGTERM"), 0);
  assert.equal(fakes.processRef.listenerCount("SIGINT"), 0);
  assert.deepEqual(fakes.exits, [0]);
  assert.deepEqual(logPayloads(fakes).at(-1), {
    level: "info",
    payload: { event: "shutdown_complete", signal: "SIGTERM", exitCode: 0 },
  });
});

test("a null reminder is skipped without changing HTTP and Mongo cleanup", async () => {
  const fakes = createFakes();
  const lifecycle = createLifecycle(fakes, { reminderJob: null });

  assert.equal(await lifecycle.shutdown("SIGTERM"), 0);

  assert.deepEqual(fakes.events, ["http.close", "mongo.disconnect", "exit.0"]);
});

test("a reminder stop failure is sanitized and does not block HTTP or Mongo cleanup", async () => {
  const fakes = createFakes();
  fakes.reminderJob.stop = () => {
    fakes.events.push("reminder.stop");
    throw new Error("PRIVATE_REMINDER_FAILURE");
  };
  const lifecycle = createLifecycle(fakes);

  assert.equal(await lifecycle.shutdown("SIGTERM"), 1);

  assert.deepEqual(fakes.events, [
    "reminder.stop",
    "http.close",
    "mongo.disconnect",
    "exit.1",
  ]);
  assert.deepEqual(logPayloads(fakes)[1], {
    level: "error",
    payload: { event: "reminder_stop_failed", stage: "reminder", signal: "SIGTERM" },
  });
});

test("an HTTP close callback error is sanitized and does not block Mongo cleanup", async () => {
  const fakes = createFakes();
  fakes.server.close = (callback) => {
    fakes.events.push("http.close");
    callback(new Error("PRIVATE_HTTP_CALLBACK_FAILURE"));
  };
  const lifecycle = createLifecycle(fakes);

  assert.equal(await lifecycle.shutdown("SIGINT"), 1);

  assert.equal(fakes.events.includes("mongo.disconnect"), true);
  assert.equal(logPayloads(fakes)[1].payload.event, "http_close_failed");
});

test("a synchronous HTTP close throw is sanitized and does not block Mongo cleanup", async () => {
  const fakes = createFakes();
  fakes.server.close = () => {
    fakes.events.push("http.close");
    throw new Error("PRIVATE_HTTP_THROW");
  };
  const lifecycle = createLifecycle(fakes);

  assert.equal(await lifecycle.shutdown("SIGTERM"), 1);

  assert.equal(fakes.events.includes("mongo.disconnect"), true);
  assert.equal(logPayloads(fakes)[1].payload.stage, "http");
});

test("a Mongo disconnect rejection still clears owned resources and exits one", async () => {
  const fakes = createFakes();
  fakes.disconnectMongo = async () => {
    fakes.events.push("mongo.disconnect");
    throw new Error("PRIVATE_MONGO_FAILURE");
  };
  const lifecycle = createLifecycle(fakes);
  lifecycle.registerSignalHandlers();

  assert.equal(await lifecycle.shutdown("SIGTERM"), 1);

  assert.deepEqual(fakes.clearedTimers, [fakes.timers[0]]);
  assert.equal(fakes.processRef.listenerCount("SIGTERM"), 0);
  assert.equal(fakes.processRef.listenerCount("SIGINT"), 0);
  assert.deepEqual(fakes.exits, [1]);
  assert.equal(logPayloads(fakes)[1].payload.event, "mongo_disconnect_failed");
});

test("multiple stage failures are each logged once and never short-circuit later cleanup", async () => {
  const fakes = createFakes();
  fakes.reminderJob.stop = () => Promise.reject(new Error("PRIVATE_REMINDER"));
  fakes.server.close = (callback) => callback(new Error("PRIVATE_HTTP"));
  fakes.disconnectMongo = () => Promise.reject(new Error("PRIVATE_MONGO"));
  const lifecycle = createLifecycle(fakes);

  assert.equal(await lifecycle.shutdown("SIGINT"), 1);

  assert.deepEqual(
    logPayloads(fakes).map(({ payload }) => payload.event),
    [
      "shutdown_started",
      "reminder_stop_failed",
      "http_close_failed",
      "mongo_disconnect_failed",
      "shutdown_complete",
    ],
  );
  assert.deepEqual(fakes.exits, [1]);
});

test("the watchdog uses the injected timeout once and unreferences its handle", async () => {
  const fakes = createFakes();
  const lifecycle = createLifecycle(fakes, { timeoutMs: 4321 });

  await lifecycle.shutdown("SIGTERM");

  assert.equal(fakes.timers.length, 1);
  assert.equal(fakes.timers[0].timeoutMs, 4321);
  assert.equal(fakes.timers[0].unrefCalls, 1);
});

test("the watchdog default is 30000 milliseconds", async () => {
  const fakes = createFakes();
  const lifecycle = createLifecycle(fakes);

  await lifecycle.shutdown("SIGTERM");

  assert.equal(fakes.timers[0].timeoutMs, 30000);
});

test("timely shutdown makes a simulated late watchdog callback harmless", async () => {
  const fakes = createFakes();
  const lifecycle = createLifecycle(fakes);

  await lifecycle.shutdown("SIGTERM");
  fakes.timers[0].callback();

  assert.deepEqual(fakes.exits, [0]);
  assert.equal(fakes.events.includes("http.force-close"), false);
  assert.equal(logPayloads(fakes).some(({ payload }) => payload.event === "shutdown_timeout"), false);
});

test("watchdog timeout force-closes once, unregisters, logs, and exits one once", async () => {
  const fakes = createFakes();
  const httpDrain = deferred();
  fakes.server.close = () => httpDrain.promise;
  const lifecycle = createLifecycle(fakes);
  lifecycle.registerSignalHandlers();

  const shutdown = lifecycle.shutdown("SIGTERM");
  fakes.timers[0].callback();
  fakes.timers[0].callback();

  assert.deepEqual(fakes.exits, [1]);
  assert.equal(fakes.events.filter((event) => event === "http.force-close").length, 1);
  assert.equal(fakes.processRef.listenerCount("SIGTERM"), 0);
  assert.equal(fakes.processRef.listenerCount("SIGINT"), 0);
  assert.deepEqual(logPayloads(fakes)[1], {
    level: "error",
    payload: {
      event: "shutdown_timeout",
      signal: "SIGTERM",
      timeoutMs: 30000,
      exitCode: 1,
    },
  });

  httpDrain.resolve();
  await shutdown;
});

test("watchdog timeout works when closeAllConnections is unavailable", async () => {
  const fakes = createFakes();
  const httpDrain = deferred();
  fakes.server = { close: () => httpDrain.promise };
  const lifecycle = createLifecycle(fakes);

  const shutdown = lifecycle.shutdown("SIGINT");
  fakes.timers[0].callback();

  assert.deepEqual(fakes.exits, [1]);
  httpDrain.resolve();
  assert.equal(await shutdown, 1);
});

test("watchdog timeout still exits once when force-close throws", async () => {
  const fakes = createFakes();
  const httpDrain = deferred();
  fakes.server.close = () => httpDrain.promise;
  fakes.server.closeAllConnections = () => {
    throw new Error("PRIVATE_FORCE_CLOSE_FAILURE");
  };
  const lifecycle = createLifecycle(fakes);

  const shutdown = lifecycle.shutdown("SIGTERM");
  fakes.timers[0].callback();
  fakes.timers[0].callback();

  assert.deepEqual(fakes.exits, [1]);
  httpDrain.resolve();
  await shutdown;
});

test("throwing logger methods never interrupt cleanup", async () => {
  const fakes = createFakes();
  const throwingLogger = {
    info() {
      throw new Error("PRIVATE_LOGGER_INFO");
    },
    error() {
      throw new Error("PRIVATE_LOGGER_ERROR");
    },
  };
  fakes.reminderJob.stop = () => {
    throw new Error("PRIVATE_REMINDER_FAILURE");
  };
  const lifecycle = createLifecycle(fakes, { logger: throwingLogger });

  assert.equal(await lifecycle.shutdown("SIGTERM"), 1);

  assert.equal(fakes.events.includes("mongo.disconnect"), true);
  assert.deepEqual(fakes.exits, [1]);
});

test("logs expose only closed fields and never private error or signal sentinels", async () => {
  const fakes = createFakes();
  const sentinels = [
    "mongodb://private-user:private-password@private-host/db",
    "PRIVATE_JWT",
    "PRIVATE_TOKEN",
    "PRIVATE_STACK",
    "PRIVATE_SIGNAL",
  ];
  const privateError = new Error(sentinels.join(" "));
  privateError.stack = sentinels[3];
  fakes.reminderJob.stop = () => Promise.reject(privateError);
  const lifecycle = createLifecycle(fakes);

  await lifecycle.shutdown(sentinels[4]);

  const allowedFields = new Set(["event", "stage", "signal", "timeoutMs", "exitCode"]);
  const exposed = JSON.stringify(fakes.logs);
  for (const { payload } of logPayloads(fakes)) {
    for (const field of Object.keys(payload)) assert.equal(allowedFields.has(field), true, field);
  }
  for (const sentinel of sentinels) assert.equal(exposed.includes(sentinel), false, sentinel);
});

test("late cleanup after timeout emits no complete event and never exits twice", async () => {
  const fakes = createFakes();
  const reminderDrain = deferred();
  const httpDrain = deferred();
  fakes.reminderJob.stop = () => reminderDrain.promise;
  fakes.server.close = () => httpDrain.promise;
  const lifecycle = createLifecycle(fakes);

  const shutdown = lifecycle.shutdown("SIGTERM");
  fakes.timers[0].callback();
  reminderDrain.resolve();
  httpDrain.resolve();

  assert.equal(await shutdown, 1);
  assert.deepEqual(fakes.exits, [1]);
  assert.equal(
    logPayloads(fakes).some(({ payload }) => payload.event === "shutdown_complete"),
    false,
  );
});

test("server source wires captured reminder, listener, Mongo disconnect, and handlers without import", async () => {
  const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");

  assert.match(serverSource, /import\s+\{\s*createGracefulShutdown\s*\}/);
  assert.match(serverSource, /connectDB\(\)\.then\s*\(\s*\(\)\s*=>\s*\{/);
  assert.match(serverSource, /const\s+reminderJob\s*=/);
  assert.match(serverSource, /process\.env\.APPT_REMINDERS_ENABLED\s*!==\s*"false"\s*\?\s*startReminderJob\(\)\s*:\s*null/);
  assert.match(serverSource, /const\s+server\s*=\s*app\.listen\s*\(/);
  assert.match(serverSource, /createGracefulShutdown\s*\(\s*\{[\s\S]*?server,[\s\S]*?reminderJob,[\s\S]*?disconnectMongo:/);
  assert.match(serverSource, /lifecycle\.registerSignalHandlers\s*\(\s*\)/);
  assert.match(serverSource, /app\.use\("\/api\/health",\s*healthRoutes\)/);
  assert.match(serverSource, /app\.use\("\/api\/auth",\s*authRoutes\)/);
  assert.match(serverSource, /app\.use\("\/api",\s*apiNotFound\)/);
  assert.match(serverSource, /app\.use\(errorHandler\)/);
  assert.equal(serverSource.includes("process.exit("), false);
});
