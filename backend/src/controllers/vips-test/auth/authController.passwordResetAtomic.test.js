import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";

import bcrypt from "bcryptjs";

import User from "../../../models/User.js";
import { transporter } from "../../../utils/emailTransport.js";

const USER_ID = "64b000000000000000000002";
const originalFindOne = User.findOne;
const originalFindOneAndUpdate = User.findOneAndUpdate;
const originalSendMail = transporter.sendMail;

let resetPassword;
let verifyResetCode;

before(async () => {
  process.env.PENDING_SECRET ||= "atomic-reset-test-pending-secret";
  process.env.JWT_SECRET ||= "atomic-reset-test-jwt-secret";
  process.env.GOOGLE_CLIENT_ID ||= "atomic-reset-test-google-client";
  process.env.GOOGLE_CLIENT_SECRET ||= "atomic-reset-test-google-secret";
  ({ resetPassword, verifyResetCode } = await import("../../authController.js"));
});

after(() => {
  User.findOne = originalFindOne;
  User.findOneAndUpdate = originalFindOneAndUpdate;
  transporter.sendMail = originalSendMail;
});

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const makeReq = (token, password) => ({
  params: { token },
  body: { password },
  headers: {},
});

const makeRes = () => ({
  body: undefined,
  statusCode: 200,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const queryFor = (value) => {
  const promise = Promise.resolve(value);
  return {
    select() {
      return promise;
    },
    then(resolve, reject) {
      return promise.then(resolve, reject);
    },
  };
};

test("one reset bearer authorizes exactly one concurrent password change", async () => {
  const rawToken = "a".repeat(64);
  const firstPassword = "Concurrent1!";
  const secondPassword = "Concurrent2!";
  const previousPassword = "Previous1!";
  const state = {
    email: "patient@example.com",
    password: await bcrypt.hash(previousPassword, 10),
    resetPasswordToken: sha256(rawToken),
    resetPasswordExpiresAt: new Date(Date.now() + 60_000),
    verificationToken: sha256("123456"),
    verificationTokenExpiresAt: new Date(Date.now() + 60_000),
    sessionVersion: 4,
    isVerified: false,
  };

  let findOneCalls = 0;
  let saveCalls = 0;
  let atomicWrites = 0;
  const atomicUpdates = [];
  let releaseReaders;
  const bothReadersReady = new Promise((resolve) => {
    releaseReaders = resolve;
  });

  User.findOne = () => {
    findOneCalls += 1;
    if (findOneCalls === 2) releaseReaders();

    const user = new User({
      _id: USER_ID,
      email: state.email,
      password: state.password,
      name: "Patient User",
      role: "patient",
      isVerified: state.isVerified,
      sessionVersion: state.sessionVersion,
      verificationToken: state.verificationToken,
      verificationTokenExpiresAt: state.verificationTokenExpiresAt,
      resetPasswordToken: state.resetPasswordToken,
      resetPasswordExpiresAt: state.resetPasswordExpiresAt,
    });
    user.save = async () => {
      await bothReadersReady;
      saveCalls += 1;
      state.password = await bcrypt.hash(user.password, 10);
      state.resetPasswordToken = user.resetPasswordToken;
      state.resetPasswordExpiresAt = user.resetPasswordExpiresAt;
      state.verificationToken = user.verificationToken;
      state.verificationTokenExpiresAt = user.verificationTokenExpiresAt;
      state.sessionVersion = user.sessionVersion;
      state.isVerified = user.isVerified;
      return user;
    };
    return queryFor(user);
  };

  User.findOneAndUpdate = async (filter, update, options) => {
    atomicUpdates.push({ filter, update, options });
    const unexpired = state.resetPasswordExpiresAt > filter.resetPasswordExpiresAt.$gt;
    if (state.resetPasswordToken !== filter.resetPasswordToken || !unexpired) return null;

    atomicWrites += 1;
    state.password = update.$set.password;
    state.isVerified = update.$set.isVerified;
    state.sessionVersion += update.$inc.sessionVersion;
    for (const field of Object.keys(update.$unset)) state[field] = undefined;
    return { _id: USER_ID, email: state.email };
  };

  const sentMessages = [];
  transporter.sendMail = async (message) => {
    sentMessages.push(message);
    return { accepted: [message.to] };
  };

  const firstRes = makeRes();
  const secondRes = makeRes();
  await Promise.all([
    resetPassword(makeReq(rawToken, firstPassword), firstRes),
    resetPassword(makeReq(rawToken, secondPassword), secondRes),
  ]);

  const responses = [firstRes, secondRes];
  assert.equal(responses.filter(({ statusCode }) => statusCode === 200).length, 1);
  assert.equal(responses.filter(({ statusCode }) => statusCode === 400).length, 1);
  assert.ok(responses.some(({ body }) => body?.error === "Invalid or expired reset code"));
  assert.equal(findOneCalls, 0, "reset must not use a find-then-save token path");
  assert.equal(saveCalls, 0, "reset must not persist through document.save");
  assert.equal(atomicWrites, 1);
  assert.equal(state.sessionVersion, 5);
  assert.equal(state.resetPasswordToken, undefined);
  assert.equal(state.resetPasswordExpiresAt, undefined);
  assert.equal(state.verificationToken, undefined);
  assert.equal(state.verificationTokenExpiresAt, undefined);
  assert.equal(state.isVerified, true);
  assert.equal(sentMessages.length, 1);

  const firstWon = await bcrypt.compare(firstPassword, state.password);
  const secondWon = await bcrypt.compare(secondPassword, state.password);
  assert.notEqual(firstWon, secondWon, "exactly one proposed password must be stored");
  assert.equal(await bcrypt.compare(previousPassword, state.password), false);
  assert.notEqual(state.password, firstPassword);
  assert.notEqual(state.password, secondPassword);

  const thirdRes = makeRes();
  await resetPassword(makeReq(rawToken, "Concurrent3!"), thirdRes);

  assert.equal(thirdRes.statusCode, 400);
  assert.deepEqual(thirdRes.body, { error: "Invalid or expired reset code" });
  assert.equal(atomicWrites, 1);
  assert.equal(state.sessionVersion, 5);
  assert.equal(sentMessages.length, 1);
  assert.equal(atomicUpdates.length, 3);

  for (const { filter, update, options } of atomicUpdates) {
    assert.equal(filter.resetPasswordToken, sha256(rawToken));
    assert.ok(filter.resetPasswordExpiresAt.$gt instanceof Date);
    assert.equal(update.$set.password.startsWith("$2"), true);
    assert.equal(update.$inc.sessionVersion, 1);
    assert.deepEqual(update.$unset, {
      resetPasswordToken: 1,
      resetPasswordExpiresAt: 1,
      verificationToken: 1,
      verificationTokenExpiresAt: 1,
    });
    assert.equal(options.new, true);
    assert.equal(options.runValidators, true);
  }
});

test("reset code is exchanged once and the bearer cannot be renewed as a code", async () => {
  const rawCode = "123456";
  const newPassword = "Replacement1!";
  const state = {
    email: "patient@example.com",
    password: await bcrypt.hash("Previous1!", 10),
    resetPasswordToken: sha256(rawCode),
    resetPasswordExpiresAt: new Date(Date.now() + 60_000),
    sessionVersion: 2,
    isVerified: false,
  };

  let findOneCalls = 0;
  let exchangeSaveCalls = 0;
  User.findOne = () => {
    findOneCalls += 1;
    const snapshot = new User({
      _id: USER_ID,
      email: state.email,
      password: state.password,
      name: "Patient User",
      role: "patient",
      resetPasswordToken: state.resetPasswordToken,
      resetPasswordExpiresAt: state.resetPasswordExpiresAt,
    });
    snapshot.save = async () => {
      exchangeSaveCalls += 1;
      state.resetPasswordToken = snapshot.resetPasswordToken;
      state.resetPasswordExpiresAt = snapshot.resetPasswordExpiresAt;
      return snapshot;
    };
    return queryFor(snapshot);
  };

  let atomicCalls = 0;
  User.findOneAndUpdate = async (filter, update) => {
    atomicCalls += 1;
    const isPasswordReset = update.$inc?.sessionVersion === 1;
    const unexpired = state.resetPasswordExpiresAt > filter.resetPasswordExpiresAt.$gt;
    if (state.resetPasswordToken !== filter.resetPasswordToken || !unexpired) return null;

    if (isPasswordReset) {
      state.password = update.$set.password;
      state.isVerified = update.$set.isVerified;
      state.sessionVersion += update.$inc.sessionVersion;
      for (const field of Object.keys(update.$unset)) state[field] = undefined;
      return { _id: USER_ID, email: state.email };
    }

    state.resetPasswordToken = update.$set.resetPasswordToken;
    state.resetPasswordExpiresAt = update.$set.resetPasswordExpiresAt;
    return { _id: USER_ID, email: state.email };
  };

  const sentMessages = [];
  transporter.sendMail = async (message) => {
    sentMessages.push(message);
    return { accepted: [message.to] };
  };

  const firstExchangeRes = makeRes();
  const secondExchangeRes = makeRes();
  await Promise.all([
    verifyResetCode(
      { body: { email: state.email, code: rawCode }, headers: {} },
      firstExchangeRes,
    ),
    verifyResetCode(
      { body: { email: state.email, code: rawCode }, headers: {} },
      secondExchangeRes,
    ),
  ]);

  const exchangeResponses = [firstExchangeRes, secondExchangeRes];
  assert.equal(exchangeResponses.filter(({ statusCode }) => statusCode === 200).length, 1);
  assert.equal(exchangeResponses.filter(({ statusCode }) => statusCode === 400).length, 1);
  assert.ok(exchangeResponses.some(({ body }) => body?.error === "Invalid or expired code"));
  const bearer = exchangeResponses.find(({ statusCode }) => statusCode === 200).body.token;
  assert.match(bearer, /^[a-f0-9]{64}$/);
  assert.equal(state.resetPasswordToken, sha256(bearer));
  assert.equal(findOneCalls, 2);
  assert.equal(atomicCalls, 2);
  assert.equal(exchangeSaveCalls, 0, "reset-code exchange must not use find-then-save");

  const exchangedHash = state.resetPasswordToken;
  const exchangedExpiry = state.resetPasswordExpiresAt;
  const renewalRes = makeRes();
  await verifyResetCode(
    { body: { email: state.email, code: bearer }, headers: {} },
    renewalRes,
  );

  assert.equal(renewalRes.statusCode, 400);
  assert.deepEqual(renewalRes.body, { error: "Invalid or expired code" });
  assert.equal(findOneCalls, 2, "a long bearer must be rejected before account lookup");
  assert.equal(atomicCalls, 2, "a long bearer must not reach the exchange CAS");
  assert.equal(state.resetPasswordToken, exchangedHash);
  assert.equal(state.resetPasswordExpiresAt, exchangedExpiry);

  const resetRes = makeRes();
  await resetPassword(makeReq(bearer, newPassword), resetRes);

  assert.equal(resetRes.statusCode, 200);
  assert.deepEqual(resetRes.body, { success: true, message: "Password updated" });
  assert.equal(state.resetPasswordToken, undefined);
  assert.equal(state.resetPasswordExpiresAt, undefined);
  assert.equal(state.sessionVersion, 3);
  assert.equal(state.isVerified, true);
  assert.equal(await bcrypt.compare(newPassword, state.password), true);
  assert.equal(sentMessages.length, 1);
});
