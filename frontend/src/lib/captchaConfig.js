const RECAPTCHA_SITE_KEY = "6LeuCt4rAAAAAMmxLbdnWGKp8XpfVJRMWSdjU4k_";
const CAPTCHA_PROVIDERS = new Set(["recaptcha", "turnstile"]);

export function getCaptchaConfig(env = import.meta.env) {
  const enabled = env?.VITE_CAPTCHA_ENABLED === "true";
  const provider = String(env?.VITE_CAPTCHA_PROVIDER ?? "recaptcha")
    .trim()
    .toLowerCase();
  const isSupportedProvider = CAPTCHA_PROVIDERS.has(provider);
  const siteKey = provider === "turnstile"
    ? String(env?.VITE_TURNSTILE_SITE_KEY ?? "").trim()
    : RECAPTCHA_SITE_KEY;
  const isValid = isSupportedProvider && (
    !enabled || provider !== "turnstile" || Boolean(siteKey)
  );

  return {
    enabled,
    provider,
    siteKey,
    isSupportedProvider,
    isValid,
  };
}

export const captchaConfig = getCaptchaConfig();
