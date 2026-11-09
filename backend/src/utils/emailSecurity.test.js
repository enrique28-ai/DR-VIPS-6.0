import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { cloudflareTransporter } from "./cloudflareEmail.js";

const originalSend = cloudflareTransporter.sendMail;
const originalEmailProvider = process.env.EMAIL_PROVIDER;
const sentMessages = [];

let sendPasswordResetCodeEmail;
let sendResetSuccessEmail;
let sendVerificationEmail;
let sendWelcomeEmail;

before(async () => {
  process.env.EMAIL_PROVIDER = "cloudflare";
  cloudflareTransporter.sendMail = async (message) => {
    sentMessages.push(message);
  };

  ({
    sendPasswordResetCodeEmail,
    sendResetSuccessEmail,
    sendVerificationEmail,
    sendWelcomeEmail,
  } = await import("./email.js"));
});

beforeEach(() => {
  sentMessages.length = 0;
});

after(() => {
  cloudflareTransporter.sendMail = originalSend;
  if (originalEmailProvider === undefined) delete process.env.EMAIL_PROVIDER;
  else process.env.EMAIL_PROVIDER = originalEmailProvider;
});

test("welcome email escapes untrusted HTML while preserving Unicode names", async () => {
  await sendWelcomeEmail(
    "patient@example.com",
    '</strong><a href="https://attacker.example">Review</a><strong>',
  );

  const maliciousHtml = sentMessages[0].html;
  assert.doesNotMatch(maliciousHtml, /<a href="https:\/\/attacker\.example">/);
  assert.match(
    maliciousHtml,
    /&lt;\/strong&gt;&lt;a href=&quot;https:\/\/attacker\.example&quot;&gt;Review&lt;\/a&gt;&lt;strong&gt;/,
  );

  sentMessages.length = 0;
  await sendWelcomeEmail("patient@example.com", "José García");

  assert.match(sentMessages[0].html, /<strong>José García<\/strong>/);
});

test("verification and reset email helpers still send to a valid mailbox", async () => {
  await sendVerificationEmail("patient@example.com", "123456");
  await sendPasswordResetCodeEmail("patient@example.com", "654321");
  await sendResetSuccessEmail("patient@example.com");

  assert.equal(sentMessages.length, 3);
  for (const message of sentMessages) {
    assert.equal(message.to, "patient@example.com");
  }
  assert.match(sentMessages[0].html, />123456<\/span>/);
  assert.match(sentMessages[1].html, />654321<\/span>/);
});

test("all four email helpers preserve English and Spanish subjects/templates", async () => {
  const { getEmailSubjects, getEmailTemplates } = await import("./emailTemplates.js");
  for (const lang of ["en", "es"]) {
    sentMessages.length = 0;
    await sendVerificationEmail("patient@example.com", "123456", lang);
    await sendWelcomeEmail("patient@example.com", "José García", lang);
    await sendPasswordResetCodeEmail("patient@example.com", "654321", lang);
    await sendResetSuccessEmail("patient@example.com", lang);
    const subjects = getEmailSubjects(lang);
    const templates = getEmailTemplates(lang);
    assert.deepEqual(sentMessages.map(message => message.subject), [subjects.verify, subjects.welcome, subjects.resetCode || subjects.resetReq, subjects.resetOk]);
    assert.deepEqual(sentMessages.map(message => message.html), [templates.VERIFICATION_EMAIL_TEMPLATE.replace("{verificationCode}", "123456"), templates.WELCOME_EMAIL_TEMPLATE.replace("{name}", "José García"), templates.PASSWORD_RESET_CODE_TEMPLATE.replace("{resetCode}", "654321"), templates.PASSWORD_RESET_SUCCESS_TEMPLATE]);
  }
});
