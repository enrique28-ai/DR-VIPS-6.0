import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { createStartup, validateRequiredEnv } from "./startup.js";

const VALID_ENV = Object.freeze({
  MONGO_URI: "mongodb://private-user:private-password@private-host/private-db",
  JWT_SECRET: "PRIVATE_JWT_SECRET",
  PENDING_SECRET: "PRIVATE_PENDING_SECRET",
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createFakes(overrides = {}) {
  const events = [];
  const exits = [];
  const logs = [];
  const reminderJob = {
    async stop() {
      events.push("reminder.stop");
    },
  };
  const server = {
    close(callback) {
      events.push("http.close");
      callback();
    },
  };
  const lifecycle = {
    registerSignalHandlers() {
      events.push("lifecycle.register");
    },
    unregisterSignalHandlers() {
      events.push("lifecycle.unregister");
    },
  };
  const logger = {
    info(...args) {
      logs.push({ level: "info", args });
    },
    error(...args) {
      logs.push({ level: "error", args });
    },
  };

  const dependencies = {
    env: { ...VALID_ENV },
    async connectMongo(options) {
      events.push("mongo.connect");
      assert.equal(options.uri, VALID_ENV.MONGO_URI);
      return { connection: "fake" };
    },
    startReminder() {
      events.push("reminder.start");
      return reminderJob;
    },
    listenHttp() {
      events.push("http.listen");
      return server;
    },
    createLifecycle(options) {
      events.push("lifecycle.create");
      assert.equal(options.server, server);
      assert.equal(options.reminderJob, reminderJob);
      assert.equal(options.disconnectMongo, dependencies.disconnectMongo);
      return lifecycle;
    },
    async disconnectMongo() {
      events.push("mongo.disconnect");
    },
    requestExit(exitCode) {
      exits.push(exitCode);
      events.push(`exit.${exitCode}`);
    },
    logger,
  };

  Object.assign(dependencies, overrides);
  return { dependencies, events, exits, lifecycle, logs, reminderJob, server };
}

function logPayloads(logs) {
  return logs.map(({ level, args }) => {
    assert.equal(args[0], "[startup]");
    assert.equal(args.length, 2);
    return { level, payload: args[1] };
  });
}

test("validateRequiredEnv accepts exactly the three required nonblank strings", () => {
  assert.doesNotThrow(() => validateRequiredEnv({ ...VALID_ENV }));
  assert.doesNotThrow(() => validateRequiredEnv({ ...VALID_ENV, OPTIONAL_VALUE: null }));
});

test("validateRequiredEnv rejects missing, undefined, null, empty, and whitespace values", () => {
  const invalidValues = [undefined, null, "", "   ", "\t\r\n", 123, false];

  for (const key of ["MONGO_URI", "JWT_SECRET", "PENDING_SECRET"]) {
    for (const value of invalidValues) {
      const env = { ...VALID_ENV, [key]: value };
      let thrown;
      try {
        validateRequiredEnv(env);
      } catch (error) {
        thrown = error;
      }

      assert.ok(thrown instanceof Error, `${key}:${String(value)}`);
      assert.equal(thrown.message, "STARTUP_VALIDATION_FAILED");
      assert.equal(Object.hasOwn(thrown, "cause"), false);
      assert.equal(thrown.message.includes(key), false);
    }
  }

  assert.throws(() => validateRequiredEnv({}), { message: "STARTUP_VALIDATION_FAILED" });
});

test("validation failure occurs before Mongo and logs only its dedicated event", async () => {
  let connectCalls = 0;
  const fakes = createFakes({
    env: { ...VALID_ENV, JWT_SECRET: "   " },
    async connectMongo() {
      connectCalls += 1;
    },
  });

  const result = await createStartup(fakes.dependencies).start();

  assert.deepEqual(result, { started: false, exitCode: 1, stage: "validation" });
  assert.equal(connectCalls, 0);
  assert.deepEqual(fakes.events, ["exit.1"]);
  assert.deepEqual(logPayloads(fakes.logs), [
    {
      level: "error",
      payload: {
        event: "startup_validation_failed",
        stage: "validation",
        exitCode: 1,
      },
    },
  ]);
});

test("successful startup preserves validation, Mongo, reminder, HTTP, lifecycle, handlers order", async () => {
  const fakes = createFakes();
  const result = await createStartup(fakes.dependencies).start();

  assert.deepEqual(fakes.events, [
    "mongo.connect",
    "reminder.start",
    "http.listen",
    "lifecycle.create",
    "lifecycle.register",
  ]);
  assert.deepEqual(result, {
    started: true,
    server: fakes.server,
    reminderJob: fakes.reminderJob,
    lifecycle: fakes.lifecycle,
  });
  assert.deepEqual(fakes.exits, []);
  assert.deepEqual(logPayloads(fakes.logs).at(-1), {
    level: "info",
    payload: { event: "startup_success", stage: "lifecycle" },
  });
});

test("disabled reminders are omitted and lifecycle receives a null job", async () => {
  let reminderCalls = 0;
  let lifecycleOptions;
  const fakes = createFakes({
    env: { ...VALID_ENV, APPT_REMINDERS_ENABLED: "false" },
    startReminder() {
      reminderCalls += 1;
    },
    createLifecycle(options) {
      fakes.events.push("lifecycle.create");
      lifecycleOptions = options;
      return fakes.lifecycle;
    },
  });

  const result = await createStartup(fakes.dependencies).start();

  assert.equal(reminderCalls, 0);
  assert.equal(result.reminderJob, null);
  assert.equal(lifecycleOptions.reminderJob, null);
  assert.equal(lifecycleOptions.server, fakes.server);
  assert.equal(lifecycleOptions.disconnectMongo, fakes.dependencies.disconnectMongo);
});

test("repeated and concurrent starts preserve one promise and one resource graph", async () => {
  const mongo = deferred();
  const fakes = createFakes({
    connectMongo() {
      fakes.events.push("mongo.connect");
      return mongo.promise;
    },
  });
  const startup = createStartup(fakes.dependencies);

  const first = startup.start();
  const second = startup.start();
  assert.equal(second, first);
  assert.deepEqual(fakes.events, ["mongo.connect"]);

  mongo.resolve({ connection: "fake" });
  await first;
  assert.equal(startup.start(), first);
  assert.equal(fakes.events.filter((event) => event === "reminder.start").length, 1);
  assert.equal(fakes.events.filter((event) => event === "http.listen").length, 1);
  assert.equal(fakes.events.filter((event) => event === "lifecycle.create").length, 1);
  assert.equal(fakes.events.filter((event) => event === "lifecycle.register").length, 1);
});

test("Mongo failure starts no later resources, disconnects best-effort, and exits once", async () => {
  const privateError = new Error("mongodb://PRIVATE_USER:PRIVATE_PASSWORD@PRIVATE_HOST/db");
  privateError.stack = "PRIVATE_MONGO_STACK";
  const fakes = createFakes({
    async connectMongo() {
      fakes.events.push("mongo.connect");
      throw privateError;
    },
  });
  const startup = createStartup(fakes.dependencies);

  const first = startup.start();
  const result = await first;

  assert.deepEqual(result, { started: false, exitCode: 1, stage: "mongo" });
  assert.deepEqual(fakes.events, ["mongo.connect", "mongo.disconnect", "exit.1"]);
  assert.equal(fakes.events.includes("reminder.start"), false);
  assert.equal(fakes.events.includes("http.listen"), false);
  assert.equal(fakes.events.includes("lifecycle.create"), false);
  assert.deepEqual(fakes.exits, [1]);
  assert.equal(startup.start(), first);
  assert.deepEqual(fakes.exits, [1]);
});

test("reminder failure cleans Mongo and reports reminder stage", async () => {
  const fakes = createFakes({
    startReminder() {
      fakes.events.push("reminder.start");
      throw new Error("PRIVATE_REMINDER_FAILURE");
    },
  });

  const result = await createStartup(fakes.dependencies).start();

  assert.deepEqual(result, { started: false, exitCode: 1, stage: "reminder" });
  assert.deepEqual(fakes.events, ["mongo.connect", "reminder.start", "mongo.disconnect", "exit.1"]);
});

test("HTTP failure stops the reminder before disconnecting Mongo", async () => {
  const fakes = createFakes({
    listenHttp() {
      fakes.events.push("http.listen");
      throw new Error("PRIVATE_HTTP_FAILURE");
    },
  });

  const result = await createStartup(fakes.dependencies).start();

  assert.deepEqual(result, { started: false, exitCode: 1, stage: "http" });
  assert.deepEqual(fakes.events, [
    "mongo.connect",
    "reminder.start",
    "http.listen",
    "reminder.stop",
    "mongo.disconnect",
    "exit.1",
  ]);
});

test("lifecycle creation failure closes HTTP, stops reminder, then disconnects Mongo", async () => {
  const fakes = createFakes({
    createLifecycle() {
      fakes.events.push("lifecycle.create");
      throw new Error("PRIVATE_LIFECYCLE_CREATE");
    },
  });

  const result = await createStartup(fakes.dependencies).start();

  assert.deepEqual(result, { started: false, exitCode: 1, stage: "lifecycle" });
  assert.deepEqual(fakes.events, [
    "mongo.connect",
    "reminder.start",
    "http.listen",
    "lifecycle.create",
    "reminder.stop",
    "http.close",
    "mongo.disconnect",
    "exit.1",
  ]);
});

test("handler registration failure unregisters lifecycle before other cleanup", async () => {
  const fakes = createFakes();
  fakes.lifecycle.registerSignalHandlers = () => {
    fakes.events.push("lifecycle.register");
    throw new Error("PRIVATE_REGISTER_FAILURE");
  };

  const result = await createStartup(fakes.dependencies).start();

  assert.deepEqual(result, { started: false, exitCode: 1, stage: "lifecycle" });
  assert.deepEqual(fakes.events, [
    "mongo.connect",
    "reminder.start",
    "http.listen",
    "lifecycle.create",
    "lifecycle.register",
    "lifecycle.unregister",
    "reminder.stop",
    "http.close",
    "mongo.disconnect",
    "exit.1",
  ]);
});

test("cleanup failures never short-circuit later cleanup or the single exit request", async () => {
  const fakes = createFakes({
    async disconnectMongo() {
      fakes.events.push("mongo.disconnect");
      throw new Error("PRIVATE_DISCONNECT_FAILURE");
    },
  });
  fakes.reminderJob.stop = () => {
    fakes.events.push("reminder.stop");
    throw new Error("PRIVATE_STOP_FAILURE");
  };
  fakes.server.close = (callback) => {
    fakes.events.push("http.close");
    callback(new Error("PRIVATE_CLOSE_CALLBACK"));
  };
  fakes.lifecycle.registerSignalHandlers = () => {
    fakes.events.push("lifecycle.register");
    throw new Error("PRIVATE_REGISTER_FAILURE");
  };
  fakes.lifecycle.unregisterSignalHandlers = () => {
    fakes.events.push("lifecycle.unregister");
    throw new Error("PRIVATE_UNREGISTER_FAILURE");
  };

  const result = await createStartup(fakes.dependencies).start();

  assert.deepEqual(result, { started: false, exitCode: 1, stage: "lifecycle" });
  assert.deepEqual(fakes.events.slice(-5), [
    "lifecycle.unregister",
    "reminder.stop",
    "http.close",
    "mongo.disconnect",
    "exit.1",
  ]);
  assert.deepEqual(fakes.exits, [1]);
});

test("cleanup supports promise-returning HTTP close and synchronous reminder stop", async () => {
  const closeDrain = deferred();
  const fakes = createFakes({
    createLifecycle() {
      fakes.events.push("lifecycle.create");
      throw new Error("PRIVATE_CREATE_FAILURE");
    },
  });
  fakes.reminderJob.stop = () => fakes.events.push("reminder.stop");
  fakes.server.close = () => {
    fakes.events.push("http.close");
    return closeDrain.promise;
  };

  const starting = createStartup(fakes.dependencies).start();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fakes.events.includes("mongo.disconnect"), false);
  closeDrain.resolve();

  const result = await starting;
  assert.equal(result.stage, "lifecycle");
  assert.deepEqual(fakes.events.slice(-4), [
    "reminder.stop",
    "http.close",
    "mongo.disconnect",
    "exit.1",
  ]);
});

test("a synchronous HTTP close throw still permits Mongo cleanup and exit", async () => {
  const fakes = createFakes({
    createLifecycle() {
      fakes.events.push("lifecycle.create");
      throw new Error("PRIVATE_CREATE_FAILURE");
    },
  });
  fakes.server.close = () => {
    fakes.events.push("http.close");
    throw new Error("PRIVATE_CLOSE_THROW");
  };

  const result = await createStartup(fakes.dependencies).start();

  assert.equal(result.stage, "lifecycle");
  assert.deepEqual(fakes.events.slice(-3), ["http.close", "mongo.disconnect", "exit.1"]);
});

test("throwing requestExit is swallowed, called once, and never rejects start", async () => {
  let exitCalls = 0;
  const fakes = createFakes({
    env: { ...VALID_ENV, MONGO_URI: "" },
    requestExit(exitCode) {
      exitCalls += 1;
      assert.equal(exitCode, 1);
      throw new Error("PRIVATE_EXIT_FAILURE");
    },
  });
  const startup = createStartup(fakes.dependencies);

  const first = startup.start();
  const second = startup.start();

  assert.equal(second, first);
  assert.deepEqual(await first, { started: false, exitCode: 1, stage: "validation" });
  assert.equal(exitCalls, 1);
  assert.equal(startup.start(), first);
  assert.equal(exitCalls, 1);
});

test("throwing logger methods cannot change successful or failed startup", async () => {
  const throwingLogger = {
    info() {
      throw new Error("PRIVATE_LOGGER_INFO");
    },
    error() {
      throw new Error("PRIVATE_LOGGER_ERROR");
    },
  };
  const successFakes = createFakes({ logger: throwingLogger });
  const failedFakes = createFakes({
    logger: throwingLogger,
    async connectMongo() {
      throw new Error("PRIVATE_MONGO_FAILURE");
    },
  });

  assert.equal((await createStartup(successFakes.dependencies).start()).started, true);
  assert.deepEqual(await createStartup(failedFakes.dependencies).start(), {
    started: false,
    exitCode: 1,
    stage: "mongo",
  });
});

test("startup logs expose only allowlisted fields and no private error or environment values", async () => {
  const sentinels = [
    VALID_ENV.MONGO_URI,
    VALID_ENV.JWT_SECRET,
    VALID_ENV.PENDING_SECRET,
    "PRIVATE_ERROR_MESSAGE",
    "PRIVATE_STACK",
    "PRIVATE_CAUSE",
  ];
  const privateError = new Error(sentinels[3]);
  privateError.stack = sentinels[4];
  privateError.cause = new Error(sentinels[5]);
  const fakes = createFakes({
    async connectMongo() {
      throw privateError;
    },
  });

  await createStartup(fakes.dependencies).start();

  const allowedFields = new Set(["event", "stage", "exitCode"]);
  const allowedEvents = new Set([
    "startup_validation_failed",
    "startup_failed",
    "startup_success",
  ]);
  const exposed = JSON.stringify(fakes.logs);
  for (const { payload } of logPayloads(fakes.logs)) {
    assert.equal(allowedEvents.has(payload.event), true, payload.event);
    for (const field of Object.keys(payload)) assert.equal(allowedFields.has(field), true, field);
  }
  for (const sentinel of sentinels) assert.equal(exposed.includes(sentinel), false, sentinel);
});

test("every production failure stage resolves a stable result without an unhandled rejection", async () => {
  const scenarios = [
    ["validation", { env: { ...VALID_ENV, PENDING_SECRET: null } }],
    ["mongo", { connectMongo: async () => Promise.reject(new Error("PRIVATE_MONGO")) }],
    ["reminder", { startReminder: () => { throw new Error("PRIVATE_REMINDER"); } }],
    ["http", { listenHttp: () => { throw new Error("PRIVATE_HTTP"); } }],
    ["lifecycle", { createLifecycle: () => { throw new Error("PRIVATE_LIFECYCLE"); } }],
  ];

  for (const [stage, overrides] of scenarios) {
    const fakes = createFakes(overrides);
    const result = await createStartup(fakes.dependencies).start();
    assert.deepEqual(result, { started: false, exitCode: 1, stage });
    assert.deepEqual(fakes.exits, [1]);
    assert.deepEqual(logPayloads(fakes.logs), [
      {
        level: "error",
        payload: {
          event: stage === "validation" ? "startup_validation_failed" : "startup_failed",
          stage,
          exitCode: 1,
        },
      },
    ]);
  }
});

test("server source delegates startup once without importing or starting it in this test", async () => {
  const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");

  assert.match(serverSource, /import\s+\{\s*createStartup\s*\}\s+from\s+["']\.\/runtime\/startup\.js["']/);
  assert.equal((serverSource.match(/createStartup\s*\(/g) ?? []).length, 1);
  assert.match(serverSource, /const\s+startup\s*=\s*createStartup\s*\(\s*\{/);
  assert.match(serverSource, /env:\s*process\.env/);
  assert.match(serverSource, /connectMongo:\s*connectDB/);
  assert.match(serverSource, /startReminder:\s*startReminderJob/);
  assert.match(serverSource, /createLifecycle:\s*createGracefulShutdown/);
  assert.match(serverSource, /disconnectMongo:\s*\(\)\s*=>\s*mongoose\.disconnect\s*\(\s*\)/);
  assert.match(serverSource, /requestExit:\s*\(\s*exitCode\s*\)\s*=>\s*\{\s*process\.exitCode\s*=\s*exitCode;?\s*\}/);
  assert.match(serverSource, /void\s+startup\.start\s*\(\s*\)/);

  const listenMatches = [...serverSource.matchAll(/app\.listen\s*\(/g)];
  assert.equal(listenMatches.length, 1);
  const listenHttpIndex = serverSource.indexOf("listenHttp:");
  assert.ok(listenHttpIndex >= 0);
  assert.ok(listenMatches[0].index > listenHttpIndex);

  assert.equal(serverSource.includes("connectDB().then"), false);
  assert.equal(/process\.exit\s*\(/.test(serverSource), false);
  assert.equal(/\brequiredEnv\b/.test(serverSource), false);
});
