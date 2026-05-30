import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";

import { isCaptchaEnabled, verifyRecaptcha } from "../../../middleware/recaptcha.js";

const ENV_KEYS = [
  "CAPTCHA_ENABLED",
  "RECAPTCHA_SECRET",
  "PENDING_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "API_GOOGLE_REDIRECT_URI",
];

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]])
);
const originalFetch = globalThis.fetch;

let googleInit;

before(async () => {
  process.env.PENDING_SECRET ||= "test-pending-secret";
  process.env.GOOGLE_CLIENT_ID ||= "test-google-client-id";
  process.env.GOOGLE_CLIENT_SECRET ||= "test-google-client-secret";
  process.env.API_GOOGLE_REDIRECT_URI ||=
    "http://localhost:5001/api/auth/google/callback";

  ({ googleInit } = await import("../../authController.js"));
});

afterEach(() => {
  restoreEnv();
  globalThis.fetch = originalFetch;
});

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
}

function makeReq(overrides = {}) {
  return {
    body: {},
    cookies: {},
    headers: {},
    ...overrides,
  };
}

function makeRes() {
  return {
    body: undefined,
    sent: undefined,
    statusCode: 200,
    cookies: [],
    clearedCookies: [],
    redirectedTo: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.sent = payload;
      return this;
    },
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name, options) {
      this.clearedCookies.push({ name, options });
      return this;
    },
    redirect(url) {
      this.redirectedTo = url;
      return this;
    },
  };
}

function makeNext() {
  const next = () => {
    next.calls += 1;
  };
  next.calls = 0;
  return next;
}

function guardFetch() {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("fetch should not be called");
  };
  return () => called;
}

test("verifyRecaptcha skips verification by default without requiring a token", async () => {
  delete process.env.CAPTCHA_ENABLED;
  const wasFetchCalled = guardFetch();
  const req = makeReq();
  const res = makeRes();
  const next = makeNext();

  await verifyRecaptcha()(req, res, next);

  assert.equal(isCaptchaEnabled(), false);
  assert.equal(next.calls, 1);
  assert.equal(wasFetchCalled(), false);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, undefined);
});

test("verifyRecaptcha skips verification when CAPTCHA_ENABLED is false", async () => {
  process.env.CAPTCHA_ENABLED = "false";
  const wasFetchCalled = guardFetch();
  const req = makeReq();
  const res = makeRes();
  const next = makeNext();

  await verifyRecaptcha()(req, res, next);

  assert.equal(isCaptchaEnabled(), false);
  assert.equal(next.calls, 1);
  assert.equal(wasFetchCalled(), false);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, undefined);
});

test("verifyRecaptcha rejects missing tokens when CAPTCHA_ENABLED is true", async () => {
  process.env.CAPTCHA_ENABLED = "true";
  const wasFetchCalled = guardFetch();
  const req = makeReq();
  const res = makeRes();
  const next = makeNext();

  await verifyRecaptcha()(req, res, next);

  assert.equal(isCaptchaEnabled(), true);
  assert.equal(next.calls, 0);
  assert.equal(wasFetchCalled(), false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Missing captcha" });
});

test("verifyRecaptcha rejects invalid Google responses when CAPTCHA_ENABLED is true", async () => {
  process.env.CAPTCHA_ENABLED = "true";
  process.env.RECAPTCHA_SECRET = "test-recaptcha-secret";
  let fetchCall;
  globalThis.fetch = async (url, options) => {
    fetchCall = { url, options };
    return { json: async () => ({ success: false }) };
  };
  const req = makeReq({ body: { recaptchaToken: "bad-token" } });
  const res = makeRes();
  const next = makeNext();

  await verifyRecaptcha()(req, res, next);

  assert.equal(next.calls, 0);
  assert.equal(fetchCall.url, "https://www.google.com/recaptcha/api/siteverify");
  assert.equal(fetchCall.options.method, "POST");
  assert.equal(fetchCall.options.body.get("secret"), "test-recaptcha-secret");
  assert.equal(fetchCall.options.body.get("response"), "bad-token");
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Captcha failed" });
});

test("verifyRecaptcha stores valid Google responses and calls next", async () => {
  process.env.CAPTCHA_ENABLED = "true";
  process.env.RECAPTCHA_SECRET = "test-recaptcha-secret";
  const googleResponse = {
    success: true,
    challenge_ts: "2026-05-30T12:00:00Z",
    hostname: "localhost",
  };
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return { json: async () => googleResponse };
  };
  const req = makeReq({ body: { recaptchaToken: "good-token" } });
  const res = makeRes();
  const next = makeNext();

  await verifyRecaptcha()(req, res, next);

  assert.equal(fetchCalls, 1);
  assert.equal(next.calls, 1);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(req.recaptcha, googleResponse);
});

test("googleInit skips the g_captcha cookie requirement when CAPTCHA_ENABLED is false", () => {
  process.env.CAPTCHA_ENABLED = "false";
  const req = makeReq();
  const res = makeRes();

  googleInit(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.sent, undefined);
  assert.ok(res.redirectedTo.includes("accounts.google.com"));
  assert.ok(res.cookies.some(({ name }) => name === "g_state"));
  assert.equal(res.clearedCookies.some(({ name }) => name === "g_captcha"), false);
});

test("googleInit requires the g_captcha cookie when CAPTCHA_ENABLED is true", () => {
  process.env.CAPTCHA_ENABLED = "true";
  const req = makeReq();
  const res = makeRes();

  googleInit(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.sent, "Captcha required");
  assert.equal(res.redirectedTo, undefined);
  assert.equal(res.cookies.length, 0);
});

test("googleInit preserves existing Google flow when CAPTCHA_ENABLED is true and cookie passed", () => {
  process.env.CAPTCHA_ENABLED = "true";
  const req = makeReq({ cookies: { g_captcha: "ok" } });
  const res = makeRes();

  googleInit(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.redirectedTo.includes("accounts.google.com"));
  assert.ok(res.cookies.some(({ name }) => name === "g_state"));
  assert.ok(res.clearedCookies.some(({ name }) => name === "g_captcha"));
});
