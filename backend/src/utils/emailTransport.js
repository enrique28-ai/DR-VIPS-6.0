import { cloudflareTransporter } from "./cloudflareEmail.js";
import { gmailTransporter } from "./gmail.js";

export const transporter = {
  async sendMail(message) {
    const provider = String(process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
    if (provider === "cloudflare") return cloudflareTransporter.sendMail(message);
    if (provider === "gmail") return gmailTransporter.sendMail(message);
    throw new Error("Email provider is not configured");
  },
};
