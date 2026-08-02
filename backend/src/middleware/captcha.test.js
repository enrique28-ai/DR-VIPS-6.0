import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  getCaptchaProvider,
  isCaptchaEnabled,
  verifyCaptcha,
} from "./captcha.js";

const ENV_KEYS = [
  "CAPTCHA_ENABLED",
  "CAPTCHA_PROVIDER",
  "RECAPTCHA_SECRET",
  "TURNSTILE_SECRET_KEY",
  "TURNSTILE_EXPECTED_HOSTNAMES",
  "NODE_ENV",
];

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function fakeProviderResponse(data, status = 200) {
  return { status, json: async () => data };
}

async function captureDiagnostics(callback) {
  const calls = [];
  const originalError = console.error;
  console.error = (...args) => calls.push(args);

  try {
    const result = await callback();
    return { calls, result };
  } finally {
    console.error = originalError;
  }
}

function assertDiagnostic(calls, expected, sensitiveValues = []) {
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "[captcha-diagnostic]");
  assert.deepEqual(calls[0][1], expected);

  const serialized = JSON.stringify(calls);
  for (const value of sensitiveValues) {
    assert.equal(serialized.includes(value), false);
  }
}

function expectedDiagnostic(stage, overrides = {}) {
  return {
    stage,
    provider: "recaptcha",
    httpStatus: null,
    success: null,
    errorCodes: [],
    expectedAction: null,
    receivedAction: null,
    expectedHostnames: [],
    receivedHostname: null,
    secretPresent: true,
    tokenPresent: true,
    ...overrides,
  };
}

async function runCaptcha({
  body = {},
  ip,
  options = {},
  req: suppliedReq,
} = {}) {
  const req = suppliedReq ?? { body };
  if (suppliedReq && req.body === undefined) req.body = body;
  if (ip !== undefined) req.ip = ip;

  const state = { status: 200, body: undefined, nextCalls: 0 };
  const res = {
    status(code) {
      state.status = code;
      return this;
    },
    json(payload) {
      state.body = payload;
      return this;
    },
  };

  await verifyCaptcha(options)(req, res, () => {
    state.nextCalls += 1;
  });

  return { req, state };
}

function enableRecaptcha() {
  process.env.CAPTCHA_ENABLED = "true";
  process.env.CAPTCHA_PROVIDER = "recaptcha";
  process.env.RECAPTCHA_SECRET = "test-recaptcha-secret";
}

function enableTurnstile() {
  process.env.CAPTCHA_ENABLED = "true";
  process.env.CAPTCHA_PROVIDER = "turnstile";
  process.env.TURNSTILE_SECRET_KEY = "test-turnstile-secret";
}

test("isCaptchaEnabled preserves the exact CAPTCHA_ENABLED=true switch", () => {
  assert.equal(isCaptchaEnabled(), false);
  process.env.CAPTCHA_ENABLED = "true";
  assert.equal(isCaptchaEnabled(), true);
  process.env.CAPTCHA_ENABLED = "TRUE";
  assert.equal(isCaptchaEnabled(), false);
});

test("getCaptchaProvider defaults to recaptcha and normalizes configured values", () => {
  assert.equal(getCaptchaProvider(), "recaptcha");
  process.env.CAPTCHA_PROVIDER = "  TuRnStIlE  ";
  assert.equal(getCaptchaProvider(), "turnstile");
  process.env.CAPTCHA_PROVIDER = "  ReCaPtChA ";
  assert.equal(getCaptchaProvider(), "recaptcha");
});

test("disabled CAPTCHA skips the network and calls next exactly once", async () => {
  let fetchCalls = 0;
  const { state } = await runCaptcha({
    options: {
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("should not be called");
      },
    },
  });

  assert.equal(fetchCalls, 0);
  assert.equal(state.nextCalls, 1);
  assert.equal(state.status, 200);
});

test("missing token keeps the existing exact 400 response", async () => {
  enableRecaptcha();
  const { state } = await runCaptcha();

  assert.equal(state.status, 400);
  assert.deepEqual(state.body, { error: "Missing captcha" });
  assert.equal(state.nextCalls, 0);
});

