import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { verifyBuild } from "./verify-build.mjs";

const VALID_HEADERS = [
  "/*",
  "  Content-Security-Policy: default-src 'self'",
  "  Strict-Transport-Security: max-age=31536000; includeSubDomains",
  "",
  "/assets/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "",
].join("\n");

const VALID_WRANGLER = `{
  "assets": {
    "directory": "./frontend/dist"
  },
  "containers": [
    {
      "image": "./Dockerfile"
    }
  ]
}`;

async function createFixture(t, {
  assetReference = "assets/app.js",
  indexHtml,
} = {}) {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "drvips-build-verifier-"));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));

  const publicDirectory = join(repositoryRoot, "frontend", "public");
  const distDirectory = join(repositoryRoot, "frontend", "dist");
  const assetsDirectory = join(distDirectory, "assets");
  await mkdir(publicDirectory, { recursive: true });
  await mkdir(assetsDirectory, { recursive: true });

  await writeFile(join(publicDirectory, "_headers"), VALID_HEADERS);
  await writeFile(join(distDirectory, "_headers"), VALID_HEADERS);
  await writeFile(
    join(distDirectory, "index.html"),
    indexHtml ?? `<html><head><script type="module" src="${assetReference}"></script></head></html>`,
  );
  await writeFile(join(assetsDirectory, "app.js"), "export const fixture = true;\n");
  await writeFile(join(repositoryRoot, "wrangler.jsonc"), VALID_WRANGLER);
  await writeFile(join(repositoryRoot, "Dockerfile"), "FROM scratch\n");

  return {
    assetsDirectory,
    distDirectory,
    publicDirectory,
    repositoryRoot,
  };
}

function errorCode(error) {
  return error?.code ?? error?.message;
}

async function captureFailure(action) {
  try {
    await action();
  } catch (error) {
    return error;
  }
  assert.fail("Expected build verification to fail");
}

async function assertFailure(repositoryRoot, expectedCode) {
  const error = await captureFailure(() => verifyBuild({ repositoryRoot }));
  assert.equal(errorCode(error), expectedCode);
  assert.equal(Object.hasOwn(error, "cause"), false);
  return error;
}

test("1. a complete build fixture passes", async (t) => {
  const fixture = await createFixture(t);

  await assert.doesNotReject(verifyBuild({ repositoryRoot: fixture.repositoryRoot }));
});

test("2. a missing public _headers file fails closed", async (t) => {
  const fixture = await createFixture(t);
  await unlink(join(fixture.publicDirectory, "_headers"));

  await assertFailure(fixture.repositoryRoot, "PUBLIC_HEADERS_MISSING");
});

test("3. a missing dist _headers file fails closed", async (t) => {
  const fixture = await createFixture(t);
  await unlink(join(fixture.distDirectory, "_headers"));

  await assertFailure(fixture.repositoryRoot, "DIST_HEADERS_MISSING");
});

test("4. differing public and dist headers are rejected", async (t) => {
  const fixture = await createFixture(t);
  await writeFile(join(fixture.distDirectory, "_headers"), `${VALID_HEADERS}changed\n`);

  await assertFailure(fixture.repositoryRoot, "HEADERS_MISMATCH");
});

test("5. empty matching headers are invalid", async (t) => {
  const fixture = await createFixture(t);
  await writeFile(join(fixture.publicDirectory, "_headers"), "");
  await writeFile(join(fixture.distDirectory, "_headers"), "");

  await assertFailure(fixture.repositoryRoot, "HEADERS_INVALID");
});

test("6. headers without Content-Security-Policy are invalid", async (t) => {
  const fixture = await createFixture(t);
  const headers = VALID_HEADERS.replace("Content-Security-Policy:", "Removed-Policy:");
  await writeFile(join(fixture.publicDirectory, "_headers"), headers);
  await writeFile(join(fixture.distDirectory, "_headers"), headers);

  await assertFailure(fixture.repositoryRoot, "HEADERS_INVALID");
});

test("7. headers without Strict-Transport-Security are invalid", async (t) => {
  const fixture = await createFixture(t);
  const headers = VALID_HEADERS.replace("Strict-Transport-Security:", "Removed-HSTS:");
  await writeFile(join(fixture.publicDirectory, "_headers"), headers);
  await writeFile(join(fixture.distDirectory, "_headers"), headers);

  await assertFailure(fixture.repositoryRoot, "HEADERS_INVALID");
});

