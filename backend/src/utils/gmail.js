// utils/gmail.js  (reemplazo completo)
import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

const encodeHeaderWord = (str = "") => {
  const s = String(str);
  // si solo es ASCII, déjalo tal cual
  if (!/[^\x00-\x7F]/.test(s)) return s;
  const b64 = Buffer.from(s, "utf8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
};

const encodeFromHeader = (from) => {
  const s = String(from || "").trim();
  // intenta parsear: "Name" <email@...>
  const m = s.match(/^(?:"?([^"]*)"?\s*)?<([^>]+)>$/);
  if (!m) return s;
  const name = (m[1] || "").trim();
  const addr = (m[2] || "").trim();
  if (!name) return `<${addr}>`;
  return `${encodeHeaderWord(name)} <${addr}>`;
};


const oauth2 = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:5173/oauth/google/callback",
);

// Usamos refresh_token para obtener access_token automáticamente
oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const gmail = google.gmail({ version: "v1", auth: oauth2 });

// Mantén el mismo "From" que ya usas en email.js
export const fromAddress = `"${process.env.GMAIL_FROM_NAME || "DR-VIPS"}" <${process.env.GMAIL_USER}>`;

// "transporter" compatible con transporter.sendMail({...})
export const transporter = {
  async sendMail({ from = fromAddress, to, subject, html, text }) {
    const body = html ?? (text ? `<pre>${text}</pre>` : "");
    const lines = [
  `From: ${encodeFromHeader(from)}`,
  `To: ${to}`,
  `Subject: ${encodeHeaderWord(subject)}`,
  "MIME-Version: 1.0",
  'Content-Type: text/html; charset="UTF-8"',
  "Content-Transfer-Encoding: 8bit",
  "",
  body,
];


    // base64url (sin =, + → -, / → _)
    const raw = Buffer.from(lines.join("\r\n"))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
  },
};
