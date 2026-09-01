import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";

import { cloudflareTransporter } from "./cloudflareEmail.js";
import { sendVerificationEmail } from "./email.js";
import { transporter } from "./emailTransport.js";
import { gmailTransporter } from "./gmail.js";

const CONFIG_NAMES = [
  "CLOUDFLARE_EMAIL_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "EMAIL_FROM_ADDRESS",
  "EMAIL_FROM_NAME",
  "EMAIL_PROVIDER",
];

const originalFetch = globalThis.fetch;
const originalGmailSend = gmailTransporter.sendMail;
const originalCloudflareSend = cloudflareTransporter.sendMail;

const configureCloudflare = () => {
  process.env.CLOUDFLARE_EMAIL_API_TOKEN = "test-email-api-token";
  process.env.CLOUDFLARE_ACCOUNT_ID = "account-id-123";
  process.env.EMAIL_FROM_ADDRESS = "noreply@mail.dr-vips.com";
  process.env.EMAIL_FROM_NAME = "DR-VIPS";
  process.env.EMAIL_PROVIDER = "cloudflare";
};

beforeEach(() => {
  configureCloudflare();
  globalThis.fetch = originalFetch;
  gmailTransporter.sendMail = originalGmailSend;
  cloudflareTransporter.sendMail = originalCloudflareSend;
});

afterEach(() => {
  for (const name of CONFIG_NAMES) delete process.env[name];
  globalThis.fetch = originalFetch;
  gmailTransporter.sendMail = originalGmailSend;
  cloudflareTransporter.sendMail = originalCloudflareSend;
});

test("Cloudflare transport sends one normalized message with configured sender", async () => {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          success: true,
          errors: [],
          result: { message_id: "message-id", queued: ["patient@example.com"] },
        };
      },
    };
  };

  const html = "<p>Verification code: <strong>123456</strong></p>";
  const text = "Verification code: 123456";
  const result = await cloudflareTransporter.sendMail({
    from: "Attacker <attacker@example.com>",
    to: "  Patient@Example.COM  ",
    subject: "Verify your email",
    html,
    text,
  });

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].url,
    "https://api.cloudflare.com/client/v4/accounts/account-id-123/email/sending/send",
  );
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.headers["Content-Type"], "application/json");
  assert.equal(typeof requests[0].options.headers.Authorization, "string");
  assert.equal(
    createHash("sha256").update(requests[0].options.headers.Authorization).digest("hex"),
    createHash("sha256")
      .update(`Bearer ${process.env.CLOUDFLARE_EMAIL_API_TOKEN}`)
      .digest("hex"),
  );

  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.to, "patient@example.com");
  assert.deepEqual(body.from, {
    address: "noreply@mail.dr-vips.com",
    name: "DR-VIPS",
  });
  assert.equal(body.subject, "Verify your email");
  assert.equal(body.html, html);
  assert.equal(body.text, text);
  assert.deepEqual(result, { message_id: "message-id", queued: ["patient@example.com"] });
});

test("Cloudflare transport rejects unsafe recipients before fetch", async () => {
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch must not run");
  };

  const unsafeRecipients = [
    "victim@example.com\r\nBcc: attacker@example.com",
    "victim@example.com,attacker@example.com",
    "Victim <victim@example.com>",
    "not-an-email",
    ["victim@example.com"],
  ];

  for (const to of unsafeRecipients) {
    await assert.rejects(
      cloudflareTransporter.sendMail({ to, subject: "Test", text: "Test" }),
      { message: "Invalid email recipient" },
    );
  }

  assert.equal(fetchCalls, 0);
});

test("Cloudflare transport fails clearly before fetch when configuration is missing", async () => {
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch must not run");
  };

  for (const name of [
    "CLOUDFLARE_EMAIL_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "EMAIL_FROM_ADDRESS",
    "EMAIL_FROM_NAME",
  ]) {
    configureCloudflare();
    delete process.env[name];
    await assert.rejects(
      cloudflareTransporter.sendMail({
        to: "patient@example.com",
        subject: "Test",
        text: "Test",
      }),
      { message: `Missing Cloudflare email configuration: ${name}` },
    );
  }

  assert.equal(fetchCalls, 0);
});

test("Cloudflare transport rejects invalid configured senders before fetch", async () => {
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch must not run");
  };

  process.env.EMAIL_FROM_ADDRESS = "Sender <noreply@mail.dr-vips.com>";
  await assert.rejects(
    cloudflareTransporter.sendMail({
      to: "patient@example.com",
      subject: "Test",
      text: "Test",
    }),
    { message: "Invalid Cloudflare email sender configuration" },
  );

  configureCloudflare();
  process.env.EMAIL_FROM_NAME = "DR-VIPS\r\nBcc: attacker@example.com";
  await assert.rejects(
    cloudflareTransporter.sendMail({
      to: "patient@example.com",
      subject: "Test",
      text: "Test",
    }),
    { message: "Invalid Cloudflare email sender configuration" },
  );

  assert.equal(fetchCalls, 0);
});

