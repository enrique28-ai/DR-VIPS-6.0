const CAPTCHA_ERROR = { error: "Captcha verification error" };
const CAPTCHA_FAILED = { error: "Captcha failed" };
const CAPTCHA_DIAGNOSTIC_PREFIX = "[captcha-diagnostic]";
const SAFE_ERROR_NAMES = new Set([
  "AbortError",
  "Error",
  "FetchError",
  "NetworkError",
  "TimeoutError",
  "TypeError",
]);

const safeDiagnosticString = (
  value,
  sensitiveValues,
  { lowercase = false } = {},
) => {
  let normalized;
  try {
    normalized = String(value ?? "").trim();
  } catch {
    return null;
  }
  if (!normalized) return null;
  if (
    sensitiveValues.some(
      (sensitive) => sensitive && normalized.toLowerCase().includes(sensitive.toLowerCase()),
    )
  ) {
    return "[redacted]";
  }
  return lowercase ? normalized.toLowerCase() : normalized;
};

const logCaptchaDiagnostic = ({
  stage,
  provider,
  response,
  data,
  expectedAction,
  expectedHostnames = [],
  secret,
  token,
  timedOut,
  error,
}) => {
  const sensitiveValues = [secret, token]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const rawErrorCodes = Array.isArray(data?.["error-codes"])
    ? data["error-codes"]
    : [];
  const errorCodes = rawErrorCodes.map((code) => {
    const normalized = safeDiagnosticString(code, sensitiveValues, {
      lowercase: true,
    });
    return normalized && /^[a-z0-9_-]{1,100}$/.test(normalized)
      ? normalized
      : "unrecognized-error-code";
  });
  const errorName = safeDiagnosticString(error?.name, sensitiveValues);
  const diagnostic = {
    stage,
    provider:
      provider === "recaptcha" || provider === "turnstile"
        ? provider
        : "invalid",
    httpStatus: Number.isInteger(response?.status) ? response.status : null,
    success: typeof data?.success === "boolean" ? data.success : null,
    errorCodes,
    expectedAction: safeDiagnosticString(expectedAction, sensitiveValues),
    receivedAction: safeDiagnosticString(data?.action, sensitiveValues),
    expectedHostnames: expectedHostnames.map((hostname) =>
      safeDiagnosticString(hostname, sensitiveValues, { lowercase: true }),
    ),
    receivedHostname: safeDiagnosticString(data?.hostname, sensitiveValues, {
      lowercase: true,
    }),
    secretPresent: Boolean(String(secret ?? "").trim()),
    tokenPresent: Boolean(String(token ?? "").trim()),
  };

  if (timedOut !== undefined) diagnostic.timedOut = Boolean(timedOut);
  if (error !== undefined) {
    diagnostic.errorName = SAFE_ERROR_NAMES.has(errorName) ? errorName : "Error";
  }

  try {
    console.error(CAPTCHA_DIAGNOSTIC_PREFIX, diagnostic);
  } catch {
    // Diagnostics must never change the existing CAPTCHA response contract.
  }
};

export const isCaptchaEnabled = () => process.env.CAPTCHA_ENABLED === "true";

export const getCaptchaProvider = () =>
  String(process.env.CAPTCHA_PROVIDER ?? "recaptcha").trim().toLowerCase();

const getExpectedHostnames = () =>
  String(process.env.TURNSTILE_EXPECTED_HOSTNAMES ?? "")
    .split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);

export const verifyCaptcha = ({
  expectedAction,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000,
} = {}) => async (req, res, next) => {
  if (!isCaptchaEnabled()) return next();

  const token = req.body?.captchaToken ?? req.body?.recaptchaToken;
  if (!String(token ?? "").trim()) {
    return res.status(400).json({ error: "Missing captcha" });
  }

  const provider = getCaptchaProvider();
  if (provider !== "recaptcha" && provider !== "turnstile") {
    logCaptchaDiagnostic({
      stage: "invalid-provider",
      provider,
      expectedAction,
      token,
    });
    return res.status(500).json(CAPTCHA_ERROR);
  }

  const isTurnstile = provider === "turnstile";
  const secret = isTurnstile
    ? process.env.TURNSTILE_SECRET_KEY
    : process.env.RECAPTCHA_SECRET;
  if (!String(secret ?? "").trim()) {
    logCaptchaDiagnostic({
      stage: "missing-secret",
      provider,
      expectedAction,
      secret,
      token,
    });
    return res.status(500).json(CAPTCHA_ERROR);
  }

  const expectedHostnames = isTurnstile ? getExpectedHostnames() : [];
  if (
    isTurnstile &&
    process.env.NODE_ENV === "production" &&
    expectedHostnames.length === 0
  ) {
    logCaptchaDiagnostic({
      stage: "missing-production-hostnames",
      provider,
      expectedAction,
      expectedHostnames,
      secret,
      token,
    });
    return res.status(500).json(CAPTCHA_ERROR);
  }

  const params = new URLSearchParams();
  params.append("secret", secret);
  params.append("response", token);
  if (req.ip) params.append("remoteip", req.ip);

  const endpoint = isTurnstile
    ? "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    : "https://www.google.com/recaptcha/api/siteverify";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = controller.signal.aborted;
    clearTimeout(timeout);
    logCaptchaDiagnostic({
      stage: "siteverify-network-error",
      provider,
      expectedAction,
      expectedHostnames,
      secret,
      token,
      timedOut,
      error,
    });
    return res.status(500).json(CAPTCHA_ERROR);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    const timedOut = controller.signal.aborted;
    clearTimeout(timeout);
    logCaptchaDiagnostic({
      stage: "siteverify-non-json",
      provider,
      response,
      expectedAction,
      expectedHostnames,
      secret,
      token,
      timedOut,
    });
    return res.status(timedOut ? 500 : 400).json(timedOut ? CAPTCHA_ERROR : CAPTCHA_FAILED);
  }
  clearTimeout(timeout);

  if (!data || typeof data !== "object" || data.success !== true) {
    logCaptchaDiagnostic({
      stage: "siteverify-rejected",
      provider,
      response,
      data,
      expectedAction,
      expectedHostnames,
      secret,
      token,
    });
    return res.status(400).json(CAPTCHA_FAILED);
  }

  if (isTurnstile) {
    if (expectedAction !== undefined && data.action !== expectedAction) {
      logCaptchaDiagnostic({
        stage: "action-mismatch",
        provider,
        response,
        data,
        expectedAction,
        expectedHostnames,
        secret,
        token,
      });
      return res.status(400).json(CAPTCHA_FAILED);
    }

    if (expectedHostnames.length > 0) {
      const hostname = String(data.hostname ?? "").trim().toLowerCase();
      if (!expectedHostnames.includes(hostname)) {
        logCaptchaDiagnostic({
          stage: "hostname-mismatch",
          provider,
          response,
          data,
          expectedAction,
          expectedHostnames,
          secret,
          token,
        });
        return res.status(400).json(CAPTCHA_FAILED);
      }
    }
  }

  req.captcha = data;
  if (!isTurnstile) req.recaptcha = data;
  return next();
};
