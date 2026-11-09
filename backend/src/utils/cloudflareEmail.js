import { normalizeSingleMailbox } from "./emailAddress.js";

const CLOUDFLARE_EMAIL_API_BASE =
  "https://api.cloudflare.com/client/v4/accounts";
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;

const requiredConfig = (name) => {
  const value = process.env[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing Cloudflare email configuration: ${name}`);
  }
  return value.trim();
};

const getCloudflareEmailConfig = () => {
  const apiToken = requiredConfig("CLOUDFLARE_EMAIL_API_TOKEN");
  const accountId = requiredConfig("CLOUDFLARE_ACCOUNT_ID");
  const fromAddress = normalizeSingleMailbox(requiredConfig("EMAIL_FROM_ADDRESS"));
  const fromName = requiredConfig("EMAIL_FROM_NAME");

  if (!fromAddress || CONTROL_CHARACTERS.test(fromName)) {
    throw new Error("Invalid Cloudflare email sender configuration");
  }

  return { apiToken, accountId, fromAddress, fromName };
};

export const cloudflareTransporter = {
  async sendMail({ to, subject, html, text }) {
    const recipient = normalizeSingleMailbox(to);
    if (!recipient) throw new Error("Invalid email recipient");

    const { apiToken, accountId, fromAddress, fromName } =
      getCloudflareEmailConfig();
    const body = {
      to: recipient,
      from: { address: fromAddress, name: fromName },
      subject: String(subject ?? ""),
    };
    if (html !== undefined) body.html = html;
    if (text !== undefined) body.text = text;

    let response;
    try {
      response = await fetch(
        `${CLOUDFLARE_EMAIL_API_BASE}/${encodeURIComponent(accountId)}/email/sending/send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
    } catch {
      throw new Error("Cloudflare email request failed");
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Cloudflare email request failed");
    }

    if (!response.ok || payload?.success !== true) {
      throw new Error("Cloudflare email request failed");
    }

    return payload.result;
  },
};
