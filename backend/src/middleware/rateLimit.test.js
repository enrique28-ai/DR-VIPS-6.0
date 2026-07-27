import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import express from "express";

import { apiNoStore } from "./securityHeaders.js";
import {
  apiLimiter,
  authLimiter,
  emailActionLimiter,
  readLimiter,
  verificationLimiter,
  writeLimiter,
} from "./rateLimit.js";

const TOO_MANY_REQUESTS = {
  error: "Too many requests, try again later.",
};

const API_NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  "surrogate-control": "no-store",
  pragma: "no-cache",
  expires: "0",
};

const LIMITERS = {
  apiLimiter,
  authLimiter,
  emailActionLimiter,
  verificationLimiter,
  writeLimiter,
  readLimiter,
};

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
  assert.ok(
    response.headers.get("ratelimit-policy"),
    "RateLimit-Policy should be present",
  );

  for (const header of [
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
  ]) {
    assert.equal(response.headers.get(header), null, header);
  }
}

function assertRetryAfter(response) {
  const retryAfter = response.headers.get("retry-after");
  assert.match(retryAfter ?? "", /^\d+$/);
  assert.ok(Number(retryAfter) > 0);
}

function assertApiNoStoreHeaders(response) {
  for (const [header, value] of Object.entries(API_NO_STORE_HEADERS)) {
    assert.equal(response.headers.get(header), value, header);
  }
}

async function assertBlocked(response) {
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), TOO_MANY_REQUESTS);
  assertStandardRateLimitHeaders(response);
  assertRetryAfter(response);
}

async function startRateLimitApp(t) {
  const app = express();

  app.get("/auth", apiNoStore, authLimiter, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.get("/email", emailActionLimiter, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.get("/verification", verificationLimiter, (_req, res) => {
    res.status(200).json({ ok: true });
  });

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
  return `http://127.0.0.1:${port}`;
}

async function fetchSuccesses(url, count) {
  const responses = [];

  for (let requestNumber = 0; requestNumber < count; requestNumber += 1) {
    const response = await fetch(url);
    assert.equal(response.status, 200, `request ${requestNumber + 1}`);
    responses.push(response);
  }

  return responses;
}

test("all six exported limiters are Express middleware", () => {
  assert.deepEqual(Object.keys(LIMITERS), [
    "apiLimiter",
    "authLimiter",
    "emailActionLimiter",
    "verificationLimiter",
    "writeLimiter",
    "readLimiter",
  ]);

  for (const [name, limiter] of Object.entries(LIMITERS)) {
    assert.equal(typeof limiter, "function", name);
    assert.equal(limiter.length, 3, `${name} middleware arity`);
  }
});

test("auth, email-action, and verification limits enforce exact independent request counts", async (t) => {
  const baseUrl = await startRateLimitApp(t);

  const emailResponses = await fetchSuccesses(`${baseUrl}/email`, 3);
  assertStandardRateLimitHeaders(emailResponses[0]);
  await assertBlocked(await fetch(`${baseUrl}/email`));

  const firstAuthResponse = await fetch(`${baseUrl}/auth`);
  assert.equal(firstAuthResponse.status, 200, "email counter must not consume auth quota");

  const verificationResponses = await fetchSuccesses(`${baseUrl}/verification`, 10);
  assertStandardRateLimitHeaders(verificationResponses[0]);
  await assertBlocked(await fetch(`${baseUrl}/verification`));

  const secondAuthResponse = await fetch(`${baseUrl}/auth`);
  assert.equal(
    secondAuthResponse.status,
    200,
    "verification counter must not consume auth quota",
  );

  const remainingAuthResponses = await fetchSuccesses(`${baseUrl}/auth`, 8);
  assertStandardRateLimitHeaders(remainingAuthResponses[0]);

  const blockedAuthResponse = await fetch(`${baseUrl}/auth`);
  await assertBlocked(blockedAuthResponse);
  assertApiNoStoreHeaders(blockedAuthResponse);
});

test("rate-limit source and tests exclude unrelated CAPTCHA-provider integration", async () => {
  const forbiddenProvider = ["Turn", "stile"].join("");
  const sourceUrl = new URL("./rateLimit.js", import.meta.url);
  const [source, tests] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(fileURLToPath(import.meta.url), "utf8"),
  ]);

  assert.equal(source.includes(forbiddenProvider), false);
  assert.equal(tests.includes(forbiddenProvider), false);
});
