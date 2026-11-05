import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { EventEmitter } from "node:events";
import jwt from "jsonwebtoken";

import User from "../models/User.js";
import { createAuthMeRequestTiming } from "../runtime/timing.js";

const USER_ID = "64b000000000000000000001";
const JWT_SECRET = "phase-16b3-session-version-secret";
const originalFindById = User.findById;
let protect;

before(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  ({ protect } = await import("./auth.js"));
});

beforeEach(() => {
  User.findById = originalFindById;
});

after(() => {
  User.findById = originalFindById;
});

function makeReq(token) {
  return { cookies: { token } };
}

function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function attachResponseEvents(res) {
  const events = new EventEmitter();
  res.once = events.once.bind(events);
  res.emit = events.emit.bind(events);
  return res;
}

function attachAuthMeTiming(req, res, logs) {
  let time = 0;
  let nextCalls = 0;
  createAuthMeRequestTiming({
    logger: {
      info: (prefix, payload) => logs.push({ level: "info", prefix, payload }),
      error: (prefix, payload) => logs.push({ level: "error", prefix, payload }),
    },
    now: () => time++,
    createUuid: () => "123e4567-e89b-42d3-a456-426614174000",
  })(
    Object.assign(req, { method: "GET", path: "/api/auth/me", headers: {} }),
    attachResponseEvents(res),
    () => { nextCalls += 1; },
  );
  assert.equal(nextCalls, 1);
}

function queryFor(user, onSelect = () => {}) {
  const promise = Promise.resolve(user);
  return {
    select(projection) {
      onSelect(projection);
      return promise;
    },
    then(resolve, reject) {
      return promise.then(resolve, reject);
    },
    catch(reject) {
      return promise.catch(reject);
    },
  };
}

function rejectingQuery(error, onSelect = () => {}) {
  const promise = Promise.reject(error);
  return {
    select(projection) {
      onSelect(projection);
      return promise;
    },
    then(resolve, reject) {
      return promise.then(resolve, reject);
    },
    catch(reject) {
      return promise.catch(reject);
    },
  };
}

async function runProtect({ claim = {}, userVersion = 0, omitUserVersion = false }) {
  const token = jwt.sign({ userId: USER_ID, ...claim }, JWT_SECRET, { expiresIn: "7d" });
  const user = { _id: USER_ID, sessionVersion: userVersion };
  if (omitUserVersion) delete user.sessionVersion;
  let selected = "";
  User.findById = (id) => {
    assert.equal(id, USER_ID);
    return queryFor(user, (projection) => { selected = projection; });
  };
  const req = makeReq(token);
  const res = makeRes();
  let nextCalls = 0;

  await protect(req, res, () => { nextCalls += 1; });

  return { nextCalls, req, res, selected, user };
}

test("protect accepts a JWT whose sessionVersion matches the User", async () => {
  const result = await runProtect({ claim: { sessionVersion: 3 }, userVersion: 3 });

  assert.equal(result.nextCalls, 1);
  assert.equal(result.req.user, result.user);
  assert.match(result.selected, /sessionVersion/);
});

test("protect rejects a request without an auth token", async () => {
  const req = { cookies: {} };
  const res = makeRes();
  let nextCalls = 0;

  await protect(req, res, () => { nextCalls += 1; });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Not authenticated" });
  assert.equal(nextCalls, 0);
  assert.equal(req.user, undefined);
});

test("protect rejects an invalid JWT", async () => {
  const req = makeReq("not-a-jwt");
  const res = makeRes();
  let nextCalls = 0;

  await protect(req, res, () => { nextCalls += 1; });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Unauthorized" });
  assert.equal(nextCalls, 0);
  assert.equal(req.user, undefined);
});

test("protect rejects an expired JWT", async () => {
  const token = jwt.sign(
    { userId: USER_ID, sessionVersion: 0 },
    JWT_SECRET,
    { expiresIn: -1 },
  );
  const req = makeReq(token);
  const res = makeRes();
  let nextCalls = 0;

  await protect(req, res, () => { nextCalls += 1; });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Unauthorized" });
  assert.equal(nextCalls, 0);
  assert.equal(req.user, undefined);
});

