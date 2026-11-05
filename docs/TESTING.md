# Testing and validation

Commands are verified against current manifests/workflows. Run from the repository root with the Node version in `.node-version`. PowerShell examples use npm.cmd; other shells can use npm. Locked installation is `npm.cmd ci` and `npm.cmd ci --prefix frontend`.

Never use production medical/user data as fixtures. Inspect test database/network setup; use synthetic fixtures, mocks or disposable test databases. Report environmental blockers separately from regressions.

## Entry points

| Purpose | Command |
| --- | --- |
| Root Node test discovery | `npm.cmd test` |
| Explicit backend suite used in CI | `node --test "backend/**/*.test.js"` |
| Focused backend example | `node --test backend/src/controllers/vips-test/patient/patienthelpers.currentMinor.test.js` |
| Frontend Vitest suite | `npm.cmd --prefix frontend test` |
| Focused frontend example | `npm.cmd --prefix frontend test -- src/pages/docrecords/PatientAccessRequestsPage.test.jsx` |
| Frontend production build | `npm.cmd --prefix frontend run build` |
| Frontend lint (script exists; not a current CI step) | `npm.cmd --prefix frontend run lint` |
| CI helper/policy tests | `node --test ".github/**/*.test.mjs"` |
| Built artifact verification | `node .github/scripts/verify-build.mjs` |
| Whitespace check | `git diff --check` |

Root test is `node --test` with default discovery, not identical to the explicit CI backend glob. No root lint script exists. Frontend Vitest uses jsdom and `frontend/src/test/setupTests.jsx` configured by `frontend/vite.config.js`.

Default Node discovery can also collect frontend `.test.js` files that require Vite's `import.meta.env`; use the explicit backend/Worker Node suites and the frontend Vitest command to validate those environments separately. A root discovery failure is not evidence that the corresponding Vitest test fails.

Start focused, then broaden according to change risk. Access tests should check rejection and absence of forbidden mutations/disclosure. Mocked persistence tests do not establish live multi-process MongoDB behavior.

## Change-type matrix

| Change | Validation |
| --- | --- |
| Backend logic | Focused Node tests, root/backend suite, git diff --check |
| Frontend logic | Focused Vitest, frontend suite, production build, git diff --check |
| Deployment/configuration | Relevant CI/Worker helper tests, syntax checks, build/verification and deployment-specific review |
| Cross-cutting/high-risk | Relevant focused tests, root/backend and frontend suites, build/verification, whitespace review |
| Documentation only | Source/command/link review, full new/modified text review, allowed-path check, git diff --check; no runtime suite needed without another reason |

Visual changes also need representative mobile/tablet/desktop and keyboard/focus/state checks from [Design system](DESIGN_SYSTEM.md). External deployment actions follow [Deployment](DEPLOYMENT.md).

## CI

`.github/workflows/tests.yml` is the only executable workflow. It triggers on main pushes, PRs targeting main and manual dispatch. It checks event-specific committed whitespace (including an initial push with no previous SHA), CI helpers, locked installation, critical syntax and explicit backend tests. A separate job installs frontend dependencies, runs Vitest, builds and verifies output. It has no deployment step or production credentials. The original deployment workflow is preserved outside GitHub Actions in [the release reference](deployment/deploy-production.reference.yml).

The snapshot preserves original application formatting. Checking a new root commit inspects the whole imported tree and can report inherited whitespace that a preparation-only diff does not include. Review that output separately; passing `git diff --check` on preparation changes does not guarantee a clean initial-commit whitespace check.

Critical syntax commands:

```powershell
node --check backend/src/server.js
node --check backend/src/config/db.js
node --check backend/src/runtime/startup.js
node --check backend/src/runtime/gracefulShutdown.js
node --check cloudflare/src/index.js
```

git diff --check does not inspect untracked contents. Explicitly review new documentation and whitespace before staging; a clean tracked diff alone is insufficient.

## Build and smoke helpers

`.github/scripts/verify-build.mjs` checks matching public/dist `_headers`, expected header markers, nonempty HTML/referenced assets, path containment and Wrangler frontend/Dockerfile wiring. Run after build. `verify-build.test.mjs` covers helper behavior and workflow policy.

`.github/scripts/production-smoke.mjs` makes real production HTTP requests. `production-smoke.test.mjs` instead uses injected fetches to test responses, bounded retries and controlled diagnostics. Use these mocked helper tests during ordinary review; live execution belongs to a separately authorized release/operational task in [Deployment](DEPLOYMENT.md).

Passing build/smoke does not establish all authenticated workflows, privacy boundaries or a complete security assessment. Report commands, outcomes, skips and untested behavior accurately.
