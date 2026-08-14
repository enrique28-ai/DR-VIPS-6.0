import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import jwt from "jsonwebtoken";

import User from "../models/User.js";

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

test("protect rejects a mismatching sessionVersion without calling next", async () => {
  const result = await runProtect({ claim: { sessionVersion: 2 }, userVersion: 3 });

  assert.equal(result.res.statusCode, 401);
  assert.equal(result.nextCalls, 0);
  assert.equal(result.req.user, undefined);
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
