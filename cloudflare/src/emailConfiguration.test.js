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
  for (const obsolete of ["GMAIL_USER", "GMAIL_FROM_NAME", "GOOGLE_REFRESH_TOKEN", "GOOGLE_REDIRECT_URI", "RECAPTCHA_SECRET"]) {
    assert.doesNotMatch(source, new RegExp(`\\b${obsolete}:`));
  }
  assert.match(source, /GOOGLE_CLIENT_SECRET: env\.GOOGLE_CLIENT_SECRET/);
  assert.match(source, /API_GOOGLE_REDIRECT_URI: env\.API_GOOGLE_REDIRECT_URI/);
  assert.match(
    source,
    /PROFESSIONAL_ALLOWLIST_ENFORCED: env\.PROFESSIONAL_ALLOWLIST_ENFORCED/,
  );
});

test("public Wrangler retains email architecture without production identifiers or routes", async () => {
  const source = (await readFile(wranglerUrl, "utf8")).replace(/^\uFEFF/u, "");
  const wrangler = JSON.parse(source);

  assert.equal(wrangler.vars.EMAIL_PROVIDER, "cloudflare");
  assert.equal(wrangler.vars.EMAIL_FROM_ADDRESS, "noreply@dr-vips.example.invalid");
  assert.equal(wrangler.vars.EMAIL_FROM_NAME, "DR-VIPS");
  assert.equal(Object.hasOwn(wrangler.vars, "CLOUDFLARE_EMAIL_API_TOKEN"), false);
  assert.equal(Object.hasOwn(wrangler.vars, "CLOUDFLARE_ACCOUNT_ID"), false);
  assert.equal(Object.hasOwn(wrangler, "account_id"), false);
  assert.equal(Object.hasOwn(wrangler, "routes"), false);
  assert.equal(Object.hasOwn(wrangler, "route"), false);
  assert.equal(wrangler.name, "dr-vips-public-reference");
  assert.equal(wrangler.workers_dev, false);
  assert.equal(wrangler.preview_urls, false);
  assert.equal(source.includes("dr-vips.com"), false);
  assert.equal(wrangler.vars.PROFESSIONAL_ALLOWLIST_ENFORCED, "false");
});