test("8. the assets cache rule must remain immutable", async (t) => {
  const fixture = await createFixture(t);
  const headers = VALID_HEADERS.replace(", immutable", "");
  await writeFile(join(fixture.publicDirectory, "_headers"), headers);
  await writeFile(join(fixture.distDirectory, "_headers"), headers);

  await assertFailure(fixture.repositoryRoot, "HEADERS_INVALID");
});

test("9. a missing index.html is rejected", async (t) => {
  const fixture = await createFixture(t);
  await unlink(join(fixture.distDirectory, "index.html"));

  await assertFailure(fixture.repositoryRoot, "INDEX_MISSING");
});

test("10. an empty index.html is rejected", async (t) => {
  const fixture = await createFixture(t);
  await writeFile(join(fixture.distDirectory, "index.html"), "");

  await assertFailure(fixture.repositoryRoot, "INDEX_INVALID");
});

test("11. index.html must contain an html element", async (t) => {
  const fixture = await createFixture(t, {
    indexHtml: '<script type="module" src="assets/app.js"></script>',
  });

  await assertFailure(fixture.repositoryRoot, "INDEX_INVALID");
});

test("12. index.html must contain a script element", async (t) => {
  const fixture = await createFixture(t, {
    indexHtml: '<html><head><link href="assets/app.js"></head></html>',
  });

  await assertFailure(fixture.repositoryRoot, "INDEX_INVALID");
});

test("13. index.html must contain a local JavaScript asset reference", async (t) => {
  const fixture = await createFixture(t, {
    indexHtml: '<html><head><script src="https://cdn.example.invalid/app.js"></script></head></html>',
  });

  await assertFailure(fixture.repositoryRoot, "INDEX_INVALID");
});

test("14. the dist assets directory is required", async (t) => {
  const fixture = await createFixture(t);
  await rm(fixture.assetsDirectory, { recursive: true, force: true });

  await assertFailure(fixture.repositoryRoot, "ASSETS_MISSING");
});

test("15. a referenced JavaScript asset must exist", async (t) => {
  const fixture = await createFixture(t);
  await unlink(join(fixture.assetsDirectory, "app.js"));
  await writeFile(join(fixture.assetsDirectory, "unreferenced.js"), "export {};\n");

  await assertFailure(fixture.repositoryRoot, "ASSET_MISSING");
});

test("16. a referenced JavaScript asset must not be empty", async (t) => {
  const fixture = await createFixture(t);
  await writeFile(join(fixture.assetsDirectory, "app.js"), "");

  await assertFailure(fixture.repositoryRoot, "ASSET_EMPTY");
});

test("17. query strings are removed before resolving an asset", async (t) => {
  const fixture = await createFixture(t, { assetReference: "assets/app.js?v=fixture" });

  await assert.doesNotReject(verifyBuild({ repositoryRoot: fixture.repositoryRoot }));
});

test("18. fragments are removed before resolving an asset", async (t) => {
  const fixture = await createFixture(t, { assetReference: "assets/app.js#fixture" });

  await assert.doesNotReject(verifyBuild({ repositoryRoot: fixture.repositoryRoot }));
});

test("19. root-relative assets references are accepted", async (t) => {
  const fixture = await createFixture(t, { assetReference: "/assets/app.js" });

  await assert.doesNotReject(verifyBuild({ repositoryRoot: fixture.repositoryRoot }));
});

test("20. dot-relative assets references are accepted", async (t) => {
  const fixture = await createFixture(t, { assetReference: "./assets/app.js" });

  await assert.doesNotReject(verifyBuild({ repositoryRoot: fixture.repositoryRoot }));
});

test("21. asset path traversal is rejected even when the target exists", async (t) => {
  const fixture = await createFixture(t, { assetReference: "assets/../../outside.js" });
  await writeFile(join(fixture.repositoryRoot, "outside.js"), "export default 'private';\n");

  await assertFailure(fixture.repositoryRoot, "ASSET_REFERENCE_INVALID");
});

test("22. wrangler.jsonc is required", async (t) => {
  const fixture = await createFixture(t);
  await unlink(join(fixture.repositoryRoot, "wrangler.jsonc"));

  await assertFailure(fixture.repositoryRoot, "WRANGLER_MISSING");
});

test("23. Dockerfile is required", async (t) => {
  const fixture = await createFixture(t);
  await unlink(join(fixture.repositoryRoot, "Dockerfile"));

  await assertFailure(fixture.repositoryRoot, "DOCKERFILE_MISSING");
});

