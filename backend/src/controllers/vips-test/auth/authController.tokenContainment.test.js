import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";

import { v2 as cloudinary } from "cloudinary";

import User, { serializePublicUser } from "../../../models/User.js";
import { transporter } from "../../../utils/gmail.js";

const PUBLIC_USER_FIELDS = new Set([
  "_id",
  "email",
  "name",
  "avatar",
  "role",
  "isVerified",
  "isProfessionalVerified",
]);

const SENSITIVE_USER_FIELDS = [
  "password",
  "verificationToken",
  "verificationTokenExpiresAt",
  "resetPasswordToken",
  "resetPasswordExpiresAt",
  "googleId",
];

const USER_ID = "64b000000000000000000001";
const originalUserMethods = {
  create: User.create,
  findById: User.findById,
  findOne: User.findOne,
};
const originalSendMail = transporter.sendMail;
const originalUpload = cloudinary.uploader.upload;
const originalUploadStream = cloudinary.uploader.upload_stream;

let auth;

before(async () => {
  process.env.PENDING_SECRET ||= "phase-16b1-test-pending-secret";
  process.env.JWT_SECRET ||= "phase-16b1-test-jwt-secret";
  process.env.GOOGLE_CLIENT_ID ||= "phase-16b1-test-google-client";
  process.env.GOOGLE_CLIENT_SECRET ||= "phase-16b1-test-google-secret";
  auth = await import("../../authController.js");
});

after(() => {
  restoreMocks();
});

function restoreMocks() {
  User.create = originalUserMethods.create;
  User.findById = originalUserMethods.findById;
  User.findOne = originalUserMethods.findOne;
  transporter.sendMail = originalSendMail;
  cloudinary.uploader.upload = originalUpload;
  cloudinary.uploader.upload_stream = originalUploadStream;
}

function makeUser(overrides = {}) {
  const user = new User({
    _id: USER_ID,
    email: "patient@example.com",
    password: "hashed-password-value",
    googleId: "internal-google-id",
    name: "Patient User",
    avatar: "https://example.com/avatar.png",
    role: "patient",
    isVerified: false,
    isProfessionalVerified: false,
    lastHealthDecisionAt: new Date("2026-08-01T00:00:00.000Z"),
    verificationToken: sha256("111111"),
    verificationTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    resetPasswordToken: sha256("222222"),
    resetPasswordExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    ...overrides,
  });
  user.save = async () => user;
  return user;
}

function makeReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    cookies: {},
    protocol: "https",
    get: (name) => name === "host" ? "app.example.com" : undefined,
    user: { _id: USER_ID },
    ...overrides,
  };
}

function makeRes() {
  return {
    body: undefined,
    statusCode: 200,
    cookies: [],
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
  };
}

