import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import { me } from "../../authController.js";
import { serializePublicUser } from "../../../models/User.js";
import { createAuthMeRequestTiming } from "../../../runtime/timing.js";

const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";

function createResponse() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.set = (name, value) => {
    res.headers[name] = value;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

test("me timing preserves the public response contract and exposes no user fields in logs", async () => {
  const user = {
    _id: "64b000000000000000000001",
    email: "private@example.test",
    name: "Private Name",
    role: "doctor",
    isVerified: true,
    sessionVersion: 9,
  };
  const logs = [];
  const req = {
    method: "GET",
    path: "/api/auth/me",
    headers: {},
    user,
  };
  const res = createResponse();
  let time = 10;

  createAuthMeRequestTiming({
    logger: {
      info: (prefix, payload) => logs.push({ prefix, payload }),
      error: (prefix, payload) => logs.push({ prefix, payload }),
    },
    now: () => time++,
    createUuid: () => REQUEST_ID,
  })(req, res, () => {});

  const returned = await me(req, res);
  assert.equal(returned, res);
  assert.deepEqual(res.body, { user: serializePublicUser(user) });
  assert.equal(Object.hasOwn(res.body.user, "sessionVersion"), false);
  assert.equal(res.headers["Cache-Control"], "no-store, no-cache, must-revalidate, private");
  assert.equal(res.headers.Pragma, "no-cache");
  assert.equal(logs.some(({ payload }) =>
    payload.stage === "auth_me_controller" && payload.status === "success"), true);

  res.emit("finish");
  assert.equal(logs.some(({ payload }) => payload.stage === "express_request"), true);
  const exposed = JSON.stringify(logs);
  assert.equal(exposed.includes(user.email), false);
  assert.equal(exposed.includes(user.name), false);
  assert.equal(exposed.includes(user._id), false);
});

test("throwing timing logger cannot change the me response", async () => {
  const req = {
    method: "GET",
    path: "/api/auth/me",
    headers: {},
    user: { _id: "64b000000000000000000001", role: "patient" },
  };
  const res = createResponse();
  const logger = {
    info() { throw new Error("PRIVATE_LOGGER_FAILURE"); },
    error() { throw new Error("PRIVATE_LOGGER_FAILURE"); },
  };

  createAuthMeRequestTiming({
    logger,
    createUuid: () => REQUEST_ID,
  })(req, res, () => {});

  await assert.doesNotReject(me(req, res));
  assert.deepEqual(res.body, { user: serializePublicUser(req.user) });
  assert.doesNotThrow(() => res.emit("finish"));
});
