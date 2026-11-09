import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { test } from "node:test";

test("production auth and mail eagerly load only the Google APIs they use", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const url = (path) => pathToFileURL(resolve(root, path)).href;
  const script = `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    const require = createRequire(${JSON.stringify(url("package.json"))});
    require('dotenv').config = () => ({ parsed: {} });
    globalThis.fetch = () => { throw new Error('Unexpected external request'); };
    const authApi = require('googleapis/build/src/apis/oauth2/index.js');
    await import(${JSON.stringify(url("backend/src/routes/authRoutes.js"))});
    await import(${JSON.stringify(url("backend/src/services/reminderService.js"))});
    const cache = Object.keys(require.cache).map(path => path.replaceAll('\\\\', '/'));
    assert.equal(cache.some(path => path.endsWith('/googleapis/build/src/index.js')), false);
    const apiModules = cache.filter(path => path.includes('/googleapis/build/src/apis/'));
    assert.equal(apiModules.some(path => path.includes('/apis/gmail/')), false);
    assert.ok(apiModules.some(path => path.includes('/apis/oauth2/')));
    assert.ok(apiModules.every(path => path.includes('/apis/oauth2/')));
    const client = new authApi.auth.OAuth2('synthetic-client', 'synthetic-secret', 'https://example.test/callback');
    const authUrl = new URL(client.generateAuthUrl({ scope: ['openid', 'email', 'profile'], state: 'synthetic-state' }));
    assert.equal(authUrl.origin, 'https://accounts.google.com');
    assert.equal(authUrl.searchParams.get('state'), 'synthetic-state');
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      NODE_ENV: "production",
      PENDING_SECRET: "synthetic-import-test-pending-secret",
      JWT_SECRET: "synthetic-import-test-jwt-secret",
      EMAIL_PROVIDER: "cloudflare",
      APPT_REMINDERS_ENABLED: "false",
    },
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
});

test("server loads dotenv before auth captures pending secret and Google OAuth configuration", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const url = (path) => pathToFileURL(resolve(root, path)).href;
  const script = `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    const require = createRequire(${JSON.stringify(url("package.json"))});
    let configCalls = 0;
    require('dotenv').config = () => {
      configCalls += 1;
      Object.assign(process.env, {
        NODE_ENV: 'development',
        CAPTCHA_ENABLED: 'false',
        APPT_REMINDERS_ENABLED: 'false',
        MONGO_URI: 'mongodb://synthetic.invalid/test',
        JWT_SECRET: 'synthetic-dotenv-jwt-secret',
        PENDING_SECRET: 'synthetic-dotenv-pending-secret',
        GOOGLE_CLIENT_ID: 'synthetic-dotenv-google-client',
        GOOGLE_CLIENT_SECRET: 'synthetic-dotenv-google-secret',
        API_GOOGLE_REDIRECT_URI: 'https://example.test/synthetic/callback'
      });
      return { parsed: {} };
    };
    let connectCalls = 0;
    require('mongoose').connect = () => { connectCalls += 1; return new Promise(() => {}); };
    require('express').application.listen = () => { throw new Error('Unexpected HTTP listen'); };
    globalThis.fetch = () => { throw new Error('Unexpected external request'); };
    assert.equal(process.env.PENDING_SECRET, undefined);
    await import(${JSON.stringify(url("backend/src/server.js"))});
    assert.equal(configCalls, 1);
    assert.equal(connectCalls, 1);
    const { googleInit } = await import(${JSON.stringify(url("backend/src/controllers/authController.js"))});
    const cookies = [];
    let redirect;
    const res = {
      cookie(...args) { cookies.push(args); return this; },
      set() { return this; },
      redirect(value) { redirect = value; return this; }
    };
    googleInit({}, res);
    const location = new URL(redirect);
    assert.equal(location.origin, 'https://accounts.google.com');
    assert.equal(location.searchParams.get('client_id'), 'synthetic-dotenv-google-client');
    assert.equal(location.searchParams.get('redirect_uri'), 'https://example.test/synthetic/callback');
    const cookie = cookies.find(([name]) => name === 'g_state');
    const payload = require('jsonwebtoken').verify(cookie[1], 'synthetic-dotenv-pending-secret', { algorithms: ['HS256'] });
    assert.equal(payload.state, location.searchParams.get('state'));
    assert.equal(payload.purpose, 'google-oauth-state');
    assert.equal(cookie[2].secure, false);
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
});
