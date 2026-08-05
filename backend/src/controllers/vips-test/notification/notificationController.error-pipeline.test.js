import assert from "node:assert/strict";
import { test } from "node:test";

import express from "express";

import {
  getMyNotifications,
  markAllRead,
  markAsRead,
} from "../../notificationController.js";
import Notification from "../../../models/Notification.js";
import { errorHandler } from "../../../middleware/errorHandler.js";
import {
  apiNoStore,
  createSecurityHeaders,
} from "../../../middleware/securityHeaders.js";

const API_NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  "surrogate-control": "no-store",
  pragma: "no-cache",
  expires: "0",
};

function createResponse() {
  const state = {
    statuses: [],
    bodies: [],
  };
  const res = {
    status(statusCode) {
      state.statuses.push(statusCode);
      return this;
    },
    json(body) {
      state.bodies.push(body);
      return this;
    },
  };

  return { res, state };
}

function createResolvedFindQuery(items, capture = {}) {
  return {
    sort(sort) {
      capture.sort = sort;
      return this;
    },
    limit(limit) {
      capture.limit = limit;
      return this;
    },
    lean() {
      return Promise.resolve(items);
    },
  };
}

function assertNoLocalResponse(state) {
  assert.deepEqual(state.statuses, []);
  assert.deepEqual(state.bodies, []);
}

function assertApiNoStoreHeaders(response) {
  for (const [header, value] of Object.entries(API_NO_STORE_HEADERS)) {
    assert.equal(response.headers.get(header), value, header);
  }
}

test("getMyNotifications preserves recipient, unread, limit, and response contracts", async (t) => {
  const recipient = "recipient-get";
  const items = [{ _id: "notification-1" }];
  const queryCapture = {};
  let findFilter;
  let countFilter;

  t.mock.method(Notification, "find", (filter) => {
    findFilter = filter;
    return createResolvedFindQuery(items, queryCapture);
  });
  t.mock.method(Notification, "countDocuments", async (filter) => {
    countFilter = filter;
    return 4;
  });

  const { res, state } = createResponse();
  const nextErrors = [];
  await getMyNotifications(
    { query: { limit: "500", unread: "1" }, user: { _id: recipient } },
    res,
    (error) => nextErrors.push(error),
  );

  assert.deepEqual(findFilter, { recipient, isRead: false });
  assert.deepEqual(countFilter, { recipient, isRead: false });
  assert.deepEqual(queryCapture.sort, { createdAt: -1 });
  assert.equal(queryCapture.limit, 100);
  assert.deepEqual(state.statuses, []);
  assert.deepEqual(state.bodies, [{ items, unreadCount: 4 }]);
  assert.deepEqual(nextErrors, []);
});

test("getMyNotifications forwards the same unexpected error without responding or logging", async (t) => {
  const expectedError = new Error("PRIVATE_GET_NOTIFICATION_ERROR");
  t.mock.method(Notification, "find", () => createResolvedFindQuery([]));
  t.mock.method(Notification, "countDocuments", async () => {
    throw expectedError;
  });
  const consoleError = t.mock.method(console, "error", () => {});
  const { res, state } = createResponse();
  const nextErrors = [];

  await getMyNotifications(
    { query: {}, user: { _id: "recipient-error" } },
    res,
    (error) => nextErrors.push(error),
  );

  assertNoLocalResponse(state);
  assert.deepEqual(nextErrors, [expectedError]);
  assert.equal(consoleError.mock.callCount(), 0);
});

test("markAsRead preserves its scoped update and success response", async (t) => {
  let updateFilter;
  let update;
  t.mock.method(Notification, "updateOne", async (filter, change) => {
    updateFilter = filter;
    update = change;
    return { matchedCount: 1 };
  });
  const { res, state } = createResponse();
  const nextErrors = [];

  await markAsRead(
    { params: { id: "notification-read" }, user: { _id: "recipient-read" } },
    res,
    (error) => nextErrors.push(error),
  );

  assert.deepEqual(updateFilter, {
    _id: "notification-read",
    recipient: "recipient-read",
  });
  assert.deepEqual(update, { $set: { isRead: true } });
  assert.deepEqual(state.statuses, []);
  assert.deepEqual(state.bodies, [{ ok: true }]);
  assert.deepEqual(nextErrors, []);
});