test("recaptcha accepts captchaToken, sends form data and remoteip, and sets both results", async () => {
  enableRecaptcha();
  const calls = [];
  const providerResult = { success: true, hostname: "google.example" };
  const { req, state } = await runCaptcha({
    body: { captchaToken: "neutral-token" },
    ip: "203.0.113.10",
    options: {
      expectedAction: "ignored-for-v2",
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return fakeProviderResponse(providerResult);
      },
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://www.google.com/recaptcha/api/siteverify");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(
    calls[0].init.headers["Content-Type"],
    "application/x-www-form-urlencoded",
  );
  assert.equal(calls[0].init.body.get("secret"), "test-recaptcha-secret");
  assert.equal(calls[0].init.body.get("response"), "neutral-token");
  assert.equal(calls[0].init.body.get("remoteip"), "203.0.113.10");
  assert.strictEqual(req.captcha, providerResult);
  assert.strictEqual(req.recaptcha, providerResult);
  assert.equal(state.nextCalls, 1);
  assert.equal(state.status, 200);
});

test("legacy recaptchaToken remains accepted when captchaToken is absent", async () => {
  enableRecaptcha();
  let submittedToken;
  const { state } = await runCaptcha({
    body: { recaptchaToken: "legacy-token" },
    options: {
      fetchImpl: async (_url, init) => {
        submittedToken = init.body.get("response");
        return fakeProviderResponse({ success: true });
      },
    },
  });

  assert.equal(submittedToken, "legacy-token");
  assert.equal(state.nextCalls, 1);
});

test("captchaToken takes precedence when both token fields exist", async () => {
  enableRecaptcha();
  let submittedToken;
  const { state } = await runCaptcha({
    body: { captchaToken: "preferred-token", recaptchaToken: "legacy-token" },
    options: {
      fetchImpl: async (_url, init) => {
        submittedToken = init.body.get("response");
        return fakeProviderResponse({ success: true });
      },
    },
  });

  assert.equal(submittedToken, "preferred-token");
  assert.equal(state.nextCalls, 1);
});

test("failed and malformed recaptcha responses return the exact provider failure", async () => {
  enableRecaptcha();

  const scenarios = [
    {
      fetchImpl: async () =>
        fakeProviderResponse(
          { success: false, "error-codes": ["invalid-input-response"] },
          403,
        ),
      diagnostic: expectedDiagnostic("siteverify-rejected", {
        httpStatus: 403,
        success: false,
        errorCodes: ["invalid-input-response"],
      }),
    },
    {
      fetchImpl: async () => ({
        status: 502,
        json: async () => {
          throw new SyntaxError("bad JSON");
        },
      }),
      diagnostic: expectedDiagnostic("siteverify-non-json", {
        httpStatus: 502,
        timedOut: false,
      }),
    },
  ];

  for (const { fetchImpl, diagnostic } of scenarios) {
    const { calls, result: { state } } = await captureDiagnostics(() =>
      runCaptcha({
        body: { recaptchaToken: "sensitive-recaptcha-token" },
        options: { fetchImpl },
      }),
    );
    assertDiagnostic(calls, diagnostic, [
      "test-recaptcha-secret",
      "sensitive-recaptcha-token",
    ]);
    assert.equal(state.status, 400);
    assert.deepEqual(state.body, { error: "Captcha failed" });
    assert.equal(state.nextCalls, 0);
  }
});

test("Turnstile posts the secret and token to Siteverify and sets only req.captcha", async () => {
  enableTurnstile();
  const calls = [];
  const providerResult = {
    success: true,
    action: "login",
    hostname: "example.com",
  };
  const req = { body: { captchaToken: "turnstile-token" } };
  const { state } = await runCaptcha({
    req,
    ip: "198.51.100.4",
    options: {
      expectedAction: "login",
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return fakeProviderResponse(providerResult);
      },
    },
  });

  assert.equal(
    calls[0].url,
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  );
  assert.equal(calls[0].init.method, "POST");
  assert.equal(
    calls[0].init.headers["Content-Type"],
    "application/x-www-form-urlencoded",
  );
  assert.equal(calls[0].init.body.get("secret"), "test-turnstile-secret");
  assert.equal(calls[0].init.body.get("response"), "turnstile-token");
  assert.equal(calls[0].init.body.get("remoteip"), "198.51.100.4");
  assert.equal(calls[0].url.includes("test-turnstile-secret"), false);
  assert.strictEqual(req.captcha, providerResult);
  assert.equal(req.recaptcha, undefined);
  assert.equal(state.nextCalls, 1);
});

