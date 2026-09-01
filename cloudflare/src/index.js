import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

const API_INSTANCE_ID = "primary";

const removeEmptyValues = (values) =>
  Object.fromEntries(
    Object.entries(values).filter(([, value]) => typeof value === "string"),
  );

export class DrVipsApi extends Container {
  defaultPort = 8080;
  sleepAfter = "10m";
  enableInternet = true;

  envVars = removeEmptyValues({
    NODE_ENV: "production",
    PORT: "8080",

    MONGO_URI: env.MONGO_URI,
    JWT_SECRET: env.JWT_SECRET,
    PENDING_SECRET: env.PENDING_SECRET,
    CLIENT_URL: env.CLIENT_URL,

    CAPTCHA_ENABLED: env.CAPTCHA_ENABLED,
    CAPTCHA_PROVIDER: env.CAPTCHA_PROVIDER,
    RECAPTCHA_SECRET: env.RECAPTCHA_SECRET,
    TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY,
    TURNSTILE_EXPECTED_HOSTNAMES: env.TURNSTILE_EXPECTED_HOSTNAMES,

    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
    API_GOOGLE_REDIRECT_URI: env.API_GOOGLE_REDIRECT_URI,
    GOOGLE_REDIRECT_URI: env.GOOGLE_REDIRECT_URI,
    GOOGLE_REFRESH_TOKEN: env.GOOGLE_REFRESH_TOKEN,

    GMAIL_FROM_NAME: env.GMAIL_FROM_NAME,
    GMAIL_USER: env.GMAIL_USER,

    CLOUDFLARE_EMAIL_API_TOKEN: env.CLOUDFLARE_EMAIL_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
    EMAIL_FROM_ADDRESS: env.EMAIL_FROM_ADDRESS,
    EMAIL_FROM_NAME: env.EMAIL_FROM_NAME,
    EMAIL_PROVIDER: env.EMAIL_PROVIDER,

    CLOUDINARY_CLOUD_NAME: env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: env.CLOUDINARY_API_SECRET,

    DEEPL_API_KEY: env.DEEPL_API_KEY,

    APPT_REMINDER_MINUTES: env.APPT_REMINDER_MINUTES,
    APPT_REMINDERS_ENABLED: env.APPT_REMINDERS_ENABLED,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const isApiRequest =
      url.pathname === "/api" || url.pathname.startsWith("/api/");

    if (!isApiRequest) {
      return new Response("Not Found", { status: 404 });
    }

    const container = getContainer(env.DR_VIPS_API, API_INSTANCE_ID);
    return container.fetch(request);
  },
};
