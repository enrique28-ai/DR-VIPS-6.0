import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { google } from "googleapis";
import User from "../../../models/User.js";

const realFetch = globalThis.fetch;
const envKeys = ["CAPTCHA_ENABLED", "CAPTCHA_PROVIDER", "TURNSTILE_SECRET_KEY", "TURNSTILE_EXPECTED_HOSTNAMES", "PENDING_SECRET", "JWT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "API_GOOGLE_REDIRECT_URI", "NODE_ENV"];
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const originalError = console.error;
const originalGetToken = google.auth.OAuth2.prototype.getToken;
const originalVerify = google.auth.OAuth2.prototype.verifyIdToken;
const originalFind = User.findOne;
let app, router, verifyResult, verifyError, logs = [], server, origin, auth;
before(async () => {
  Object.assign(process.env, { CAPTCHA_ENABLED: "true", CAPTCHA_PROVIDER: "turnstile", TURNSTILE_SECRET_KEY: "synthetic-secret", TURNSTILE_EXPECTED_HOSTNAMES: "example.test", PENDING_SECRET: "synthetic-pending", JWT_SECRET: "synthetic-google-captcha-test-jwt-secret", GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-google-secret", API_GOOGLE_REDIRECT_URI: "https://example.test/api/auth/google/callback", NODE_ENV: "production" });
  globalThis.fetch = async () => {
    if (verifyError) throw verifyError;
    return { status: 200, json: async () => verifyResult };
  };
  console.error = (...args) => logs.push(args);
  router = (await import("../../../routes/authRoutes.js")).default;
  auth = await import("../../authController.js");
  app = express(); app.use(express.json()); app.use(cookieParser()); app.use("/api/auth", router);
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  globalThis.fetch = realFetch; console.error = originalError;
  google.auth.OAuth2.prototype.getToken = originalGetToken;
  google.auth.OAuth2.prototype.verifyIdToken = originalVerify;
  User.findOne = originalFind;
  for (const key of envKeys) { if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key]; }
});
const request = (path, options = {}) => new Promise((resolve, reject) => {
  const req = http.request(`${origin}/api/auth${path}`, options, response => {
    let body = "";
    response.setEncoding("utf8"); response.on("data", chunk => { body += chunk; });
    response.on("end", () => resolve({ status: response.statusCode, headers: { get: name => Array.isArray(response.headers[name]) ? response.headers[name].join(",") : response.headers[name] ?? null }, json: async () => JSON.parse(body) }));
  });
  req.on("error", reject); req.end(options.body);
});
const post = (body = {}) => request("/google/recaptcha", { method: "POST", headers: { "content-type": "application/json", cookie: "g_captcha=ok" }, body: JSON.stringify(body) });
const valid = () => ({ success: true, action: "google_oauth", hostname: "example.test" });

test("fabricated cookie and client-supplied proof cannot initiate via former GET", async () => {
  const response = await request("/google/init?redirect=https://evil.test", { headers: { cookie: "g_captcha=ok" } });
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("set-cookie"), null);
});
test("POST failures issue neither URL nor state cookie; missing, invalid, expired/reused, action, hostname, network, secret", async () => {
  // Invoke the real route chain, omitting only its already-tested shared rate limiter
  // to exercise all rejection cases without consuming the production quota.
  const route = router.stack.find(layer => layer.route?.path === "/google/recaptcha").route;
  const handlers = route.stack.slice(1).map(layer => layer.handle);
  for (const scenario of ["missing", "invalid", "expired-reused", "action", "hostname", "network", "timeout", "secret"]) {
    verifyResult = valid(); verifyError = null;
    process.env.TURNSTILE_SECRET_KEY = "synthetic-secret";
    if (["invalid", "expired-reused"].includes(scenario)) verifyResult = { success: false, "error-codes": ["timeout-or-duplicate"] };
    if (scenario === "action") verifyResult.action = "login";
    if (scenario === "hostname") verifyResult.hostname = "evil.test";
    if (["network", "timeout"].includes(scenario)) verifyError = Object.assign(new Error("synthetic-secret private-token"), { name: scenario === "timeout" ? "AbortError" : "TypeError" });
    if (scenario === "secret") process.env.TURNSTILE_SECRET_KEY = "";
    const req = { body: scenario === "missing" ? {} : { captchaToken: "private-token" }, cookies: { g_captcha: "ok" } };
    const res = responseMock();
    let reached = false;
    await handlers[0](req, res, () => { reached = true; handlers[1](req, res); });
    assert.equal(reached, false, scenario);
    assert.ok(res.statusCode >= 400, scenario);
    assert.equal(res.cookies.length, 0, scenario);
    assert.equal(res.body?.url, undefined, scenario);
  }
  process.env.TURNSTILE_SECRET_KEY = "synthetic-secret"; verifyError = null;
  assert.equal(JSON.stringify(logs).includes("private-token"), false);
  assert.equal(JSON.stringify(logs).includes("synthetic-secret"), false);
});
test("verified POST returns server Google URL and secure random state, ignoring client redirects", async () => {
  verifyResult = valid(); verifyError = null;
  const response = await post({ captchaToken: "private-token", redirect_uri: "https://evil.test", url: "https://evil.test", state: "client-state" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ["url"]);
  const url = new URL(body.url);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("redirect_uri"), "https://example.test/api/auth/google/callback");
  assert.match(url.searchParams.get("state"), /^[\w-]{24}$/);
  assert.notEqual(url.searchParams.get("state"), "client-state");
  const cookie = response.headers.get("set-cookie");
  const signedState = cookie.match(/g_state=([^;]+)/)[1];
  const issued = jwt.verify(signedState, process.env.PENDING_SECRET, { algorithms: ["HS256"] });
  assert.equal(issued.state, url.searchParams.get("state"));
  assert.equal(issued.purpose, "google-oauth-state");
  assert.equal(issued.captchaVerified, true);
  assert.equal(body.url.includes(signedState), false);
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Max-Age=600/);
  assert.equal(cookie.includes("g_captcha"), false);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const second = await post({ captchaToken: "another-token" });
  assert.notEqual(new URL((await second.json()).url).searchParams.get("state"), url.searchParams.get("state"));
});
test("CAPTCHA-disabled development remains supported through POST and direct GET", async () => {
  process.env.CAPTCHA_ENABLED = "false";
  assert.equal((await post()).status, 200);
  const response = await request("/google/init");
  assert.equal(response.status, 302); assert.equal(new URL(response.headers.get("location")).origin, "https://accounts.google.com");
  process.env.CAPTCHA_ENABLED = "true";
});
function responseMock() {
  return { statusCode: 200, cookies: [], headers: {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; }, cookie(...args) { this.cookies.push(args); return this; }, clearCookie() { return this; }, set(key, value) { this.headers[key] = value; return this; }, redirect(url) { this.redirectedTo = url; return this; } };
}
test("callback preserves state rejection, existing login, pending signup, USE_PASSWORD and GOOGLE_MISMATCH", async () => {
  process.env.CAPTCHA_ENABLED = "true";
  let exchanges = 0;
  google.auth.OAuth2.prototype.getToken = async () => { exchanges++; return { tokens: { id_token: "private-id-token" } }; };
  google.auth.OAuth2.prototype.verifyIdToken = async () => ({ getPayload: () => ({ sub: "synthetic-sub", email: "person@example.test", email_verified: true, name: "Synthetic" }) });
  const initiation = responseMock();
  auth.googleStart({ captcha: valid() }, initiation);
  const nonce = new URL(initiation.body.url).searchParams.get("state");
  const req = { query: { code: "private-code", state: nonce }, cookies: { g_state: initiation.cookies[0][1] } };
  let res = responseMock();
  await auth.googleCallback({ ...req, query: { ...req.query, state: "wrong" } }, res);
  assert.equal(res.statusCode, 400); assert.equal(exchanges, 0);
  for (const cookie of ["server-state", jwt.sign({ purpose: "wrong", state: nonce, captchaVerified: true }, process.env.PENDING_SECRET), jwt.sign({ purpose: "google-oauth-state", state: nonce, captchaVerified: true }, process.env.PENDING_SECRET, { expiresIn: -1 }), jwt.sign({ purpose: "google-oauth-state", state: nonce, captchaVerified: false }, process.env.PENDING_SECRET, { expiresIn: "10m" })]) {
    res = responseMock(); await auth.googleCallback({ ...req, cookies: { g_state: cookie } }, res);
    assert.equal(res.statusCode, 400); assert.equal(exchanges, 0);
  }
  for (const [user, expected] of [[null, "/choose-role"], [{ googleId: null }, "authError=USE_PASSWORD"], [{ googleId: "other" }, "authError=GOOGLE_MISMATCH"], [{ _id: "64b000000000000000000001", googleId: "synthetic-sub", sessionVersion: 3, save: async () => {} }, ""]]) {
    User.findOne = () => ({ select: async () => user });
    res = responseMock(); await auth.googleCallback(req, res);
    assert.equal(typeof res.redirectedTo, "string", `Expected OAuth callback redirect; status=${res.statusCode}`);
    assert.ok(res.redirectedTo.endsWith(expected), expected);
    if (!user) assert.ok(res.cookies.some(([name]) => name === "g_pending"));
    else if (user.googleId === "synthetic-sub") assert.ok(res.cookies.some(([name]) => name === "token"));
  }
  google.auth.OAuth2.prototype.getToken = async () => { throw new Error("private-code private-id-token synthetic-google-secret"); };
  res = responseMock(); await auth.googleCallback(req, res);
  assert.equal(res.statusCode, 500);
  assert.equal(JSON.stringify(logs).includes("private-code"), false);
  assert.equal(JSON.stringify(logs).includes("private-id-token"), false);
});
