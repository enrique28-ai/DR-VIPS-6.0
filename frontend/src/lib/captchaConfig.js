export function getCaptchaConfig(env = import.meta.env) {
  const enabled = env?.VITE_CAPTCHA_ENABLED === "true";
  const provider = String(env?.VITE_CAPTCHA_PROVIDER ?? "turnstile")
    .trim()
    .toLowerCase();
  const isSupportedProvider = provider === "turnstile";
  const siteKey = String(env?.VITE_TURNSTILE_SITE_KEY ?? "").trim();
  const isValid = isSupportedProvider && (
    !enabled || Boolean(siteKey)
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
