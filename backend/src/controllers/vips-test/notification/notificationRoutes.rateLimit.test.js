import assert from "node:assert/strict";
import { after, test } from "node:test";

import cookieParser from "cookie-parser";
import express from "express";
import jwt from "jsonwebtoken";

import {
  getMyNotifications,
  markAllRead,
  markAsRead,
} from "../../notificationController.js";
import { readLimiter, writeLimiter } from "../../../middleware/rateLimit.js";
import Notification from "../../../models/Notification.js";
import User from "../../../models/User.js";
import notificationRouter from "../../../routes/notificationRoutes.js";

const TEST_JWT_SECRET = "notification-route-rate-limit-test-secret";
const originalJwtSecret = process.env.JWT_SECRET;

process.env.JWT_SECRET = TEST_JWT_SECRET;

after(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

function routeFor(path, method) {
  return notificationRouter.stack
    .map((layer) => layer.route)
    .find((route) => route?.path === path && route?.methods?.[method]);
}

function assertStandardRateLimitHeaders(response) {
  const combined = response.headers.get("ratelimit");
  const split = {
    limit: response.headers.get("ratelimit-limit"),
    remaining: response.headers.get("ratelimit-remaining"),
    reset: response.headers.get("ratelimit-reset"),
  };
  const hasCombinedHeader =
    combined !== null &&
    /limit=\d+/i.test(combined) &&
    /remaining=\d+/i.test(combined) &&
    /reset=\d+/i.test(combined);
  const hasSplitHeaders = Object.values(split).every(
    (value) => value !== null && /^\d+$/.test(value),
  );

  assert.ok(
    hasCombinedHeader || hasSplitHeaders,
    "expected the standard combined or split RateLimit header form",
  );
  assert.ok(response.headers.get("ratelimit-policy"));
  assert.equal(response.headers.get("x-ratelimit-limit"), null);
  assert.equal(response.headers.get("x-ratelimit-remaining"), null);
  assert.equal(response.headers.get("x-ratelimit-reset"), null);
}

async function assertBlocked(response) {
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), {
    error: "Too many requests, try again later.",
  });
  assertStandardRateLimitHeaders(response);
  const retryAfter = response.headers.get("retry-after");
  assert.match(retryAfter ?? "", /^\d+$/);
  assert.ok(Number(retryAfter) > 0);
}

async function startNotificationApp(t) {
  const app = express();
  app.use(cookieParser());
  app.use("/api/notifications", notificationRouter);

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
  return `http://127.0.0.1:${port}/api/notifications`;
}

function tokenFor(userId) {
  return jwt.sign({ userId, sessionVersion: 0 }, TEST_JWT_SECRET, {
    expiresIn: "7d",
  });
}

test("notification routes retain auth and verification before the repository-native limiters", () => {
  const cases = [
    {
      path: "/",
      method: "get",
      limiter: readLimiter,
      controller: getMyNotifications,
    },
    {
      path: "/:id/read",
      method: "put",
      limiter: writeLimiter,
      controller: markAsRead,
    },
    {
      path: "/read-all",
      method: "put",
      limiter: writeLimiter,
      controller: markAllRead,
    },
  ];

  for (const routeCase of cases) {
    const route = routeFor(routeCase.path, routeCase.method);
    assert.ok(route, `${routeCase.method.toUpperCase()} ${routeCase.path}`);
    const handlers = route.stack.map((layer) => layer.handle);

    assert.equal(handlers.length, 4);
    assert.equal(handlers[0].name, "protect");
    assert.equal(handlers[1].name, "requireVerified");
    assert.equal(handlers[2], routeCase.limiter);
    assert.equal(typeof handlers[2].resetKey, "function");
    assert.equal(typeof handlers[2].getKey, "function");
    assert.equal(handlers[3], routeCase.controller);
  }
});

