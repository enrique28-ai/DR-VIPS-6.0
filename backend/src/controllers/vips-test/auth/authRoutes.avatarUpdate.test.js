import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import https from "node:https";
import { Writable } from "node:stream";
import { after, before, test } from "node:test";
import cookieParser from "cookie-parser";
import express from "express";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import User from "../../../models/User.js";
import { errorHandler } from "../../../middleware/errorHandler.js";

const sessionSecret = "synthetic-avatar-route-session-secret";
const previousAvatar = "https://res.cloudinary.com/synthetic/image/upload/previous.png";
const uploadedAvatar = "https://res.cloudinary.com/synthetic/image/upload/current.png";
const fileUrl = "https://images.example.test/avatar.png";
let server;
let baseUrl;

before(async () => {
  process.env.PENDING_SECRET = "synthetic-avatar-route-pending-secret";
  process.env.JWT_SECRET = sessionSecret;
  const { default: authRoutes } = await import("../../../routes/authRoutes.js");
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/auth", authRoutes);
  app.use(errorHandler);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/auth/profile`;
});

after(() => {
  server?.close();
});

function mockAccount(t, { avatar = previousAvatar, saveError } = {}) {
  const account = {
    _id: new Types.ObjectId(),
    email: "synthetic@example.test",
    name: "Synthetic Account",
    role: "patient",
    isVerified: true,
    googleId: "synthetic-google-id",
    sessionVersion: 0,
    avatar,
  };
  t.mock.method(User.collection, "findOne", async ({ _id }) =>
    String(_id) === String(account._id) ? { ...account } : null,
  );
  const write = t.mock.method(User.collection, "updateOne", async ({ _id }, update) => {
    assert.equal(String(_id), String(account._id));
    if (saveError) throw saveError;
    Object.assign(account, update.$set);
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  });
  const token = jwt.sign({ userId: String(account._id), sessionVersion: 0 }, sessionSecret);
  return { account, write, cookie: `token=${token}` };
}

function photoForm(size = 12, type = "image/png") {
  const form = new FormData();
  form.append("avatar", new Blob([new Uint8Array(size)], { type }), "synthetic.png");
  return form;
}

function uploadFile(cookie, body = photoForm()) {
  return fetch(`${baseUrl}/avatar`, { method: "PUT", headers: { cookie }, body });
}

function importUrl(cookie, url = fileUrl) {
  return fetch(`${baseUrl}/avatar-url`, {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

async function assertPersisted(response, { account, write }) {
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.user.avatar, uploadedAvatar);
  assert.equal(body.user.googleId, undefined);
  assert.equal(body.user.sessionVersion, undefined);
  assert.equal(write.mock.callCount(), 1);
  assert.equal(account.avatar, uploadedAvatar);
}

test("a browser-style multipart upload persists the avatar", async (t) => {
  const account = mockAccount(t);
  const provider = t.mock.method(cloudinary.uploader, "upload_stream", (_options, callback) => ({
    end(buffer) {
      assert.equal(buffer.length, 12);
      callback(null, { secure_url: uploadedAvatar });
    },
  }));
  await assertPersisted(await uploadFile(account.cookie), account);
  assert.equal(provider.mock.callCount(), 1);
});

for (const input of [fileUrl, fileUrl.replace("https:", "HTTPS:")]) {
  test(`an image URL with scheme ${input.split(":")[0]} is imported and persisted`, async (t) => {
    const account = mockAccount(t);
    const provider = t.mock.method(cloudinary.uploader, "upload", async (url, options) => {
      assert.equal(cloudinary.utils.isRemoteUrl(url), true);
      assert.equal(url, fileUrl);
      assert.equal(options.resource_type, "image");
      return { secure_url: uploadedAvatar };
    });
    await assertPersisted(await importUrl(account.cookie, input), account);
    assert.equal(provider.mock.callCount(), 1);
  });
}

test("the upload accepts exactly 2 MiB and rejects one extra byte", async (t) => {
  const account = mockAccount(t);
  const maxSize = 2 * 1024 * 1024;
  const provider = t.mock.method(cloudinary.uploader, "upload_stream", (_options, callback) => ({
    end(buffer) {
      assert.equal(buffer.length, maxSize);
      callback(null, { secure_url: uploadedAvatar });
    },
  }));
  await assertPersisted(await uploadFile(account.cookie, photoForm(maxSize)), account);
  const rejected = await uploadFile(account.cookie, photoForm(maxSize + 1));
  assert.equal(rejected.status, 413);
  assert.deepEqual(await rejected.json(), { error: "File too large" });
  assert.equal(provider.mock.callCount(), 1);
  assert.equal(account.write.mock.callCount(), 1);
});

test("unsupported MIME types and extra parts never reach Cloudinary", async (t) => {
  const account = mockAccount(t);
  const provider = t.mock.method(cloudinary.uploader, "upload_stream", () => assert.fail("Unexpected upload"));
  const extraFile = photoForm();
  extraFile.append("avatar", new Blob(["extra"], { type: "image/png" }), "extra.png");
  const extraField = photoForm();
  extraField.append("caption", "unexpected field");
  for (const form of [photoForm(12, "text/plain"), photoForm(12, "image/png-invalid"), extraFile, extraField]) {
    const response = await uploadFile(account.cookie, form);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Invalid file upload" });
  }
  assert.equal(provider.mock.callCount(), 0);
  assert.equal(account.write.mock.callCount(), 0);
});

test("invalid URL input is rejected before the provider call", async (t) => {
  const account = mockAccount(t);
  const provider = t.mock.method(cloudinary.uploader, "upload", () => assert.fail("Unexpected import"));
  for (const url of ["", "https://", "https:///images.example.test", "https://[", "ftp://example.test/photo", "https://user:pass@example.test/photo"]) {
    const response = await importUrl(account.cookie, url);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).errorCode, "AVATAR_INVALID_URL");
  }
  assert.equal(provider.mock.callCount(), 0);
  assert.equal(account.write.mock.callCount(), 0);
});

test("an inaccessible URL returns a safe error and preserves the previous avatar", async (t) => {
  const account = mockAccount(t);
  t.mock.method(cloudinary.uploader, "upload", async () => {
    throw { http_code: 400, message: "private provider detail" };
  });
  const response = await importUrl(account.cookie);
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: "Image URL could not be imported", errorCode: "AVATAR_URL_UNAVAILABLE" });
  assert.equal(account.account.avatar, previousAvatar);
  assert.equal(account.write.mock.callCount(), 0);
});

test("provider authorization failures and missing secure URLs cannot replace a legacy avatar", async (t) => {
  const avatar = "/uploads/avatars/synthetic.png";
  const account = mockAccount(t, { avatar });
  const remove = t.mock.method(fs, "unlink", (_path, callback) => callback());
  t.mock.method(cloudinary.uploader, "upload_stream", (_options, callback) => ({
    end() { callback({ http_code: 401, message: "private provider detail" }); },
  }));
  t.mock.method(cloudinary.uploader, "upload", async () => ({ url: uploadedAvatar }));
  for (const response of [await uploadFile(account.cookie), await importUrl(account.cookie)]) {
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "Image service unavailable" });
  }
  assert.equal(account.account.avatar, avatar);
  assert.equal(account.write.mock.callCount(), 0);
  assert.equal(remove.mock.callCount(), 0);
});

test("a database failure leaves the previous local avatar intact", async (t) => {
  const avatar = "/uploads/avatars/synthetic.png";
  const account = mockAccount(t, { avatar, saveError: new Error("Synthetic database failure") });
  const remove = t.mock.method(fs, "unlink", (_path, callback) => callback());
  t.mock.method(cloudinary.uploader, "upload", async () => ({ secure_url: uploadedAvatar }));
  const response = await importUrl(account.cookie);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Server error" });
  assert.equal(account.account.avatar, avatar);
  assert.equal(account.write.mock.callCount(), 1);
  assert.equal(remove.mock.callCount(), 0);
});

test("SDK transport timeouts return 504 for both avatar operations", async (t) => {
  const account = mockAccount(t);
  const originalConfig = { ...cloudinary.config() };
  cloudinary.config({ cloud_name: "synthetic", api_key: "synthetic", api_secret: "synthetic" });
  t.after(() => cloudinary.config(originalConfig));
  const transport = t.mock.method(https, "request", () => {
    const request = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    request.setTimeout = (ms, timeout) => {
      assert.equal(ms, 10000);
      request.once("finish", timeout);
    };
    request.abort = () => request.emit("error", new Error("Synthetic timeout"));
    return request;
  });
  for (const response of [await uploadFile(account.cookie), await importUrl(account.cookie)]) {
    assert.equal(response.status, 504);
    assert.equal((await response.json()).errorCode, "AVATAR_TIMEOUT");
  }
  assert.equal(transport.mock.callCount(), 2);
  assert.equal(account.write.mock.callCount(), 0);
  assert.equal(account.account.avatar, previousAvatar);
});

test("the two routes share a per-account quota and authenticate before accepting uploads", async (t) => {
  const first = mockAccount(t);
  const provider = t.mock.method(cloudinary.uploader, "upload_stream", () => assert.fail("Unexpected upload"));
  for (const response of [await uploadFile(""), await importUrl("token=invalid")]) {
    assert.equal(response.status, 401);
    await response.json();
  }
  for (let n = 0; n < 10; n++) {
    const rejected = await importUrl(first.cookie, "invalid");
    assert.equal(rejected.status, 400);
    await rejected.json();
  }
  const limited = await uploadFile(first.cookie);
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get("retry-after"));
  await limited.json();
  assert.equal(provider.mock.callCount(), 0);
  assert.equal(first.write.mock.callCount(), 0);
});
