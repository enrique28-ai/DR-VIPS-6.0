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

    CLOUDINARY_CLOUD_NAME: env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: env.CLOUDINARY_API_SECRET,

    APPT_REMINDER_MINUTES: env.APPT_REMINDER_MINUTES,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api")) {
      return new Response("Not Found", { status: 404 });
    }

    const container = getContainer(env.DR_VIPS_API, API_INSTANCE_ID);
    return container.fetch(request);
  },
};
