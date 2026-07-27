import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getCaptchaConfig } from "./captchaConfig.js";

const { describe, expect, test } = globalThis;
const captchaConfigSource = readFileSync(
  resolve(
    globalThis.process.cwd(),
    globalThis.vi ? "src/lib/captchaConfig.js" : "frontend/src/lib/captchaConfig.js",
  ),
  "utf8",
);

const RECAPTCHA_SITE_KEY = "6LeuCt4rAAAAAMmxLbdnWGKp8XpfVJRMWSdjU4k_";

if (globalThis.vi) describe("getCaptchaConfig", () => {
  test("enables CAPTCHA only for the exact string true", () => {
    for (const value of [undefined, "", "TRUE", " true ", "1", true]) {
      expect(getCaptchaConfig({ VITE_CAPTCHA_ENABLED: value }).enabled).toBe(false);
    }

    expect(getCaptchaConfig({ VITE_CAPTCHA_ENABLED: "true" }).enabled).toBe(true);
  });

  test("defaults to reCAPTCHA and returns the exact compatibility config", () => {
    expect(getCaptchaConfig({ VITE_CAPTCHA_ENABLED: "true" })).toEqual({
      enabled: true,
      provider: "recaptcha",
      siteKey: RECAPTCHA_SITE_KEY,
      isSupportedProvider: true,
      isValid: true,
    });
  });

  test("normalizes providers and trims the public Turnstile site key", () => {
    expect(
      getCaptchaConfig({
        VITE_CAPTCHA_ENABLED: "true",
        VITE_CAPTCHA_PROVIDER: "  TuRnStIlE  ",
        VITE_TURNSTILE_SITE_KEY: "  public-site-key  ",
      }),
    ).toEqual({
      enabled: true,
      provider: "turnstile",
      siteKey: "public-site-key",
      isSupportedProvider: true,
      isValid: true,
    });
  });

  test("fails enabled Turnstile closed when its public site key is missing", () => {
    expect(
      getCaptchaConfig({
        VITE_CAPTCHA_ENABLED: "true",
        VITE_CAPTCHA_PROVIDER: "turnstile",
        VITE_TURNSTILE_SITE_KEY: "   ",
      }),
    ).toMatchObject({
      enabled: true,
      provider: "turnstile",
      siteKey: "",
      isSupportedProvider: true,
      isValid: false,
    });
  });

  test("does not require a Turnstile site key while CAPTCHA is disabled", () => {
    expect(
      getCaptchaConfig({
        VITE_CAPTCHA_ENABLED: "false",
        VITE_CAPTCHA_PROVIDER: "turnstile",
      }),
    ).toMatchObject({
      enabled: false,
      provider: "turnstile",
      siteKey: "",
      isSupportedProvider: true,
      isValid: true,
    });
  });

  test("marks unsupported providers invalid without treating them as Turnstile", () => {
    expect(
      getCaptchaConfig({
        VITE_CAPTCHA_ENABLED: "true",
        VITE_CAPTCHA_PROVIDER: " hCaptcha ",
        VITE_TURNSTILE_SITE_KEY: "unused",
      }),
    ).toEqual({
      enabled: true,
      provider: "hcaptcha",
      siteKey: RECAPTCHA_SITE_KEY,
      isSupportedProvider: false,
      isValid: false,
    });
  });

  test("contains public site-key configuration only and no server secret reference", () => {
    expect(captchaConfigSource).toContain("VITE_TURNSTILE_SITE_KEY");
    expect(captchaConfigSource).not.toMatch(/RECAPTCHA_SECRET|TURNSTILE_SECRET|SECRET_KEY/);
  });
});