test("Cloudflare API failures expose only a safe transport error", async () => {
  const privateProviderDetail = "private-provider-diagnostic";
  globalThis.fetch = async () => ({
    ok: false,
    async json() {
      return {
        success: false,
        errors: [{ message: privateProviderDetail }],
      };
    },
  });

  let thrown;
  try {
    await cloudflareTransporter.sendMail({
      to: "patient@example.com",
      subject: "Test",
      html: "<p>Test</p>",
    });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof Error);
  assert.equal(thrown.message, "Cloudflare email request failed");
  assert.equal(thrown.message.includes(privateProviderDetail), false);
  assert.equal(thrown.message.includes(process.env.CLOUDFLARE_EMAIL_API_TOKEN), false);
});

test("Cloudflare failure envelopes and malformed responses remain sanitized", async () => {
  const responses = [
    {
      ok: true,
      async json() {
        return { success: false, errors: [{ message: "private-envelope-detail" }] };
      },
    },
    {
      ok: true,
      async json() {
        throw new Error("private-json-detail");
      },
    },
  ];
  let fetchCalls = 0;
  globalThis.fetch = async () => responses[fetchCalls++];

  for (let attempt = 0; attempt < responses.length; attempt += 1) {
    await assert.rejects(
      cloudflareTransporter.sendMail({
        to: "patient@example.com",
        subject: "Test",
        text: "Test",
      }),
      { message: "Cloudflare email request failed" },
    );
  }

  assert.equal(fetchCalls, 2);
});

test("explicit provider selection uses only the selected transport", async () => {
  let gmailCalls = 0;
  let cloudflareCalls = 0;
  gmailTransporter.sendMail = async () => {
    gmailCalls += 1;
  };
  cloudflareTransporter.sendMail = async () => {
    cloudflareCalls += 1;
  };

  process.env.EMAIL_PROVIDER = "gmail";
  await transporter.sendMail({ to: "patient@example.com", subject: "Gmail", text: "Gmail" });
  assert.equal(gmailCalls, 1);
  assert.equal(cloudflareCalls, 0);

  process.env.EMAIL_PROVIDER = "cloudflare";
  await transporter.sendMail({
    to: "patient@example.com",
    subject: "Cloudflare",
    text: "Cloudflare",
  });
  assert.equal(gmailCalls, 1);
  assert.equal(cloudflareCalls, 1);
});

test("email helpers use Cloudflare when it is the selected provider", async () => {
  let gmailCalls = 0;
  gmailTransporter.sendMail = async () => {
    gmailCalls += 1;
  };

  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      async json() {
        return { success: true, errors: [], result: { message_id: "verification-id" } };
      },
    };
  };

  process.env.EMAIL_PROVIDER = "cloudflare";
  await sendVerificationEmail("  Patient@Example.COM  ", "123456");

  assert.equal(requests.length, 1);
  assert.equal(gmailCalls, 0);
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.to, "patient@example.com");
  assert.match(body.subject, /verify/i);
  assert.match(body.html, />123456<\/span>/);
});

test("a Cloudflare network failure is not retried or sent through Gmail", async () => {
  const privateNetworkDetail = "private-network-diagnostic";
  let gmailCalls = 0;
  let fetchCalls = 0;
  gmailTransporter.sendMail = async () => {
    gmailCalls += 1;
  };
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error(privateNetworkDetail);
  };

  process.env.EMAIL_PROVIDER = "cloudflare";
  let thrown;
  try {
    await transporter.sendMail({ to: "patient@example.com", subject: "Test", text: "Test" });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof Error);
  assert.equal(thrown.message, "Cloudflare email request failed");
  assert.equal(thrown.message.includes(privateNetworkDetail), false);
  assert.equal(thrown.message.includes(process.env.CLOUDFLARE_EMAIL_API_TOKEN), false);
  assert.equal(fetchCalls, 1);
  assert.equal(gmailCalls, 0);
});

test("email helper failures preserve the sanitized Cloudflare error", async () => {
  globalThis.fetch = async () => {
    throw new Error("private-network-diagnostic");
  };

  process.env.EMAIL_PROVIDER = "cloudflare";
  await assert.rejects(
    sendVerificationEmail("patient@example.com", "123456"),
    { message: "Error sending verification email: Cloudflare email request failed" },
  );
});

test("missing or unsupported provider fails without sending", async () => {
  let gmailCalls = 0;
  let cloudflareCalls = 0;
  gmailTransporter.sendMail = async () => {
    gmailCalls += 1;
  };
  cloudflareTransporter.sendMail = async () => {
    cloudflareCalls += 1;
  };

  for (const provider of [undefined, "smtp", ""]) {
    if (provider === undefined) delete process.env.EMAIL_PROVIDER;
    else process.env.EMAIL_PROVIDER = provider;
    await assert.rejects(
      transporter.sendMail({ to: "patient@example.com", subject: "Test", text: "Test" }),
      { message: "Email provider is not configured" },
    );
  }

  assert.equal(gmailCalls, 0);
  assert.equal(cloudflareCalls, 0);
});
