import path from "node:path";
import { fileURLToPath } from "node:url";

export const PRODUCTION_SMOKE_FAILURE_CODES = Object.freeze([
  "LIVE_HTTP",
  "LIVE_BODY",
  "READY_HTTP",
  "READY_BODY",
  "LANDING_HTTP",
  "LANDING_BODY",
  "FETCH_FAILED",
  "TIMEOUT",
  "INVALID_BASE_URL",
]);

const FAILURE_CODE_SET = new Set(PRODUCTION_SMOKE_FAILURE_CODES);

const failure = (code, status) => {
  const error = new Error(code);
  error.code = code;

  if (Number.isInteger(status)) {
    error.status = status;
  }

  return error;
};

const allowlistedFailure = (error) => {
  const code = FAILURE_CODE_SET.has(error?.code)
    ? error.code
    : "FETCH_FAILED";
  const status = Number.isInteger(error?.status)
    ? error.status
    : undefined;

  return failure(code, status);
};

const safeLog = (logger, level, event, fields = {}) => {
  try {
    const log = logger?.[level];
    if (typeof log === "function") {
      log.call(logger, "[prod-smoke]", { event, ...fields });
    }
  } catch {
    // Diagnostics must never change the health-check result.
  }
};

const validateBaseUrl = (baseUrl) => {
  let parsed;

  try {
    parsed = new URL(baseUrl);
  } catch {
    throw failure("INVALID_BASE_URL");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.origin !== "https://dr-vips.com" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    throw failure("INVALID_BASE_URL");
  }

  return parsed.origin;
};

const isTimeoutError = (error) =>
  error?.name === "AbortError" || error?.name === "TimeoutError";

const request = async ({ fetchImpl, url, requestTimeoutMs }) => {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });

    if (!response || !Number.isInteger(response.status)) {
      throw failure("FETCH_FAILED");
    }

    return response;
  } catch (error) {
    if (FAILURE_CODE_SET.has(error?.code)) {
      throw allowlistedFailure(error);
    }

    throw failure(isTimeoutError(error) ? "TIMEOUT" : "FETCH_FAILED");
  }
};

const readJson = async (response, bodyCode) => {
  try {
    return await response.json();
  } catch {
    throw failure(bodyCode);
  }
};

const readText = async (response) => {
  try {
    return await response.text();
  } catch {
    throw failure("LANDING_BODY");
  }
};

const checkLive = async (options) => {
  const response = await request({
    ...options,
    url: `${options.baseUrl}/api/health/live`,
  });

  if (response.status !== 200) {
    throw failure("LIVE_HTTP", response.status);
  }

  const body = await readJson(response, "LIVE_BODY");
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    body.status !== "ok"
  ) {
    throw failure("LIVE_BODY");
  }
};

const checkReady = async (options) => {
  const response = await request({
    ...options,
    url: `${options.baseUrl}/api/health/ready`,
  });

  if (response.status !== 200) {
    throw failure("READY_HTTP", response.status);
  }

  const body = await readJson(response, "READY_BODY");
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    body.status !== "ready"
  ) {
    throw failure("READY_BODY");
  }
};

const checkLanding = async (options) => {
  const response = await request({
    ...options,
    url: `${options.baseUrl}/`,
  });

  if (response.status < 200 || response.status > 299) {
    throw failure("LANDING_HTTP", response.status);
  }

  const body = await readText(response);
  if (
    typeof body !== "string" ||
    body.trim() === "" ||
    !/<html\b/i.test(body)
  ) {
    throw failure("LANDING_BODY");
  }
};

export const defaultSleep = (delayMs) =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

export async function checkProduction({
  baseUrl = "https://dr-vips.com",
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  attempts = 12,
  delayMs = 10_000,
  requestTimeoutMs = 10_000,
  logger = console,
} = {}) {
  let productionOrigin;

  try {
    productionOrigin = validateBaseUrl(baseUrl);
  } catch (error) {
    const sanitized = allowlistedFailure(error);
    safeLog(logger, "error", "failed", { code: sanitized.code });
    throw sanitized;
  }

  const attemptLimit = Number.isInteger(attempts) && attempts > 0
    ? attempts
    : 12;
  const retryDelay = Number.isFinite(delayMs) && delayMs >= 0
    ? delayMs
    : 10_000;
  const timeout = Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0
    ? requestTimeoutMs
    : 10_000;

  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    try {
      const options = {
        baseUrl: productionOrigin,
        fetchImpl,
        requestTimeoutMs: timeout,
      };

      await checkLive(options);
      await checkReady(options);
      await checkLanding(options);

      safeLog(logger, "log", "healthy", { attempt });
      return { status: "healthy", attempt };
    } catch (error) {
      const sanitized = allowlistedFailure(error);
      const diagnostic = {
        attempt,
        code: sanitized.code,
        ...(Number.isInteger(sanitized.status)
          ? { status: sanitized.status }
          : {}),
      };

      safeLog(logger, "warn", "attempt_failed", diagnostic);

      if (attempt === attemptLimit) {
        safeLog(logger, "error", "failed", diagnostic);
        throw sanitized;
      }

      try {
        await sleep(retryDelay);
      } catch {
        const sleepFailure = failure("FETCH_FAILED");
        safeLog(logger, "error", "failed", {
          attempt,
          code: sleepFailure.code,
        });
        throw sleepFailure;
      }
    }
  }

  throw failure("FETCH_FAILED");
}

const isDirectExecution =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  try {
    await checkProduction();
  } catch {
    process.exitCode = 1;
  }
}
