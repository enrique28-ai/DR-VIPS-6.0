import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const workerSourceUrl = new URL("./index.js", import.meta.url);
const wranglerUrl = new URL("../../wrangler.jsonc", import.meta.url);

test("Worker passes email provider configuration and secret bindings to the Container", async () => {
  const source = await readFile(workerSourceUrl, "utf8");

  for (const name of [
    "CLOUDFLARE_EMAIL_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "EMAIL_FROM_ADDRESS",
    "EMAIL_FROM_NAME",
    "EMAIL_PROVIDER",
  ]) {
    assert.match(source, new RegExp(`${name}: env\\.${name}`));
  }

  assert.match(source, /GOOGLE_CLIENT_ID: env\.GOOGLE_CLIENT_ID/);
  assert.match(source, /GMAIL_USER: env\.GMAIL_USER/);
  assert.match(
    source,
    /PROFESSIONAL_ALLOWLIST_ENFORCED: env\.PROFESSIONAL_ALLOWLIST_ENFORCED/,
  );
});

test("Wrangler contains only non-secret production email settings", async () => {
  const source = (await readFile(wranglerUrl, "utf8")).replace(/^\uFEFF/u, "");
  const wrangler = JSON.parse(source);

  assert.equal(wrangler.vars.EMAIL_PROVIDER, "cloudflare");
  assert.equal(wrangler.vars.EMAIL_FROM_ADDRESS, "noreply@mail.dr-vips.com");
  assert.equal(wrangler.vars.EMAIL_FROM_NAME, "DR-VIPS");
  assert.equal(Object.hasOwn(wrangler.vars, "CLOUDFLARE_EMAIL_API_TOKEN"), false);
  assert.equal(Object.hasOwn(wrangler.vars, "CLOUDFLARE_ACCOUNT_ID"), true);
  assert.match(wrangler.vars.CLOUDFLARE_ACCOUNT_ID, /^[a-f0-9]{32}$/i);
  assert.equal(wrangler.vars.PROFESSIONAL_ALLOWLIST_ENFORCED, "false");
});
