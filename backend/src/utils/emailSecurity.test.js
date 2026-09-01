import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { google } from "googleapis";

const originalGoogleGmail = google.gmail;
const originalEmailProvider = process.env.EMAIL_PROVIDER;
const sentMessages = [];

let transporter;
let sendPasswordResetCodeEmail;
let sendResetSuccessEmail;
let sendVerificationEmail;
let sendWelcomeEmail;

before(async () => {
  process.env.EMAIL_PROVIDER = "gmail";
  google.gmail = () => ({
    users: {
      messages: {
        send: async (message) => {
          sentMessages.push(message);
          return { data: { id: "message-id" } };
        },
      },
    },
  });

  ({ transporter } = await import("./emailTransport.js"));
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
  google.gmail = originalGoogleGmail;
  if (originalEmailProvider === undefined) delete process.env.EMAIL_PROVIDER;
  else process.env.EMAIL_PROVIDER = originalEmailProvider;
});

const decodeRaw = (message) => Buffer.from(
  message.requestBody.raw,
  "base64url",
).toString("utf8");

test("Gmail recipient boundary rejects header and multi-recipient forms", async () => {
  const unsafeRecipients = [
    "victim@example.com\r\nBcc: attacker@example.com",
    "victim@example.com\rBcc: attacker@example.com",
    "victim@example.com\nBcc: attacker@example.com",
    "victim@example.com\0attacker@example.com",
    "victim@example.com\tBcc: attacker@example.com",
    "victim@example.com\u2028Bcc: attacker@example.com",
    "victim@example.com, attacker@example.com",
    "victim@example.com; attacker@example.com",
    "Victim <victim@example.com>",
    "not-an-email",
    ["victim@example.com", "attacker@example.com"],
  ];

  for (const to of unsafeRecipients) {
    await assert.rejects(
      transporter.sendMail({ to, subject: "Test", html: "<p>Test</p>" }),
      /Invalid email recipient/,
      String(to),
    );
  }

  assert.equal(sentMessages.length, 0);
});

test("Gmail recipient boundary serializes one normalized mailbox", async () => {
  await transporter.sendMail({
    to: "  Patient.User+alerts@Sub-Domain.Example.COM  ",
    subject: "Test",
    html: "<p>Test</p>",
  });

  assert.equal(sentMessages.length, 1);
  assert.match(
    decodeRaw(sentMessages[0]),
    /\r\nTo: patient\.user\+alerts@sub-domain\.example\.com\r\n/,
  );
});

test("welcome email escapes untrusted HTML while preserving Unicode names", async () => {
  await sendWelcomeEmail(
    "patient@example.com",
    '</strong><a href="https://attacker.example">Review</a><strong>',
  );

  const maliciousHtml = decodeRaw(sentMessages[0]);
  assert.doesNotMatch(maliciousHtml, /<a href="https:\/\/attacker\.example">/);
  assert.match(
    maliciousHtml,
    /&lt;\/strong&gt;&lt;a href=&quot;https:\/\/attacker\.example&quot;&gt;Review&lt;\/a&gt;&lt;strong&gt;/,
  );

  sentMessages.length = 0;
  await sendWelcomeEmail("patient@example.com", "José García");

  assert.match(decodeRaw(sentMessages[0]), /<strong>José García<\/strong>/);
});

test("verification and reset email helpers still send to a valid mailbox", async () => {
  await sendVerificationEmail("patient@example.com", "123456");
  await sendPasswordResetCodeEmail("patient@example.com", "654321");
  await sendResetSuccessEmail("patient@example.com");

  assert.equal(sentMessages.length, 3);
  for (const message of sentMessages) {
    assert.match(decodeRaw(message), /\r\nTo: patient@example\.com\r\n/);
  }
  assert.match(decodeRaw(sentMessages[0]), />123456<\/span>/);
  assert.match(decodeRaw(sentMessages[1]), />654321<\/span>/);
});