test("markAsRead preserves the exact not-found response without calling next", async (t) => {
  t.mock.method(Notification, "updateOne", async () => ({ matchedCount: 0 }));
  const { res, state } = createResponse();
  const nextErrors = [];

  await markAsRead(
    { params: { id: "missing" }, user: { _id: "recipient-missing" } },
    res,
    (error) => nextErrors.push(error),
  );

  assert.deepEqual(state.statuses, [404]);
  assert.deepEqual(state.bodies, [{ error: "Notification not found" }]);
  assert.deepEqual(nextErrors, []);
});

test("markAsRead forwards the same unexpected error without responding or logging", async (t) => {
  const expectedError = new Error("PRIVATE_MARK_NOTIFICATION_ERROR");
  t.mock.method(Notification, "updateOne", async () => {
    throw expectedError;
  });
  const consoleError = t.mock.method(console, "error", () => {});
  const { res, state } = createResponse();
  const nextErrors = [];

  await markAsRead(
    { params: { id: "notification-error" }, user: { _id: "recipient-error" } },
    res,
    (error) => nextErrors.push(error),
  );

  assertNoLocalResponse(state);
  assert.deepEqual(nextErrors, [expectedError]);
  assert.equal(consoleError.mock.callCount(), 0);
});

test("markAllRead preserves its unread recipient filter and success response", async (t) => {
  let updateFilter;
  let update;
  t.mock.method(Notification, "updateMany", async (filter, change) => {
    updateFilter = filter;
    update = change;
  });
  const { res, state } = createResponse();
  const nextErrors = [];

  await markAllRead(
    { user: { _id: "recipient-all" } },
    res,
    (error) => nextErrors.push(error),
  );

  assert.deepEqual(updateFilter, { recipient: "recipient-all", isRead: false });
  assert.deepEqual(update, { $set: { isRead: true } });
  assert.deepEqual(state.statuses, []);
  assert.deepEqual(state.bodies, [{ ok: true }]);
  assert.deepEqual(nextErrors, []);
});

test("markAllRead forwards the same unexpected error without responding or logging", async (t) => {
  const expectedError = new Error("PRIVATE_MARK_ALL_NOTIFICATION_ERROR");
  t.mock.method(Notification, "updateMany", async () => {
    throw expectedError;
  });
  const consoleError = t.mock.method(console, "error", () => {});
  const { res, state } = createResponse();
  const nextErrors = [];

  await markAllRead(
    { user: { _id: "recipient-error" } },
    res,
    (error) => nextErrors.push(error),
  );

  assertNoLocalResponse(state);
  assert.deepEqual(nextErrors, [expectedError]);
  assert.equal(consoleError.mock.callCount(), 0);
});

test("notification failures use one sanitized global 500 response and log", async (t) => {
  const sentinels = [
    "PRIVATE_NOTIFICATION_MESSAGE",
    "PRIVATE_NOTIFICATION_STACK",
    "PRIVATE_RECIPIENT_ID",
  ];
  const expectedError = new Error(sentinels[0]);
  expectedError.stack = sentinels[1];
  let findFilter;
  t.mock.method(Notification, "find", (filter) => {
    findFilter = filter;
    return {
      sort() {
        return this;
      },
      limit() {
        return this;
      },
      lean() {
        return Promise.reject(expectedError);
      },
    };
  });
  t.mock.method(Notification, "countDocuments", async () => 0);
  const consoleError = t.mock.method(console, "error", () => {});

  const app = express();
  app.use(createSecurityHeaders({ isProduction: false }));
  app.use("/api", apiNoStore);
  app.get(
    "/api/notifications",
    (req, _res, next) => {
      req.user = { _id: sentinels[2] };
      next();
    },
    getMyNotifications,
  );
  app.use(errorHandler);

  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.once("error", reject);
  });
  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/notifications`);
  const body = await response.text();
  const logs = consoleError.mock.calls.map((call) => call.arguments);
  const exposed = JSON.stringify({
    body,
    headers: Object.fromEntries(response.headers),
    logs,
  });

  assert.deepEqual(findFilter, { recipient: sentinels[2] });
  assert.equal(response.status, 500);
  assert.equal(body, '{"error":"Internal server error"}');
  assert.match(response.headers.get("content-type"), /^application\/json\b/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.ok(response.headers.get("content-security-policy"));
  assertApiNoStoreHeaders(response);
  assert.deepEqual(logs, [[
    "[backend-error]",
    {
      level: "error",
      type: "internal_error",
      method: "GET",
      pathname: "api_request",
      status: 500,
      message: "unhandled_request_error",
    },
  ]]);
  for (const sentinel of sentinels) {
    assert.equal(exposed.includes(sentinel), false, sentinel);
  }
});