test("protect rejects an invalid userId when User lookup raises CastError", async () => {
  const token = jwt.sign(
    { userId: "not-an-object-id", sessionVersion: 0 },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
  const req = makeReq(token);
  const res = makeRes();
  let nextCalls = 0;
  let lookupCalls = 0;
  const castError = Object.assign(new Error("synthetic invalid object id"), {
    name: "CastError",
  });
  User.findById = () => {
    lookupCalls += 1;
    return rejectingQuery(castError);
  };

  await protect(req, res, () => { nextCalls += 1; });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Invalid token" });
  assert.equal(lookupCalls, 1);
  assert.equal(nextCalls, 0);
  assert.equal(req.user, undefined);
});

test("protect rejects a JWT whose User no longer exists", async () => {
  const token = jwt.sign(
    { userId: USER_ID, sessionVersion: 0 },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
  const req = makeReq(token);
  const res = makeRes();
  let nextCalls = 0;
  User.findById = () => queryFor(null);

  await protect(req, res, () => { nextCalls += 1; });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "User not found" });
  assert.equal(nextCalls, 0);
  assert.equal(req.user, undefined);
});

test("protect delegates an operational User lookup failure", async () => {
  const token = jwt.sign(
    { userId: USER_ID, sessionVersion: 0 },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
  const operationalError = new Error("synthetic database outage");
  const req = makeReq(token);
  const res = makeRes();
  const nextArguments = [];
  User.findById = () => rejectingQuery(operationalError);

  await protect(req, res, (...args) => { nextArguments.push(args); });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body, undefined);
  assert.deepEqual(nextArguments, [[operationalError]]);
  assert.equal(req.user, undefined);
});

test("protect rejects a mismatching sessionVersion without calling next", async () => {
  const result = await runProtect({ claim: { sessionVersion: 2 }, userVersion: 3 });

  assert.equal(result.res.statusCode, 401);
  assert.equal(result.nextCalls, 0);
  assert.equal(result.req.user, undefined);
});

test("auth/me timing preserves 401, sessionVersion, and operational-error behavior", async () => {
  {
    const logs = [];
    const req = { cookies: {} };
    const res = makeRes();
    attachAuthMeTiming(req, res, logs);
    let nextCalls = 0;

    await protect(req, res, () => { nextCalls += 1; });

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: "Not authenticated" });
    assert.equal(nextCalls, 0);
    assert.equal(logs.some(({ payload }) =>
      payload.stage === "protect" && payload.status === "unauthenticated"), true);
  }

  {
    const logs = [];
    const token = jwt.sign(
      { userId: USER_ID, sessionVersion: 7 },
      JWT_SECRET,
      { expiresIn: "7d" },
    );
    const user = { _id: USER_ID, sessionVersion: 7 };
    User.findById = () => queryFor(user);
    const req = makeReq(token);
    const res = makeRes();
    attachAuthMeTiming(req, res, logs);
    let nextCalls = 0;

    await protect(req, res, () => { nextCalls += 1; });

    assert.equal(nextCalls, 1);
    assert.equal(req.user, user);
    assert.equal(logs.some(({ payload }) =>
      payload.stage === "user_lookup" && payload.status === "success"), true);
    assert.equal(logs.some(({ payload }) =>
      payload.stage === "protect" && payload.status === "success"), true);
  }

  {
    const logs = [];
    const token = jwt.sign(
      { userId: USER_ID, sessionVersion: 0 },
      JWT_SECRET,
      { expiresIn: "7d" },
    );
    const databaseError = new Error("PRIVATE_DATABASE_ERROR");
    User.findById = () => rejectingQuery(databaseError);
    const req = makeReq(token);
    const res = makeRes();
    attachAuthMeTiming(req, res, logs);
    const nextArguments = [];

    await protect(req, res, (...args) => { nextArguments.push(args); });

    assert.deepEqual(nextArguments, [[databaseError]]);
    assert.equal(logs.some(({ payload }) =>
      payload.stage === "user_lookup" && payload.status === "failed"), true);
    assert.equal(logs.some(({ payload }) =>
      payload.stage === "protect" && payload.status === "operational_error"), true);
    assert.equal(JSON.stringify(logs).includes("PRIVATE_DATABASE_ERROR"), false);
  }
});

test("protect accepts a legacy JWT when the old User document has no sessionVersion", async () => {
  const result = await runProtect({ omitUserVersion: true });

  assert.equal(result.nextCalls, 1);
  assert.equal(result.req.user, result.user);
});

test("protect rejects a legacy JWT after the User version becomes 1", async () => {
  const result = await runProtect({ userVersion: 1 });

  assert.equal(result.res.statusCode, 401);
  assert.equal(result.nextCalls, 0);
});

for (const malformed of [null, "1", -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  test(`protect rejects malformed explicit sessionVersion ${String(malformed)}`, async () => {
    const result = await runProtect({ claim: { sessionVersion: malformed }, userVersion: 0 });

    assert.equal(result.res.statusCode, 401);
    assert.equal(result.nextCalls, 0);
  });
}