function queryFor(value, onSelect = () => {}) {
  const promise = Promise.resolve(value);
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

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assertPublicUser(user) {
  assert.ok(user);
  for (const field of SENSITIVE_USER_FIELDS) {
    assert.equal(Object.hasOwn(user, field), false, `response user exposed ${field}`);
  }
  for (const field of Object.keys(user)) {
    assert.equal(PUBLIC_USER_FIELDS.has(field), true, `unexpected public User field: ${field}`);
  }
  assert.equal(user._id, USER_ID);
  assert.equal(user.email, "patient@example.com");
  assert.equal(user.name, "Patient User");
  assert.equal(user.role, "patient");
}

function extractSixDigitCode(html) {
  const match = String(html).match(/>(\d{6})<\/span>/);
  assert.ok(match, "email mock should receive one six-digit code");
  return match[1];
}

function captureMail() {
  const messages = [];
  transporter.sendMail = async (message) => {
    messages.push(message);
    return { accepted: [message.to] };
  };
  return messages;
}

test("User schema excludes token fields by default and uses one explicit public serializer", () => {
  restoreMocks();

  for (const field of [
    "verificationToken",
    "verificationTokenExpiresAt",
    "resetPasswordToken",
    "resetPasswordExpiresAt",
  ]) {
    assert.equal(User.schema.path(field).options.select, false, `${field} must use select:false`);
  }

  const user = makeUser();
  assert.deepEqual(user.toJSON(), serializePublicUser(user));
  assertPublicUser(JSON.parse(JSON.stringify(user)));
});

test("register returns a sanitized user and stores only the SHA-256 verification code", async () => {
  restoreMocks();
  const messages = captureMail();
  let createPayload;

  User.findOne = async () => null;
  User.create = async (payload) => {
    createPayload = payload;
    return makeUser(payload);
  };

  const req = makeReq({
    body: {
      name: "Patient User",
      email: "patient@example.com",
      password: "test-password-only",
      role: "patient",
    },
  });
  const res = makeRes();

  await auth.register(req, res);

  assert.equal(res.statusCode, 201);
  assertPublicUser(res.body.user);
  assert.match(createPayload.verificationToken, /^[a-f0-9]{64}$/);
  assert.equal(messages.length, 1);
  const rawCode = extractSixDigitCode(messages[0].html);
  assert.equal(createPayload.verificationToken, sha256(rawCode));
  assert.notEqual(createPayload.verificationToken, rawCode);
  assert.equal(JSON.stringify(res.body).includes(rawCode), false);
});

test("login returns the public User allowlist even when the authenticated document has secrets", async () => {
  restoreMocks();
  const user = makeUser({ googleId: undefined, isVerified: true });
  user.comparePassword = async () => true;
  User.findOne = () => queryFor(user);
  User.findById = () => queryFor(user);

  const res = makeRes();
  await auth.login(makeReq({ body: { email: user.email, password: "test-password-only" } }), res);

  assert.equal(res.statusCode, 200);
  assertPublicUser(res.body.user);
});

test("auth me sanitizes a request User document that contains verification and reset tokens", async () => {
  restoreMocks();
  const res = makeRes();

  await auth.me(makeReq({ user: makeUser({ isVerified: true }) }), res);

  assert.equal(res.statusCode, 200);
  assertPublicUser(res.body.user);
});

test("verify email accepts the raw code by hashing it, consumes it, and exposes no code", async () => {
  restoreMocks();
  captureMail();
  const rawCode = "123456";
  const user = makeUser({
    verificationToken: sha256(rawCode),
    verificationTokenExpiresAt: new Date(Date.now() + 60_000),
  });
  let selected = "";
  User.findById = () => queryFor(user, (projection) => { selected = projection; });

  const res = makeRes();
  await auth.verifyEmail(makeReq({ body: { code: rawCode } }), res);

  assert.match(selected, /verificationToken/);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, message: "Email verified" });
  assert.equal(user.isVerified, true);
  assert.equal(user.verificationToken, undefined);
  assert.equal(user.verificationTokenExpiresAt, undefined);
  assert.equal(JSON.stringify(res.body).includes(rawCode), false);
});

