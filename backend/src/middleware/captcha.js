const CAPTCHA_ERROR = { error: "Captcha verification error" };
const CAPTCHA_FAILED = { error: "Captcha failed" };

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
    return res.status(500).json(CAPTCHA_ERROR);
  }

  const isTurnstile = provider === "turnstile";
  const secret = isTurnstile
    ? process.env.TURNSTILE_SECRET_KEY
    : process.env.RECAPTCHA_SECRET;
  if (!String(secret ?? "").trim()) {
    return res.status(500).json(CAPTCHA_ERROR);
  }

  const expectedHostnames = isTurnstile ? getExpectedHostnames() : [];
  if (
    isTurnstile &&
    process.env.NODE_ENV === "production" &&
    expectedHostnames.length === 0
  ) {
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
  } catch {
    clearTimeout(timeout);
    return res.status(500).json(CAPTCHA_ERROR);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    const timedOut = controller.signal.aborted;
    clearTimeout(timeout);
    return res.status(timedOut ? 500 : 400).json(timedOut ? CAPTCHA_ERROR : CAPTCHA_FAILED);
  }
  clearTimeout(timeout);

  if (!data || typeof data !== "object" || data.success !== true) {
    return res.status(400).json(CAPTCHA_FAILED);
  }

  if (isTurnstile) {
    if (expectedAction !== undefined && data.action !== expectedAction) {
      return res.status(400).json(CAPTCHA_FAILED);
    }

    if (expectedHostnames.length > 0) {
      const hostname = String(data.hostname ?? "").trim().toLowerCase();
      if (!expectedHostnames.includes(hostname)) {
        return res.status(400).json(CAPTCHA_FAILED);
      }
    }
  }

  req.captcha = data;
  if (!isTurnstile) req.recaptcha = data;
  return next();
};
