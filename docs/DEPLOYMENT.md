# Deployment engineering reference

DR-VIPS uses a Cloudflare Worker, Static Assets and a Container running the Express backend. Production deployment is managed separately; this source snapshot includes the original release implementation for technical review.

The [production workflow reference](deployment/deploy-production.reference.yml) is outside GitHub Actions' executable workflow directory. The only executable workflow runs CI tests and build checks.

## Runtime and build boundary

[Architecture](ARCHITECTURE.md#configured-production-boundary) owns the request-flow diagram. `wrangler.jsonc` retains frontend/dist Static Assets with SPA handling, API-first routing and the DrVipsApi Container/Durable Object binding. `cloudflare/src/index.js` sends `/api` and `/api/*` to the primary container instance.

`Dockerfile` uses node:22-bookworm-slim, production dependency installation, backend-only copy, `/app/uploads`, port 8080 and `node backend/src/server.js`. It does not package frontend output. Docker's major-version pin and `.node-version`'s exact version are separate.

## Versioned configuration and secret boundaries

The single `wrangler.jsonc` is adapted from the original configuration. Its public-snapshot deviations are:

| Setting | Public reference |
| --- | --- |
| Worker name | `dr-vips-public-reference`, distinct from the original production Worker |
| Account identifier | Omitted; no production account identifier is embedded |
| Domain routes | Original custom-domain route removed |
| workers.dev / preview URLs | Disabled |
| Client origin, OAuth callback, CAPTCHA hostname and sender | Reserved `dr-vips.example.invalid` examples |

Compatibility date/flags, observability, port 8080, API path routing, SPA assets, Docker image, Container size/count, Durable Object binding and migration remain as in the original configuration. Existing feature flags are retained as source evidence, not a statement of live policy. These changes do not make Wrangler incapable of deployment if a reader supplies their own credentials; the snapshot has no production deployment workflow or configured production target.

[Security model](SECURITY_MODEL.md) owns eligibility/captcha semantics. The reminder-startup flag controls the in-process reminder job. The Worker forwards an explicit list of string bindings into Node, not all environment entries automatically.

Runtime secret/configuration names include MONGO_URI, JWT_SECRET, PENDING_SECRET, TURNSTILE_SECRET_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CLOUDFLARE_EMAIL_API_TOKEN, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET and DEEPL_API_KEY. Public provider settings include EMAIL_PROVIDER, EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME and API_GOOGLE_REDIRECT_URI. See `cloudflare/src/index.js` for the exact list; no credential/account-identifier values are reproduced here.

Turnstile and Cloudflare Email Sending are the supported CAPTCHA and email providers; unsupported configured providers fail closed. Google OAuth uses GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and API_GOOGLE_REDIRECT_URI.

The reference deploy job consumes CLOUDFLARE_API_TOKEN from GitHub secrets and CLOUDFLARE_ACCOUNT_ID from GitHub vars. Frontend builds use public VITE_CAPTCHA_ENABLED, VITE_CAPTCHA_PROVIDER and VITE_TURNSTILE_SITE_KEY. Server secrets must not be placed in VITE variables.

## Original manual release sequence

Source: [deploy-production.reference.yml](deployment/deploy-production.reference.yml). This is a **non-executable reference of the production deployment workflow**. Only explanatory comments were added to the original workflow body. Its production URL and secret/variable references demonstrate the original release path; no secret values are included.

1. An authorized operator manually dispatches on main with confirmation exactly `DEPLOY`.
2. Preflight requires workflow_dispatch, refs/heads/main and HEAD equal to workflow SHA. It queries GitHub's main ref API and requires that SHA to match too.
3. Preflight installs locked dependencies, runs helper/backend/frontend tests, builds with a public test Turnstile site key and verifies output. [Testing](TESTING.md) owns these commands.
4. Deploy depends on preflight and declares GitHub Environment production. Environment approval depends on separately configured GitHub protections.
5. The deploy job rechecks HEAD and the current main ref through GitHub's API against the workflow SHA, failing if main moved. It installs dependencies and rebuilds with the production VITE_TURNSTILE_SITE_KEY, failing if missing.
6. It verifies output, checks Docker, executes `npx --no-install wrangler deploy` and then `node .github/scripts/production-smoke.mjs`.

The workflow has read-only contents permission, checkout credentials disabled and a production concurrency group with cancellation disabled. SHA checks validate the revision at their respective preflight/deploy steps.

## Smoke-helper evidence and limits

`.github/scripts/production-smoke.mjs` is retained as original engineering evidence. It makes real production HTTP requests if invoked directly; do not run it during local review. Its automated tests inject fetch responses and contact no production service. The helper checks:

- `/api/health/live`: 200 and JSON status=ok.
- `/api/health/ready`: 200 and JSON status=ready.
- `/`: successful 2xx, nonempty HTML.

The helper uses bounded retries and request timeouts, with a nonzero exit and controlled diagnostics on failure. These checks establish limited availability, not authenticated functionality or medical-data correctness. Readiness reflects Mongoose connection state.

The reference contains no automatic rollback step; smoke checks do not establish recovery. It documents release engineering rather than the state of a live environment.