test("Turnstile rejects provider failure and action mismatch", async () => {
  enableTurnstile();

  const scenarios = [
    {
      providerResult: {
        success: false,
        "error-codes": ["invalid-input-response"],
      },
      diagnostic: expectedDiagnostic("siteverify-rejected", {
        provider: "turnstile",
        httpStatus: 200,
        success: false,
        errorCodes: ["invalid-input-response"],
        expectedAction: "login",
      }),
    },
    {
      providerResult: {
        success: true,
        action: "register",
        hostname: "example.com",
      },
      diagnostic: expectedDiagnostic("action-mismatch", {
        provider: "turnstile",
        httpStatus: 200,
        success: true,
        expectedAction: "login",
        receivedAction: "register",
        receivedHostname: "example.com",
      }),
    },
  ];

  for (const { providerResult, diagnostic } of scenarios) {
    const { calls, result: { state } } = await captureDiagnostics(() =>
      runCaptcha({
        body: { captchaToken: "sensitive-turnstile-token" },
        options: {
          expectedAction: "login",
          fetchImpl: async () => fakeProviderResponse(providerResult),
        },
      }),
    );
    assertDiagnostic(calls, diagnostic, [
      "test-turnstile-secret",
      "sensitive-turnstile-token",
    ]);
    assert.equal(state.status, 400);
    assert.deepEqual(state.body, { error: "Captcha failed" });
    assert.equal(state.nextCalls, 0);
  }
});

test("Turnstile accepts the exact action and exact case-insensitive hostname", async () => {
  enableTurnstile();
  process.env.TURNSTILE_EXPECTED_HOSTNAMES = " Example.COM, www.example.com ";

  const { state } = await runCaptcha({
    body: { captchaToken: "token" },
    options: {
      expectedAction: "register",
      fetchImpl: async () =>
        fakeProviderResponse({
          success: true,
          action: "register",
          hostname: "EXAMPLE.com",
        }),
    },
  });

  assert.equal(state.status, 200);
  assert.equal(state.nextCalls, 1);
});

test("Turnstile rejects unlisted hostnames without wildcard suffix matching", async () => {
  enableTurnstile();

  for (const allowlist of ["allowed.example.com", "*.example.com"]) {
    process.env.TURNSTILE_EXPECTED_HOSTNAMES = allowlist;
    const { calls, result: { state } } = await captureDiagnostics(() =>
      runCaptcha({
        body: { captchaToken: "sensitive-turnstile-token" },
        options: {
          fetchImpl: async () =>
            fakeProviderResponse({
              success: true,
              hostname: "sub.example.com",
            }),
        },
      }),
    );
    assertDiagnostic(
      calls,
      expectedDiagnostic("hostname-mismatch", {
        provider: "turnstile",
        httpStatus: 200,
        success: true,
        expectedHostnames: [allowlist],
        receivedHostname: "sub.example.com",
      }),
      ["test-turnstile-secret", "sensitive-turnstile-token"],
    );
    assert.equal(state.status, 400);
    assert.deepEqual(state.body, { error: "Captcha failed" });
    assert.equal(state.nextCalls, 0);
  }
});