test("verify email rejects an incorrect code without consuming the stored hash", async () => {
  restoreMocks();
  const originalHash = sha256("123456");
  const user = makeUser({ verificationToken: originalHash });
  User.findById = () => queryFor(user);

  const res = makeRes();
  await auth.verifyEmail(makeReq({ body: { code: "654321" } }), res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Invalid code" });
  assert.equal(user.isVerified, false);
  assert.equal(user.verificationToken, originalHash);
});

test("verify email rejects an expired code without consuming it", async () => {
  restoreMocks();
  const originalHash = sha256("123456");
  const user = makeUser({
    verificationToken: originalHash,
    verificationTokenExpiresAt: new Date(Date.now() - 1_000),
  });
  User.findById = () => queryFor(user);

  const res = makeRes();
  await auth.verifyEmail(makeReq({ body: { code: "123456" } }), res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Verification code expired" });
  assert.equal(user.isVerified, false);
  assert.equal(user.verificationToken, originalHash);
});

test("resend replaces the stored verification hash and returns no code", async () => {
  restoreMocks();
  const messages = captureMail();
  const oldHash = sha256("111111");
  const user = makeUser({ verificationToken: oldHash });
  User.findById = () => queryFor(user);

  const res = makeRes();
  await auth.resendVerificationCode(makeReq(), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, message: "Verification code resent" });
  assert.equal(messages.length, 1);
  const rawCode = extractSixDigitCode(messages[0].html);
  assert.equal(user.verificationToken, sha256(rawCode));
  assert.notEqual(user.verificationToken, oldHash);
  assert.equal(JSON.stringify(res.body).includes(rawCode), false);
});

test("password reset request stores only a hash and never returns it as User data", async () => {
  restoreMocks();
  const messages = captureMail();
  const user = makeUser({ googleId: undefined });
  User.findOne = async () => user;

  const res = makeRes();
  await auth.forgotPassword(makeReq({ body: { email: user.email } }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, message: "If the email exists, we sent a code" });
  assert.equal(messages.length, 1);
  const rawCode = extractSixDigitCode(messages[0].html);
  assert.equal(user.resetPasswordToken, sha256(rawCode));
  assert.match(user.resetPasswordToken, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(res.body).includes(user.resetPasswordToken), false);
});

test("verify reset code explicitly selects the hidden hash and exchanges it for a hashed reset token", async () => {
  restoreMocks();
  const rawCode = "123456";
  const user = makeUser({
    googleId: undefined,
    resetPasswordToken: sha256(rawCode),
    resetPasswordExpiresAt: new Date(Date.now() + 60_000),
  });
  let selected = "";
  User.findOne = () => queryFor(user, (projection) => { selected = projection; });

  const res = makeRes();
  await auth.verifyResetCode(
    makeReq({ body: { email: user.email, code: rawCode } }),
    res,
  );

  assert.match(selected, /resetPasswordToken/);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.match(res.body.token, /^[a-f0-9]{64}$/);
  assert.equal(user.resetPasswordToken, sha256(res.body.token));
  assert.notEqual(user.resetPasswordToken, res.body.token);
});

test("reset password explicitly selects the hidden token, consumes it, and exposes no User secrets", async () => {
  restoreMocks();
  captureMail();
  const rawResetToken = "a".repeat(64);
  const expectedHash = sha256(rawResetToken);
  const user = makeUser({
    googleId: undefined,
    resetPasswordToken: expectedHash,
    resetPasswordExpiresAt: new Date(Date.now() + 60_000),
  });
  let findQuery;
  let selected = "";
  User.findOne = (query) => {
    findQuery = query;
    return queryFor(user, (projection) => { selected = projection; });
  };

  const res = makeRes();
  await auth.resetPassword(
    makeReq({ params: { token: rawResetToken }, body: { password: "replacement-password" } }),
    res,
  );

  assert.equal(findQuery.resetPasswordToken, expectedHash);
  assert.match(selected, /resetPasswordToken/);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, message: "Password updated" });
  assert.equal(user.resetPasswordToken, undefined);
  assert.equal(user.resetPasswordExpiresAt, undefined);
  assert.equal(JSON.stringify(res.body).includes(expectedHash), false);
});

test("profile update response uses the public User serializer", async () => {
  restoreMocks();
  const user = makeUser({ isVerified: true });
  User.findById = () => queryFor(user);

  const res = makeRes();
  await auth.updateProfile(makeReq({ body: { name: " Patient User " } }), res);

  assert.equal(res.statusCode, 200);
  assertPublicUser(res.body.user);
});

test("uploaded avatar response uses the public User serializer", async () => {
  restoreMocks();
  const user = makeUser({ isVerified: true, avatar: "" });
  User.findById = () => queryFor(user);
  cloudinary.uploader.upload_stream = (_options, callback) => ({
    end() {
      callback(null, { secure_url: "https://cdn.example.com/uploaded.png" });
    },
  });

  const res = makeRes();
  await auth.updateAvatar(makeReq({ file: { buffer: Buffer.from("test-image") } }), res);

  assert.equal(res.statusCode, 200);
  assertPublicUser(res.body.user);
  assert.equal(res.body.user.avatar, "https://cdn.example.com/uploaded.png");
});

test("URL-imported avatar response uses the public User serializer", async () => {
  restoreMocks();
  const user = makeUser({ isVerified: true, avatar: "" });
  User.findById = () => queryFor(user);
  cloudinary.uploader.upload = async () => ({
    secure_url: "https://cdn.example.com/imported.png",
  });

  const res = makeRes();
  await auth.importAvatarFromUrl(
    makeReq({ body: { url: "https://images.example.com/source.png" } }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assertPublicUser(res.body.user);
  assert.equal(res.body.user.avatar, "https://cdn.example.com/imported.png");
});
