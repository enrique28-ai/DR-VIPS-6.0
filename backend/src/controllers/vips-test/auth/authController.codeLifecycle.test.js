import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import User from "../../../models/User.js";
import { transporter } from "../../../utils/emailTransport.js";

const USER_ID = "64b000000000000000000041";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const clone = (value) => structuredClone(value);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const initialEnv = Object.fromEntries(["PENDING_SECRET", "JWT_SECRET"].map((key) => [key, process.env[key]]));
let auth;
before(async () => {
  process.env.PENDING_SECRET = "synthetic-code-lifecycle-pending-secret";
  process.env.JWT_SECRET = "synthetic-code-lifecycle-jwt-secret";
  auth = await import("../../authController.js");
});
after(() => {
  for (const [key, value] of Object.entries(initialEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const request = (body = {}, params = {}) => ({ user: { _id: USER_ID }, body, params, headers: {} });
const codeFromMail = (message) => {
  const match = message.html.match(/>(\d{6})<\/span>/);
  assert.ok(match, "synthetic email contains a six-digit code");
  return match[1];
};

// A small stateful persistence double models selected fields and conditional
// single-document writes, including readers that observed an earlier snapshot.
function harness(t, overrides = {}, codes = [222222, 333333, 444444]) {
  const state = {
    _id: USER_ID, name: "Synthetic User", email: "synthetic@example.com", role: "patient",
    isVerified: false, sessionVersion: 3, verificationToken: hash("111111"),
    verificationTokenExpiresAt: new Date(Date.now() + 60_000),
    resetPasswordToken: hash("111111"), resetPasswordExpiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
  const hooks = {};
  const mail = [];
  let reads = 0;
  let randomCalls = 0;
  const hidden = ["verificationToken", "verificationTokenExpiresAt", "resetPasswordToken", "resetPasswordExpiresAt", "sessionVersion"];
  const makeQuery = (kind) => {
    let projection = "";
    const execute = async () => {
      reads += 1;
      if (hooks.missing) return null;
      const doc = clone(state);
      for (const field of hidden) if (!projection.includes(field)) delete doc[field];
      const original = clone(doc);
      doc.save = async () => {
        await hooks.beforeSave?.(doc);
        for (const key of Object.keys(doc).filter((key) => key !== "save")) {
          if (JSON.stringify(doc[key]) === JSON.stringify(original[key])) continue;
          if (doc[key] === undefined) delete state[key];
          else state[key] = clone(doc[key]);
        }
        return doc;
      };
      await hooks.afterRead?.({ kind, count: reads, doc });
      return doc;
    };
    return {
      select(value) { projection = value; return this; },
      lean() { return this; },
      then(resolve, reject) { return execute().then(resolve, reject); },
    };
  };
  t.mock.method(User, "findById", () => makeQuery("id"));
  t.mock.method(User, "findOne", () => makeQuery("email"));
  t.mock.method(User, "findOneAndUpdate", async (filter, update, options = {}) => {
    await hooks.beforeAtomic?.(filter, update);
    const matches = Object.entries(filter).every(([key, value]) => {
      if (value && typeof value === "object" && "$gt" in value) return state[key] > value.$gt;
      if (value === null) return state[key] == null;
      return String(state[key]) === String(value);
    });
    if (!matches) return null;
    const previous = clone(state);
    for (const [key, value] of Object.entries(update.$set || {})) state[key] = clone(value);
    for (const key of Object.keys(update.$unset || {})) delete state[key];
    for (const [key, value] of Object.entries(update.$inc || {})) state[key] = (state[key] || 0) + value;
    return clone(options.new ? state : previous);
  });
  t.mock.method(crypto, "randomInt", () => {
    const value = codes[Math.min(randomCalls, codes.length - 1)];
    randomCalls += 1;
    return value;
  });
  t.mock.method(transporter, "sendMail", async (message) => {
    await hooks.beforeMail?.(message);
    mail.push(message);
    return { accepted: [message.to] };
  });
  t.mock.method(console, "error", () => {});
  const invoke = async (method, body, params) => {
    const res = response();
    await auth[method](request(body, params), res);
    return res;
  };
  return { state, hooks, mail, invoke, randomCalls: () => randomCalls };
}

test("the initial email code verifies once, is consumed and exposes no credential", async (t) => {
  const h = harness(t);
  assert.equal((await h.invoke("verifyEmail", { code: "111111" })).statusCode, 200);
  assert.equal(h.state.isVerified, true);
  assert.equal(h.state.verificationToken, undefined);
  assert.equal(h.state.sessionVersion, 3);
  assert.equal((await h.invoke("verifyEmail", { code: "111111" })).statusCode, 400);
});

test("resend activates a different code, invalidates the former code and latest code verifies", async (t) => {
  const h = harness(t);
  const resent = await h.invoke("resendVerificationCode");
  assert.equal(resent.statusCode, 200);
  const latest = codeFromMail(h.mail[0]);
  assert.notEqual(latest, "111111");
  assert.equal(h.state.verificationToken, hash(latest));
  assert.equal((await h.invoke("verifyEmail", { code: "111111" })).statusCode, 400);
  assert.equal((await h.invoke("verifyEmail", { code: latest })).statusCode, 200);
});

test("an expired email code cannot verify or mutate the account", async (t) => {
  const h = harness(t, { verificationTokenExpiresAt: new Date(Date.now() - 1) });
  assert.equal((await h.invoke("verifyEmail", { code: "111111" })).statusCode, 400);
  assert.equal(h.state.isVerified, false);
  assert.equal(h.state.verificationToken, hash("111111"));
});

test("a verification reader from before resend cannot consume the newly activated code", async (t) => {
  const h = harness(t);
  const read = deferred();
  const resume = deferred();
  h.hooks.afterRead = async ({ count }) => { if (count === 1) { read.resolve(); await resume.promise; } };
  const oldVerification = h.invoke("verifyEmail", { code: "111111" });
  await read.promise;
  assert.equal((await h.invoke("resendVerificationCode")).statusCode, 200);
  resume.resolve();
  assert.equal((await oldVerification).statusCode, 400);
  assert.equal(h.state.isVerified, false);
  assert.equal(h.state.verificationToken, hash("222222"));
});

test("two concurrent email verifications consume the same code only once", async (t) => {
  const h = harness(t);
  const bothRead = deferred();
  h.hooks.afterRead = async ({ count }) => { if (count === 2) bothRead.resolve(); await bothRead.promise; };
  const results = await Promise.all([h.invoke("verifyEmail", { code: "111111" }), h.invoke("verifyEmail", { code: "111111" })]);
  assert.equal(results.filter((res) => res.statusCode === 200).length, 1);
  assert.equal(results.filter((res) => res.statusCode === 400).length, 1);
  assert.equal(h.mail.length, 1, "only the winning verification sends a welcome email");
});

test("a stale resend reader cannot overwrite a code activated by a later request", async (t) => {
  const h = harness(t);
  const read = deferred();
  const resume = deferred();
  h.hooks.afterRead = async ({ count }) => { if (count === 1) { read.resolve(); await resume.promise; } };
  const oldResend = h.invoke("resendVerificationCode");
  await read.promise;
  assert.equal((await h.invoke("resendVerificationCode")).statusCode, 200);
  const active = h.state.verificationToken;
  resume.resolve();
  assert.equal((await oldResend).statusCode, 409);
  assert.equal(h.state.verificationToken, active);
  assert.equal(h.mail.length, 1);
});

test("resend cannot restore a credential after verification consumed its observed snapshot", async (t) => {
  const h = harness(t);
  const read = deferred();
  const resume = deferred();
  h.hooks.afterRead = async ({ count }) => { if (count === 1) { read.resolve(); await resume.promise; } };
  const resend = h.invoke("resendVerificationCode");
  await read.promise;
  assert.equal((await h.invoke("verifyEmail", { code: "111111" })).statusCode, 200);
  resume.resolve();
  assert.equal((await resend).statusCode, 409);
  assert.equal(h.state.isVerified, true);
  assert.equal(h.state.verificationToken, undefined);
  assert.equal(h.mail.filter((message) => /\d{6}/.test(message.html)).length, 0);
});

test("an immediate random collision with the current email code is regenerated", async (t) => {
  const h = harness(t, {}, [111111, 222222]);
  assert.equal((await h.invoke("resendVerificationCode")).statusCode, 200);
  assert.equal(codeFromMail(h.mail[0]), "222222");
  assert.equal(h.randomCalls(), 2);
  assert.equal((await h.invoke("verifyEmail", { code: "111111" })).statusCode, 400);
});

test("failed resend delivery reports failure and never rolls back to the previous code", async (t) => {
  const h = harness(t);
  h.hooks.beforeMail = async () => { throw new Error("synthetic mail failure"); };
  const res = await h.invoke("resendVerificationCode");
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, undefined);
  assert.notEqual(h.state.verificationToken, hash("111111"));
  assert.equal((await h.invoke("verifyEmail", { code: "111111" })).statusCode, 400);
});

test("bounded repeated collisions leave the active email code unchanged and send nothing", async (t) => {
  const h = harness(t, {}, [111111]);
  const res = await h.invoke("resendVerificationCode");
  assert.equal(res.statusCode, 503);
  assert.equal(h.randomCalls(), 5);
  assert.equal(h.state.verificationToken, hash("111111"));
  assert.equal(h.mail.length, 0);
});

test("failed activation reports failure without invalidating the still-current code or sending mail", async (t) => {
  const h = harness(t);
  h.hooks.beforeAtomic = async () => { throw new Error("synthetic write failure"); };
  const res = await h.invoke("resendVerificationCode");
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, undefined);
  assert.equal(h.state.verificationToken, hash("111111"));
  assert.equal(h.mail.length, 0);
  delete h.hooks.beforeAtomic;
  assert.equal((await h.invoke("verifyEmail", { code: "111111" })).statusCode, 200);
});

test("delayed email delivery cannot reactivate a code superseded by another successful resend", async (t) => {
  const h = harness(t);
  const sending = deferred();
  const deliver = deferred();
  h.hooks.beforeMail = async (message) => {
    if (message.html.includes(">222222</span>")) { sending.resolve(); await deliver.promise; }
  };
  const first = h.invoke("resendVerificationCode");
  await sending.promise;
  assert.equal((await h.invoke("resendVerificationCode")).statusCode, 200);
  assert.equal(codeFromMail(h.mail[0]), "333333");
  deliver.resolve();
  assert.equal((await first).statusCode, 200);
  assert.equal(codeFromMail(h.mail[1]), "222222");
  assert.equal(h.state.verificationToken, hash("333333"));
  assert.equal((await h.invoke("verifyEmail", { code: "222222" })).statusCode, 400);
  assert.equal((await h.invoke("verifyEmail", { code: "333333" })).statusCode, 200);
});

test("password recovery replaces its code, exchanges only the latest once and expires old values", async (t) => {
  const h = harness(t);
  assert.equal((await h.invoke("forgotPassword", { email: h.state.email })).statusCode, 200);
  const latest = codeFromMail(h.mail[0]);
  assert.equal((await h.invoke("verifyResetCode", { email: h.state.email, code: "111111" })).statusCode, 400);
  const exchange = await h.invoke("verifyResetCode", { email: h.state.email, code: latest });
  assert.equal(exchange.statusCode, 200);
  assert.match(exchange.body.token, /^[a-f0-9]{64}$/);
  assert.equal(h.state.resetPasswordToken, hash(exchange.body.token));
  assert.equal((await h.invoke("verifyResetCode", { email: h.state.email, code: latest })).statusCode, 400);
  h.state.resetPasswordToken = hash("555555");
  h.state.resetPasswordExpiresAt = new Date(Date.now() - 1);
  assert.equal((await h.invoke("verifyResetCode", { email: h.state.email, code: "555555" })).statusCode, 400);
});

test("a stale password-code issuer cannot overwrite a more recent activated code", async (t) => {
  const h = harness(t);
  const read = deferred();
  const resume = deferred();
  h.hooks.afterRead = async ({ count }) => { if (count === 1) { read.resolve(); await resume.promise; } };
  const first = h.invoke("forgotPassword", { email: h.state.email });
  await read.promise;
  const second = await h.invoke("forgotPassword", { email: h.state.email });
  const active = h.state.resetPasswordToken;
  resume.resolve();
  assert.deepEqual((await first).body, second.body);
  assert.equal(h.state.resetPasswordToken, active);
  assert.equal(h.mail.length, 1);
});

test("a stale password-code issuer cannot undo a reset-code exchange", async (t) => {
  const h = harness(t);
  const read = deferred();
  const resume = deferred();
  h.hooks.afterRead = async ({ count }) => { if (count === 1) { read.resolve(); await resume.promise; } };
  const first = h.invoke("forgotPassword", { email: h.state.email });
  await read.promise;
  const exchange = await h.invoke("verifyResetCode", { email: h.state.email, code: "111111" });
  assert.equal(exchange.statusCode, 200);
  const bearerHash = h.state.resetPasswordToken;
  resume.resolve();
  assert.equal((await first).statusCode, 200);
  assert.equal(h.state.resetPasswordToken, bearerHash);
  assert.equal(h.mail.length, 0);
});

test("an immediate random collision with the current password code is regenerated", async (t) => {
  const h = harness(t, {}, [111111, 222222]);
  assert.equal((await h.invoke("forgotPassword", { email: h.state.email })).statusCode, 200);
  assert.equal(codeFromMail(h.mail[0]), "222222");
  assert.equal(h.randomCalls(), 2);
});

test("bounded password-code collisions retain the generic acknowledgement without mutation or email", async (t) => {
  const h = harness(t, {}, [111111]);
  const res = await h.invoke("forgotPassword", { email: h.state.email });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, message: "If the email exists, we sent a code" });
  assert.equal(h.randomCalls(), 5);
  assert.equal(h.state.resetPasswordToken, hash("111111"));
  assert.equal(h.mail.length, 0);
});

test("a stale code issuer cannot reactivate credentials after the reset bearer is consumed", async (t) => {
  const h = harness(t);
  const exchange = await h.invoke("verifyResetCode", { email: h.state.email, code: "111111" });
  const read = deferred();
  const resume = deferred();
  h.hooks.afterRead = async ({ count }) => { if (count === 2) { read.resolve(); await resume.promise; } };
  const issuer = h.invoke("forgotPassword", { email: h.state.email });
  await read.promise;
  const reset = await h.invoke("resetPassword", { password: "SyntheticPassword1!" }, { token: exchange.body.token });
  assert.equal(reset.statusCode, 200);
  resume.resolve();
  assert.equal((await issuer).statusCode, 200);
  assert.equal(h.state.resetPasswordToken, undefined);
  assert.equal(h.state.verificationToken, undefined);
  assert.equal(h.state.sessionVersion, 4);
  assert.equal(h.mail.filter((message) => />(\d{6})<\/span>/.test(message.html)).length, 0);
});

test("password reset delivery failure stays generic rather than exposing account existence", async (t) => {
  const h = harness(t);
  h.hooks.beforeMail = async () => { throw new Error("synthetic delivery failure"); };
  const present = await h.invoke("forgotPassword", { email: h.state.email });
  h.hooks.missing = true;
  const absent = await h.invoke("forgotPassword", { email: "absent@example.com" });
  assert.equal(present.statusCode, 200);
  assert.deepEqual(present.body, absent.body);
  assert.equal(h.mail.length, 0);
});

for (const version of [undefined, 0, 3]) {
  test(`a stale empty recovery snapshot cannot recreate credentials after a full reset, sessionVersion=${version}`, async (t) => {
    const h = harness(t, { resetPasswordToken: undefined, resetPasswordExpiresAt: undefined, sessionVersion: version });
    if (version === undefined) delete h.state.sessionVersion;
    const paused = deferred();
    const resume = deferred();
    let writes = 0;
    h.hooks.beforeAtomic = async () => {
      writes += 1;
      if (writes === 1) { paused.resolve(); await resume.promise; }
    };
    const staleIssuer = h.invoke("forgotPassword", { email: h.state.email });
    await paused.promise;
    const currentIssuer = await h.invoke("forgotPassword", { email: h.state.email });
    assert.equal(currentIssuer.statusCode, 200);
    const currentCode = codeFromMail(h.mail[0]);
    const exchange = await h.invoke("verifyResetCode", { email: h.state.email, code: currentCode });
    assert.equal(exchange.statusCode, 200);
    const reset = await h.invoke("resetPassword", { password: "SyntheticPassword1!" }, { token: exchange.body.token });
    assert.equal(reset.statusCode, 200);
    assert.equal(h.state.resetPasswordToken, undefined);
    assert.equal(h.state.resetPasswordExpiresAt, undefined);
    assert.equal(h.state.sessionVersion, (version ?? 0) + 1);

    resume.resolve();
    const staleResponse = await staleIssuer;
    assert.deepEqual(staleResponse.body, currentIssuer.body);
    assert.equal(h.state.resetPasswordToken, undefined);
    assert.equal(h.state.resetPasswordExpiresAt, undefined);
    assert.equal(h.mail.filter((message) => />(\d{6})<\/span>/.test(message.html)).length, 1);
  });
}

test("password recovery preserves absent-account neutrality and Google restrictions", async (t) => {
  const h = harness(t);
  h.hooks.missing = true;
  const absent = await h.invoke("forgotPassword", { email: "absent@example.com" });
  assert.equal(absent.statusCode, 200);
  assert.deepEqual(absent.body, { success: true, message: "If the email exists, we sent a code" });
  assert.equal(h.mail.length, 0);
  h.hooks.missing = false;
  h.state.googleId = "synthetic-google-id";
  const google = await h.invoke("forgotPassword", { email: h.state.email });
  assert.equal(google.statusCode, 400);
  assert.deepEqual(google.body, { errorCode: "USE_GOOGLE" });
  assert.equal(h.mail.length, 0);
});
