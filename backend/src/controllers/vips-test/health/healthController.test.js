import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createReadinessHandler,
  getLiveness,
} from "../../healthController.js";

function runHandler(handler) {
  const state = {
    statusCode: null,
    body: null,
  };
  const res = {
    status(statusCode) {
      state.statusCode = statusCode;
      return this;
    },
    json(body) {
      state.body = body;
      return this;
    },
  };

  handler({}, res);

  return state;
}

test("getLiveness returns the exact healthy response", () => {
  const state = runHandler(getLiveness);

  assert.equal(state.statusCode, 200);
  assert.deepEqual(state.body, { status: "ok" });
});

test("readiness returns 200 only when readyState is 1", () => {
  const handler = createReadinessHandler({ getReadyState: () => 1 });
  const state = runHandler(handler);

  assert.equal(state.statusCode, 200);
  assert.deepEqual(state.body, { status: "ready" });
});

test("readiness returns 503 when readyState is 0", () => {
  const handler = createReadinessHandler({ getReadyState: () => 0 });
  const state = runHandler(handler);

  assert.equal(state.statusCode, 503);
  assert.deepEqual(state.body, { status: "not_ready" });
});

test("readiness returns 503 when readyState is 2", () => {
  const handler = createReadinessHandler({ getReadyState: () => 2 });
  const state = runHandler(handler);

  assert.equal(state.statusCode, 503);
  assert.deepEqual(state.body, { status: "not_ready" });
});

test("readiness returns 503 when readyState is 3", () => {
  const handler = createReadinessHandler({ getReadyState: () => 3 });
  const state = runHandler(handler);

  assert.equal(state.statusCode, 503);
  assert.deepEqual(state.body, { status: "not_ready" });
});

test("readiness returns 503 for an unknown readyState", () => {
  const handler = createReadinessHandler({ getReadyState: () => 99 });
  const state = runHandler(handler);

  assert.equal(state.statusCode, 503);
  assert.deepEqual(state.body, { status: "not_ready" });
});

test("readiness returns only not_ready when getReadyState throws", () => {
  const internalMessage = "internal connection detail";
  const handler = createReadinessHandler({
    getReadyState: () => {
      throw new Error(internalMessage);
    },
  });
  const state = runHandler(handler);

  assert.equal(state.statusCode, 503);
  assert.deepEqual(state.body, { status: "not_ready" });
  assert.equal(JSON.stringify(state.body).includes(internalMessage), false);
});