test("24. Wrangler must reference the frontend dist directory", async (t) => {
  const fixture = await createFixture(t);
  await writeFile(
    join(fixture.repositoryRoot, "wrangler.jsonc"),
    VALID_WRANGLER.replace('"directory": "./frontend/dist"', '"directory": "./other"'),
  );

  await assertFailure(fixture.repositoryRoot, "WRANGLER_WIRING_INVALID");
});

test("25. Wrangler must reference the repository Dockerfile", async (t) => {
  const fixture = await createFixture(t);
  await writeFile(
    join(fixture.repositoryRoot, "wrangler.jsonc"),
    VALID_WRANGLER.replace('"image": "./Dockerfile"', '"image": "./other"'),
  );

  await assertFailure(fixture.repositoryRoot, "WRANGLER_WIRING_INVALID");
});

test("26. exported failures are constant errors without cause", async (t) => {
  const fixture = await createFixture(t);
  await unlink(join(fixture.publicDirectory, "_headers"));

  const error = await captureFailure(() => verifyBuild({ repositoryRoot: fixture.repositoryRoot }));

  assert.equal(errorCode(error), "PUBLIC_HEADERS_MISSING");
  assert.equal(Object.hasOwn(error, "cause"), false);
  assert.equal(error.message, "PUBLIC_HEADERS_MISSING");
});

test("27. failures expose neither temporary paths nor private file contents", async (t) => {
  const fixture = await createFixture(t);
  const privateSentinel = "PRIVATE_BUILD_SENTINEL";
  await writeFile(
    join(fixture.repositoryRoot, "wrangler.jsonc"),
    `${privateSentinel}\n${fixture.repositoryRoot}\n`,
  );

  const error = await captureFailure(() => verifyBuild({ repositoryRoot: fixture.repositoryRoot }));
  const exposed = JSON.stringify({
    code: error?.code,
    message: error?.message,
    cause: error?.cause,
  });

  assert.equal(errorCode(error), "WRANGLER_WIRING_INVALID");
  assert.equal(exposed.includes(privateSentinel), false);
  assert.equal(exposed.includes(fixture.repositoryRoot), false);
  assert.equal(exposed.includes("ENOENT"), false);
});

