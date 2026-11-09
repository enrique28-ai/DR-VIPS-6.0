// server/emailTemplates.js
import { en } from './emailLocals/en.js';
import { es } from './emailLocals/es.js';
// DR-VIPS palette
const brand = {
  name: "DR-VIPS",
  bgTop: "linear-gradient(135deg,#1e40af,#3b82f6)",
  cardBg: "#0b1220",
  text: "#e5e7eb",
  subtext: "#9aa4b2",
  accent: "#3b82f6",
  btnBg: "#0f172a",
  btnText: "#ffffff",
  codeBg: "#0f172a",
  border: "rgba(255,255,255,0.08)",
};

const COPY = { en, es };

const normalizeLang = (lang = "en") => {
  const l = String(lang || "en").toLowerCase();
  const short = l.split(",")[0].trim().split("-")[0].split("_")[0];
  return ["en", "es"].includes(short) ? short : "en";
};

const baseHead = `
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${brand.name}</title>
`;

const header = (title) => `
  <div style="padding:22px 24px;background:${brand.bgTop}">
    <div style="font-size:24px;line-height:1.2;color:#fff;font-weight:800;letter-spacing:.2px">
      <span style="display:inline-block;margin-right:8px">🩺</span>${brand.name}
    </div>
    <div style="margin-top:8px;font-size:14px;color:#e5efff;opacity:.9">${title}</div>
  </div>
`;

const footer = (lang) => {
  const L = normalizeLang(lang);
  return `
    <div style="text-align:center;margin-top:16px;color:${brand.subtext};font-size:12px">
      ${COPY[L].footer}
    </div>
  `;
};

const shell = (lang, title, inner) => {
  const L = normalizeLang(lang);
  return `
<!doctype html>
<html lang="${L}">
<head>${baseHead}</head>
<body style="margin:0;background:#0a0f1c;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0"
          style="width:100%;max-width:600px;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.35);background:${brand.cardBg};border:1px solid ${brand.border}">
          <tr><td>${header(title)}</td></tr>
          <tr>
            <td style="padding:24px 24px 28px;color:${brand.text};font-size:15px;line-height:1.6">
              ${inner}
              ${footer(L)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

export const getEmailSubjects = (lang = "en") => {
  const L = normalizeLang(lang);
  return COPY[L].subjects;
};

export const getEmailTemplates = (lang = "en") => {
  const L = normalizeLang(lang);
  const c = COPY[L];

  return {
    VERIFICATION_EMAIL_TEMPLATE: shell(
      L,
      c.verify.title,
      `
      <p style="margin:0 0 8px">${c.verify.hi}</p>
      <p style="margin:0 0 16px">${c.verify.codeLabel}</p>
      <div style="text-align:center;margin:22px 0 18px">
        <span style="
          display:inline-block;
          background:${brand.codeBg};
          color:#fff;
          border:1px solid ${brand.border};
          letter-spacing:6px;
          font-weight:800;
          font-size:28px;
          padding:16px 24px;
          border-radius:12px;
          box-shadow:inset 0 0 0 1px rgba(255,255,255,.04);
        ">{verificationCode}</span>
      </div>
      <p style="margin:0 0 8px">${c.verify.instructions}</p>
      <p style="margin:0;color:${brand.subtext}">${c.verify.ignore}</p>
      `
    ),

   PASSWORD_RESET_CODE_TEMPLATE: shell(
  L,
  c.resetCode.title,
  `
  <p style="margin:0 0 8px">${c.resetCode.hi}</p>
  <p style="margin:0 0 16px">${c.resetCode.codeLabel}</p>

  <div style="text-align:center;margin:22px 0 18px">
    <span style="
      display:inline-block;
      background:${brand.codeBg};
      color:#fff;
      border:1px solid ${brand.border};
      letter-spacing:6px;
      font-weight:800;
      font-size:28px;
      padding:16px 24px;
      border-radius:12px;
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.04);
    ">{resetCode}</span>
  </div>

  <p style="margin:0 0 8px">${c.resetCode.instructions}</p>
  <p style="margin:0;color:${brand.subtext}">${c.resetCode.ignore}</p>
  `
),


    PASSWORD_RESET_SUCCESS_TEMPLATE: shell(
      L,
      c.resetOk.title,
      `
      <p style="margin:0 0 8px">${c.resetOk.hi}</p>
      <p style="margin:0 0 10px">${c.resetOk.p1}</p>
      <p style="margin:0;color:${brand.subtext}">${c.resetOk.p2}</p>
      `
    ),

    WELCOME_EMAIL_TEMPLATE: shell(
      L,
      c.welcome.title,
      `
      <p style="margin:0 0 8px">${L === "es" ? "Hola" : "Hi"} <strong>{name}</strong>,</p>
      <p style="margin:0 0 12px">
        ${c.welcome.p1} <strong>${brand.name}</strong>. ${c.welcome.p2}
      </p>
      <div style="
        margin:18px 0 22px;padding:14px 16px;border:1px solid ${brand.border};
        border-radius:12px;background:rgba(255,255,255,.02);color:${brand.subtext}
      ">
        ${c.welcome.tip}
      </div>
      <p style="margin:0;color:${brand.subtext}">${c.welcome.help}</p>
      `
    ),
  };
};

// Back-compat (english defaults)
const EN = getEmailTemplates("en");
export const VERIFICATION_EMAIL_TEMPLATE = EN.VERIFICATION_EMAIL_TEMPLATE;
export const PASSWORD_RESET_CODE_TEMPLATE = EN.PASSWORD_RESET_CODE_TEMPLATE;
export const PASSWORD_RESET_SUCCESS_TEMPLATE = EN.PASSWORD_RESET_SUCCESS_TEMPLATE;
export const WELCOME_EMAIL_TEMPLATE = EN.WELCOME_EMAIL_TEMPLATE;