test("production Turnstile fails closed before fetch without expected hostnames", async () => {
  enableTurnstile();
  process.env.NODE_ENV = "production";
  let fetchCalls = 0;

  const { calls, result: { state } } = await captureDiagnostics(() =>
    runCaptcha({
      body: { captchaToken: "sensitive-turnstile-token" },
      options: {
        expectedAction: "login",
        fetchImpl: async () => {
          fetchCalls += 1;
          return fakeProviderResponse({ success: true });
        },
      },
    }),
  );

  assert.equal(fetchCalls, 0);
  assertDiagnostic(
    calls,
    expectedDiagnostic("missing-production-hostnames", {
      provider: "turnstile",
      expectedAction: "login",
    }),
    ["test-turnstile-secret", "sensitive-turnstile-token"],
  );
  assert.equal(state.status, 500);
  assert.deepEqual(state.body, { error: "Captcha verification error" });
  assert.equal(state.nextCalls, 0);
});

test("missing secrets and an invalid provider fail closed without network requests", async () => {
  process.env.CAPTCHA_ENABLED = "true";
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return fakeProviderResponse({ success: true });
  };

  for (const provider of ["recaptcha", "turnstile", "unsupported"]) {
    process.env.CAPTCHA_PROVIDER = provider;
    delete process.env.RECAPTCHA_SECRET;
    delete process.env.TURNSTILE_SECRET_KEY;
    const { calls, result: { state } } = await captureDiagnostics(() =>
      runCaptcha({
        body: { captchaToken: "sensitive-captcha-token" },
        options: { expectedAction: "login", fetchImpl },
      }),
    );
    assertDiagnostic(
      calls,
      expectedDiagnostic(
        provider === "unsupported" ? "invalid-provider" : "missing-secret",
        {
          provider: provider === "unsupported" ? "invalid" : provider,
          expectedAction: "login",
          secretPresent: false,
        },
      ),
      [
        "test-recaptcha-secret",
        "test-turnstile-secret",
        "sensitive-captcha-token",
      ],
    );
    assert.equal(state.status, 500);
    assert.deepEqual(state.body, { error: "Captcha verification error" });
    assert.equal(state.nextCalls, 0);
  }

  assert.equal(fetchCalls, 0);
});

test("network failure returns the generic 500 without exposing or logging secrets", async () => {
  enableTurnstile();
  const { calls, result: { state } } = await captureDiagnostics(() =>
    runCaptcha({
      body: { captchaToken: "sensitive-turnstile-token" },
      options: {
        expectedAction: "login",
        fetchImpl: async () => {
          const error = new Error(
            "network failed test-turnstile-secret sensitive-turnstile-token",
          );
          error.name = "test-turnstile-secret";
          throw error;
        },
      },
    }),
  );

  assertDiagnostic(
    calls,
    expectedDiagnostic("siteverify-network-error", {
      provider: "turnstile",
      expectedAction: "login",
      timedOut: false,
      errorName: "Error",
    }),
    ["test-turnstile-secret", "sensitive-turnstile-token"],
  );
  assert.equal(state.status, 500);
  assert.deepEqual(state.body, { error: "Captcha verification error" });
  assert.equal(JSON.stringify(state.body).includes("test-turnstile-secret"), false);
  assert.equal(state.nextCalls, 0);
});

test("request timeout aborts verification and returns the generic 500", async () => {
  enableRecaptcha();
  let aborted = false;
  const fetchImpl = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => {
          aborted = true;
          reject(new Error("aborted"));
        },
        { once: true },
      );
    });

  const { calls, result: { state } } = await captureDiagnostics(() =>
    runCaptcha({
      body: { recaptchaToken: "sensitive-recaptcha-token" },
      options: { expectedAction: "ignored-for-v2", fetchImpl, timeoutMs: 5 },
    }),
  );

  assert.equal(aborted, true);
  assertDiagnostic(
    calls,
    expectedDiagnostic("siteverify-network-error", {
      expectedAction: "ignored-for-v2",
      timedOut: true,
      errorName: "Error",
    }),
    ["test-recaptcha-secret", "sensitive-recaptcha-token"],
  );
  assert.equal(state.status, 500);
  assert.deepEqual(state.body, { error: "Captcha verification error" });
  assert.equal(state.nextCalls, 0);
});