test("workflow retains CI policy while hardening actions, jobs, and credentials", async () => {
  const repositoryRoot = process.cwd();
  const workflow = await readFile(join(repositoryRoot, ".github", "workflows", "tests.yml"), "utf8");
  const backendStart = workflow.indexOf("  backend-tests:");
  const frontendStart = workflow.indexOf("  frontend-test-build:");
  assert.ok(backendStart >= 0);
  assert.ok(frontendStart > backendStart);
  const backend = workflow.slice(backendStart, frontendStart);
  const frontend = workflow.slice(frontendStart);

  assert.match(workflow, /^name:\s*CI\s*$/m);
  assert.match(workflow, /^\s{2}push:\s*$/m);
  assert.match(workflow, /^\s{2}pull_request:\s*$/m);
  assert.match(workflow, /^\s{2}workflow_dispatch:\s*$/m);
  assert.equal((workflow.match(/branches:\s*\[main\]/g) ?? []).length, 2);
  assert.doesNotMatch(workflow, /pull_request_target/);

  assert.match(workflow, /^permissions:\s*\r?\n\s{2}contents:\s*read\s*$/m);
  assert.doesNotMatch(
    workflow,
    /^\s*(?:contents|pull-requests|packages|deployments|id-token):\s*write\s*$/im,
  );
  assert.doesNotMatch(workflow, /\btoken\s*:/i);
  assert.match(workflow, /group:\s*\$\{\{\s*github\.workflow\s*\}\}-\$\{\{\s*github\.ref\s*\}\}/);
  assert.match(workflow, /cancel-in-progress:\s*true/);

  assert.equal((workflow.match(/runs-on:\s*ubuntu-24\.04/g) ?? []).length, 2);
  assert.doesNotMatch(workflow, /ubuntu-latest/);
  assert.equal(
    (workflow.match(/uses:\s*actions\/checkout@11d5960a326750d5838078e36cf38b85af677262\s+#\s*v4/g) ?? []).length,
    2,
  );
  assert.equal(
    (workflow.match(/uses:\s*actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020\s+#\s*v4/g) ?? []).length,
    2,
  );
  assert.doesNotMatch(workflow, /actions\/checkout@v4/);
  assert.doesNotMatch(workflow, /actions\/setup-node@v4/);
  assert.equal((workflow.match(/persist-credentials:\s*false/g) ?? []).length, 2);
  assert.equal((workflow.match(/fetch-depth:\s*0/g) ?? []).length, 1);
  assert.match(backend, /persist-credentials:\s*false[\s\S]*?fetch-depth:\s*0/);
  assert.equal((workflow.match(/node-version-file:\s*\.node-version/g) ?? []).length, 2);
  assert.doesNotMatch(workflow, /node-version:\s*22/);

  assert.doesNotMatch(workflow, /^\s*run:\s*git diff --check\s*$/m);
  const whitespaceStepStart = backend.indexOf("- name: Check committed whitespace errors");
  assert.ok(whitespaceStepStart >= 0);
  const whitespaceStepRemainder = backend.slice(whitespaceStepStart);
  const nextBackendStep = whitespaceStepRemainder.indexOf("\n      - name:", 1);
  const whitespaceStep = nextBackendStep >= 0
    ? whitespaceStepRemainder.slice(0, nextBackendStep)
    : whitespaceStepRemainder;
  const whitespaceScriptStart = whitespaceStep.indexOf("run: |");
  assert.ok(whitespaceScriptStart >= 0);
  const whitespaceScript = whitespaceStep.slice(whitespaceScriptStart);

  assert.match(whitespaceStep, /EVENT_NAME:\s*\$\{\{\s*github\.event_name\s*\}\}/);
  assert.match(
    whitespaceStep,
    /PR_BASE_SHA:\s*\$\{\{\s*github\.event\.pull_request\.base\.sha\s*\}\}/,
  );
  assert.match(
    whitespaceStep,
    /PUSH_BEFORE_SHA:\s*\$\{\{\s*github\.event\.before\s*\}\}/,
  );
  assert.match(whitespaceScript, /case\s+"\$EVENT_NAME"\s+in/);
  assert.match(whitespaceScript, /^\s*pull_request\)\s*$/m);
  assert.match(whitespaceScript, /git diff --check "\$PR_BASE_SHA\.\.\.HEAD"/);
  assert.match(whitespaceScript, /^\s*push\)\s*$/m);
  assert.match(whitespaceScript, /git diff --check "\$PUSH_BEFORE_SHA\.\.\.HEAD"/);
  assert.match(whitespaceScript, /^\s*workflow_dispatch\)\s*$/m);
  assert.match(whitespaceScript, /git rev-parse HEAD\^ >\/dev\/null 2>&1/);
  assert.match(whitespaceScript, /git diff --check HEAD\^(?:\.\.|\.\.\.|\s+)HEAD/);
  assert.match(whitespaceScript, /git show --check --format= HEAD/);
  assert.match(whitespaceScript, /^\s*\*\)\s*$/m);
  assert.match(whitespaceScript, /exit\s+1/);
  assert.doesNotMatch(whitespaceScript, /\$\{\{/);
  assert.doesNotMatch(
    whitespaceScript,
    /(?:echo|printf)[^\r\n]*(?:PR_BASE_SHA|PUSH_BEFORE_SHA)/,
  );
  assert.doesNotMatch(workflow, /\beval\b/);

  assert.match(backend, /node --test ["']\.github\/\*\*\/\*\.test\.mjs["']/);
  assert.match(backend, /npm ci/);
  for (const sourceFile of [
    "backend/src/server.js",
    "backend/src/config/db.js",
    "backend/src/runtime/startup.js",
    "backend/src/runtime/gracefulShutdown.js",
    "cloudflare/src/index.js",
  ]) {
    assert.match(backend, new RegExp(`node --check ${sourceFile.replaceAll("/", "\\/")}`));
  }
  assert.match(backend, /node --test ["']backend\/\*\*\/\*\.test\.js["']/);
  assert.doesNotMatch(backend, /\bnpm test\b/);

  const backendOrder = [
    "actions/checkout@",
    "actions/setup-node@",
    "Check committed whitespace errors",
    'node --test ".github/**/*.test.mjs"',
    "npm ci",
    "node --check backend/src/server.js",
    'node --test "backend/**/*.test.js"',
  ].map((marker) => backend.indexOf(marker));
  assert.deepEqual([...backendOrder].sort((left, right) => left - right), backendOrder);
  assert.equal(backendOrder.every((index) => index >= 0), true);

  assert.match(frontend, /npm ci --prefix frontend/);
  assert.match(frontend, /npm --prefix frontend test/);
  assert.match(frontend, /npm --prefix frontend run build/);
  assert.match(frontend, /node \.github\/scripts\/verify-build\.mjs/);
  const frontendOrder = [
    "actions/checkout@",
    "actions/setup-node@",
    "npm ci --prefix frontend",
    "npm --prefix frontend test",
    "npm --prefix frontend run build",
    "node .github/scripts/verify-build.mjs",
  ].map((marker) => frontend.indexOf(marker));
  assert.deepEqual([...frontendOrder].sort((left, right) => left - right), frontendOrder);
  assert.equal(frontendOrder.every((index) => index >= 0), true);

  for (const forbidden of [
    /wrangler\s+deploy/i,
    /^\s*environment\s*:/im,
    /CLOUDFLARE/,
    /secrets\./i,
    /^\s*secrets\s*:/im,
    /vars\./i,
    /continue-on-error/i,
  ]) {
    assert.doesNotMatch(workflow, forbidden);
  }
});

test(".node-version pins exactly Node 22.23.2 with only its final newline", async () => {
  const nodeVersion = await readFile(join(process.cwd(), ".node-version"), "utf8");

  assert.match(nodeVersion, /^22\.23\.2\r?\n$/);
});

test("production deploy workflow is manual, protected, reproducible, and non-rolling-back", async () => {
  const workflow = await readFile(
    join(process.cwd(), ".github", "workflows", "deploy-production.yml"),
    "utf8",
  );
  const preflightStart = workflow.indexOf("  preflight:");
  const deployStart = workflow.indexOf("  deploy:");
  assert.ok(preflightStart >= 0);
  assert.ok(deployStart > preflightStart);
  const preflight = workflow.slice(preflightStart, deployStart);
  const deploy = workflow.slice(deployStart);

  assert.match(workflow, /^name:\s*Deploy production\s*$/m);
  assert.match(workflow, /^\s{2}workflow_dispatch:\s*$/m);
  for (const forbiddenTrigger of [
    /^\s{2}push:\s*$/m,
    /^\s{2}pull_request:\s*$/m,
    /^\s{2}workflow_run:\s*$/m,
    /^\s{2}schedule:\s*$/m,
    /^\s{2}repository_dispatch:\s*$/m,
    /^\s{2}deployment:\s*$/m,
    /pull_request_target/,
  ]) {
    assert.doesNotMatch(workflow, forbiddenTrigger);
  }
  assert.match(workflow, /confirmation:\s*\r?\n[\s\S]*?required:\s*true[\s\S]*?type:\s*string/);

  assert.match(workflow, /^permissions:\s*\r?\n\s{2}contents:\s*read\s*$/m);
  assert.doesNotMatch(workflow, /^\s*[\w-]+:\s*write\s*$/im);
  assert.match(workflow, /^concurrency:\s*\r?\n\s{2}group:\s*production\s*\r?\n\s{2}cancel-in-progress:\s*false\s*$/m);

  assert.doesNotMatch(preflight, /^\s{4}environment:\s*$/m);
  assert.match(deploy, /^\s{4}environment:\s*\r?\n\s{6}name:\s*production\s*\r?\n\s{6}url:\s*https:\/\/dr-vips\.com\s*$/m);
  assert.match(deploy, /^\s{4}needs:\s*preflight\s*$/m);
  assert.equal((workflow.match(/runs-on:\s*ubuntu-24\.04/g) ?? []).length, 2);
  assert.equal((workflow.match(/timeout-minutes:\s*(?:40|45)/g) ?? []).length, 2);

  const checkoutSha = "11d5960a326750d5838078e36cf38b85af677262";
  const setupNodeSha = "49933ea5288caeca8642d1e84afbd3f7d6820020";
  assert.equal((workflow.match(new RegExp(`actions/checkout@${checkoutSha}`, "g")) ?? []).length, 2);
  assert.equal((workflow.match(new RegExp(`actions/setup-node@${setupNodeSha}`, "g")) ?? []).length, 2);
  assert.equal((workflow.match(/persist-credentials:\s*false/g) ?? []).length, 2);
  assert.equal((workflow.match(/fetch-depth:\s*0/g) ?? []).length, 2);
  assert.equal((workflow.match(/node-version-file:\s*\.node-version/g) ?? []).length, 2);

  assert.match(preflight, /npm ci(?:\s|$)/m);
  assert.match(preflight, /npm ci --prefix frontend/);
  assert.match(preflight, /node --test ["']\.github\/\*\*\/\*\.test\.mjs["']/);
  assert.match(preflight, /node --test ["']backend\/\*\*\/\*\.test\.js["']/);
  assert.match(preflight, /npm --prefix frontend test/);
  assert.match(preflight, /npm --prefix frontend run build/);
  assert.match(preflight, /node \.github\/scripts\/verify-build\.mjs/);
  assert.doesNotMatch(preflight, /docker\s+version|wrangler/i);

  assert.match(deploy, /npm ci(?:\s|$)/m);
  assert.match(deploy, /npm ci --prefix frontend/);
  assert.match(deploy, /npm --prefix frontend run build/);
  assert.match(deploy, /node \.github\/scripts\/verify-build\.mjs/);
  assert.match(deploy, /docker version/);
  assert.match(deploy, /^\s*run:\s*npx --no-install wrangler deploy\s*$/m);
  assert.doesNotMatch(workflow, /\bnpm\s+install\b/);
  assert.doesNotMatch(workflow, /npm\s+(?:install|i)[^\r\n]*wrangler|wrangler@|npm\s+install\s+-g/i);

  const wranglerStepStart = deploy.indexOf("- name: Deploy with Wrangler");
  assert.ok(wranglerStepStart >= 0);
  const wranglerRemainder = deploy.slice(wranglerStepStart);
  const nextDeployStep = wranglerRemainder.indexOf("\n      - name:", 1);
  const wranglerStep = nextDeployStep >= 0
    ? wranglerRemainder.slice(0, nextDeployStep)
    : wranglerRemainder;
  assert.match(
    wranglerStep,
    /CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}/,
  );
  assert.match(
    wranglerStep,
    /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{\s*vars\.CLOUDFLARE_ACCOUNT_ID\s*\}\}/,
  );
  assert.equal((workflow.match(/secrets\.CLOUDFLARE_API_TOKEN/g) ?? []).length, 1);
  assert.equal((workflow.match(/vars\.CLOUDFLARE_ACCOUNT_ID/g) ?? []).length, 1);
  assert.doesNotMatch(preflight, /CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID/);
  const deployWithoutWranglerStep = deploy.replace(wranglerStep, "");
  assert.doesNotMatch(deployWithoutWranglerStep, /secrets\.|vars\./);

  const smokeIndex = deploy.indexOf("node .github/scripts/production-smoke.mjs");
  const wranglerIndex = deploy.indexOf("npx --no-install wrangler deploy");
  assert.ok(wranglerIndex >= 0);
  assert.ok(smokeIndex > wranglerIndex);

  assert.match(preflight, /DEPLOY_CONFIRMATION:\s*\$\{\{\s*inputs\.confirmation\s*\}\}/);
  assert.match(preflight, /EVENT_NAME:\s*\$\{\{\s*github\.event_name\s*\}\}/);
  assert.match(preflight, /DEPLOY_REF:\s*\$\{\{\s*github\.ref\s*\}\}/);
  assert.match(preflight, /DEPLOY_SHA:\s*\$\{\{\s*github\.sha\s*\}\}/);
  assert.match(preflight, /"\$EVENT_NAME"\s*!=\s*"workflow_dispatch"/);
  assert.match(preflight, /"\$DEPLOY_CONFIRMATION"\s*!=\s*"DEPLOY"/);
  assert.match(preflight, /"\$DEPLOY_REF"\s*!=\s*"refs\/heads\/main"/);
  assert.match(preflight, /git rev-parse HEAD/);
  assert.match(preflight, /git fetch --no-tags origin main/);
  assert.match(preflight, /git rev-parse origin\/main/);
  assert.match(preflight, /MAIN_MOVED/);

  assert.match(deploy, /git fetch --no-tags origin main/);
  assert.match(deploy, /git rev-parse HEAD/);
  assert.match(deploy, /git rev-parse origin\/main/);
  assert.match(deploy, /GITHUB_SHA/);
  assert.match(deploy, /MAIN_MOVED_AFTER_APPROVAL/);

  for (const forbidden of [
    /\beval\b/,
    /continue-on-error/i,
    /upload-artifact|download-artifact|\bartifacts?\s*:/i,
    /wrangler\s+whoami/i,
    /wrangler\s+secret/i,
    /\brollback\b/i,
    /^\s*token\s*:/im,
  ]) {
    assert.doesNotMatch(workflow, forbidden);
  }
});