test("notification routes enforce read and shared write thresholds after auth and verification", async (t) => {
  const limiterKey = "127.0.0.1";
  await Promise.all([
    readLimiter.resetKey(limiterKey),
    writeLimiter.resetKey(limiterKey),
  ]);
  t.after(() => Promise.all([
    readLimiter.resetKey(limiterKey),
    writeLimiter.resetKey(limiterKey),
  ]));

  const calls = {
    find: 0,
    countDocuments: 0,
    updateOne: 0,
    updateMany: 0,
  };
  t.mock.method(User, "findById", (userId) => ({
    select: async (projection) => {
      assert.equal(projection, "+sessionVersion");
      return {
        _id: userId,
        isVerified: userId !== "unverified-user",
        sessionVersion: 0,
      };
    },
  }));
  t.mock.method(Notification, "find", (filter) => {
    calls.find += 1;
    assert.deepEqual(filter, { recipient: "verified-user" });
    return {
      sort() {
        return this;
      },
      limit(limit) {
        assert.equal(limit, 30);
        return this;
      },
      lean: async () => [],
    };
  });
  t.mock.method(Notification, "countDocuments", async (filter) => {
    calls.countDocuments += 1;
    assert.deepEqual(filter, { recipient: "verified-user", isRead: false });
    return 0;
  });
  t.mock.method(Notification, "updateOne", async (filter, update) => {
    calls.updateOne += 1;
    assert.deepEqual(filter, {
      _id: "notification-1",
      recipient: "verified-user",
    });
    assert.deepEqual(update, { $set: { isRead: true } });
    return { matchedCount: 1 };
  });
  t.mock.method(Notification, "updateMany", async (filter, update) => {
    calls.updateMany += 1;
    assert.deepEqual(filter, { recipient: "verified-user", isRead: false });
    assert.deepEqual(update, { $set: { isRead: true } });
    return { acknowledged: true };
  });

  const baseUrl = await startNotificationApp(t);
  const verifiedCookie = `token=${tokenFor("verified-user")}`;
  const unverifiedCookie = `token=${tokenFor("unverified-user")}`;

  const unauthenticated = await fetch(baseUrl);
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(await unauthenticated.json(), { error: "Not authenticated" });
  assert.equal(unauthenticated.headers.get("ratelimit-policy"), null);

  const unverified = await fetch(baseUrl, {
    headers: { cookie: unverifiedCookie },
  });
  assert.equal(unverified.status, 403);
  assert.deepEqual(await unverified.json(), {
    error: "Email no verificado. Verifica tu correo para continuar.",
  });
  assert.equal(unverified.headers.get("ratelimit-policy"), null);
  assert.deepEqual(calls, {
    find: 0,
    countDocuments: 0,
    updateOne: 0,
    updateMany: 0,
  });

  for (let requestNumber = 0; requestNumber < 120; requestNumber += 1) {
    const response = await fetch(`${baseUrl}?limit=30`, {
      headers: { cookie: verifiedCookie },
    });
    assert.equal(response.status, 200, `read request ${requestNumber + 1}`);
    assert.deepEqual(await response.json(), { items: [], unreadCount: 0 });
    if (requestNumber === 0) assertStandardRateLimitHeaders(response);
  }
  assert.equal(calls.find, 120);
  assert.equal(calls.countDocuments, 120);

  await assertBlocked(await fetch(`${baseUrl}?limit=30`, {
    headers: { cookie: verifiedCookie },
  }));
  assert.equal(calls.find, 120, "blocked read must not reach the controller");
  assert.equal(calls.countDocuments, 120, "blocked read must not query unread count");

  for (let requestNumber = 0; requestNumber < 60; requestNumber += 1) {
    const markAll = requestNumber % 2 === 0;
    const response = await fetch(
      markAll ? `${baseUrl}/read-all` : `${baseUrl}/notification-1/read`,
      {
        method: "PUT",
        headers: { cookie: verifiedCookie },
      },
    );
    assert.equal(response.status, 200, `write request ${requestNumber + 1}`);
    assert.deepEqual(await response.json(), { ok: true });
    if (requestNumber === 0) assertStandardRateLimitHeaders(response);
  }
  assert.equal(calls.updateOne, 30);
  assert.equal(calls.updateMany, 30);

  await assertBlocked(await fetch(`${baseUrl}/notification-1/read`, {
    method: "PUT",
    headers: { cookie: verifiedCookie },
  }));
  assert.equal(calls.updateOne, 30, "blocked write must not reach mark-one");
  assert.equal(calls.updateMany, 30, "blocked write must not reach mark-all");
});
