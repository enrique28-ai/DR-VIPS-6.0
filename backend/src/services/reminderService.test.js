import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import Appointment from "../models/Appointment.js";
import { startReminderJob } from "./reminderService.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function useLeadMinutes(t, value = "60") {
  const previous = process.env.APPT_REMINDER_MINUTES;
  process.env.APPT_REMINDER_MINUTES = value;
  t.after(() => {
    if (previous === undefined) delete process.env.APPT_REMINDER_MINUTES;
    else process.env.APPT_REMINDER_MINUTES = previous;
  });
}

function createScheduleFake(destroy = () => {}) {
  const calls = [];
  const task = { destroy };
  const schedule = (expression, callback) => {
    calls.push({ expression, callback });
    return task;
  };

  return { calls, schedule, task };
}

function mockAppointmentFind(t, promises) {
  let index = 0;
  t.mock.method(Appointment, "find", () => {
    const promise = promises[index];
    index += 1;
    let populateCalls = 0;

    return {
      populate() {
        populateCalls += 1;
        return populateCalls === 2 ? promise : this;
      },
    };
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

test("startReminderJob returns a stoppable handle and schedules one minute tick", (t) => {
  useLeadMinutes(t);
  const fake = createScheduleFake();

  const handle = startReminderJob({ schedule: fake.schedule });

  assert.equal(typeof handle.stop, "function");
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].expression, "* * * * *");
  assert.equal(typeof fake.calls[0].callback, "function");
});

test("stop destroys the scheduled task exactly once", async (t) => {
  useLeadMinutes(t);
  let destroyCalls = 0;
  const fake = createScheduleFake(() => {
    destroyCalls += 1;
  });
  const handle = startReminderJob({ schedule: fake.schedule });

  await handle.stop();
  await handle.stop();

  assert.equal(destroyCalls, 1);
});

test("stop preserves and returns the same promise", async (t) => {
  useLeadMinutes(t);
  const fake = createScheduleFake();
  const handle = startReminderJob({ schedule: fake.schedule });

  const first = handle.stop();
  const second = handle.stop();

  assert.equal(second, first);
  await first;
  assert.equal(handle.stop(), first);
});

test("stop waits for one active reminder run to drain", async (t) => {
  useLeadMinutes(t);
  const query = deferred();
  mockAppointmentFind(t, [query.promise]);
  const fake = createScheduleFake();
  const handle = startReminderJob({ schedule: fake.schedule });
  const run = fake.calls[0].callback();

  const stopping = handle.stop();
  await assertPending(stopping);
  query.resolve([]);

  await Promise.all([run, stopping]);
});

test("stop waits for every concurrently active reminder run", async (t) => {
  useLeadMinutes(t);
  const firstQuery = deferred();
  const secondQuery = deferred();
  mockAppointmentFind(t, [firstQuery.promise, secondQuery.promise]);
  const fake = createScheduleFake();
  const handle = startReminderJob({ schedule: fake.schedule });
  const firstRun = fake.calls[0].callback();
  const secondRun = fake.calls[0].callback();

  const stopping = handle.stop();
  firstQuery.resolve([]);
  await firstRun;
  await assertPending(stopping);
  secondQuery.resolve([]);

  await Promise.all([secondRun, stopping]);
});

test("a fulfilled reminder run is removed before a later stop", async (t) => {
  useLeadMinutes(t);
  mockAppointmentFind(t, [Promise.resolve([])]);
  const fake = createScheduleFake();
  const handle = startReminderJob({ schedule: fake.schedule });

  await fake.calls[0].callback();

  await handle.stop();
});

test("a rejected reminder run is removed before a later stop", async (t) => {
  useLeadMinutes(t);
  const privateError = new Error("PRIVATE_REMINDER_QUERY");
  mockAppointmentFind(t, [Promise.reject(privateError)]);
  t.mock.method(console, "error", () => {
    throw new Error("LOGGER_FAILED");
  });
  const fake = createScheduleFake();
  const handle = startReminderJob({ schedule: fake.schedule });

  await assert.rejects(fake.calls[0].callback(), /LOGGER_FAILED/);

  await handle.stop();
});

test("stop supports a synchronous task destroy", async (t) => {
  useLeadMinutes(t);
  const events = [];
  const fake = createScheduleFake(() => {
    events.push("destroy");
  });
  const handle = startReminderJob({ schedule: fake.schedule });

  await handle.stop();

  assert.deepEqual(events, ["destroy"]);
});

test("stop awaits an asynchronous task destroy", async (t) => {
  useLeadMinutes(t);
  const destroy = deferred();
  const fake = createScheduleFake(() => destroy.promise);
  const handle = startReminderJob({ schedule: fake.schedule });

  const stopping = handle.stop();
  await assertPending(stopping);
  destroy.resolve();

  await stopping;
});

test("a synchronous destroy failure still drains active work before rejecting", async (t) => {
  useLeadMinutes(t);
  const query = deferred();
  mockAppointmentFind(t, [query.promise]);
  const fake = createScheduleFake(() => {
    throw new Error("PRIVATE_DESTROY_FAILURE");
  });
  const handle = startReminderJob({ schedule: fake.schedule });
  const run = fake.calls[0].callback();

  const stopping = handle.stop();
  await assertPending(stopping);
  query.resolve([]);
  await run;

  await assert.rejects(stopping, {
    message: "REMINDER_DESTROY_FAILED",
  });
});

test("an asynchronous destroy failure still drains active work before rejecting", async (t) => {
  useLeadMinutes(t);
  const query = deferred();
  const destroy = deferred();
  mockAppointmentFind(t, [query.promise]);
  const fake = createScheduleFake(() => destroy.promise);
  const handle = startReminderJob({ schedule: fake.schedule });
  const run = fake.calls[0].callback();

  const stopping = handle.stop();
  destroy.reject(new Error("PRIVATE_ASYNC_DESTROY_FAILURE"));
  await assertPending(stopping);
  query.resolve([]);
  await run;

  await assert.rejects(stopping, {
    message: "REMINDER_DESTROY_FAILED",
  });
});

test("tick failures log only the constant sanitized reminder event", async (t) => {
  useLeadMinutes(t);
  const sentinels = [
    "PRIVATE_MONGO_URI",
    "PRIVATE_TOKEN",
    "PRIVATE_REMINDER_STACK",
  ];
  const privateError = new Error(sentinels.join(" "));
  privateError.stack = sentinels[2];
  mockAppointmentFind(t, [Promise.reject(privateError)]);
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  const fake = createScheduleFake();
  startReminderJob({ schedule: fake.schedule });

  await fake.calls[0].callback();

  assert.deepEqual(logs, [[
    "[reminder-error]",
    { event: "reminder_tick_failed" },
  ]]);
  const exposed = JSON.stringify(logs);
  for (const sentinel of sentinels) {
    assert.equal(exposed.includes(sentinel), false, sentinel);
  }
});

test("the injected schedule path owns no real timers", async (t) => {
  useLeadMinutes(t);
  const fake = createScheduleFake();

  startReminderJob({ schedule: fake.schedule });

  const source = await readFile(new URL("./reminderService.js", import.meta.url), "utf8");
  assert.equal(/\bset(?:Timeout|Interval)\s*\(/.test(source), false);
  assert.equal(fake.calls.length, 1);
});
