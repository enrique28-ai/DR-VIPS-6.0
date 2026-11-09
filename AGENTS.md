# DR-VIPS 6.0 Agent Instructions

## Project

This is the DR-VIPS 6.0 source snapshot for public technical review, derived from the original DR-VIPS application. Production is managed separately. Verify the Git remote before authorized Git operations: local folder names and inherited agent metadata can be stale.

## Documentation owners

Read [README.md](README.md) for the repository entry point. Each topic has one canonical owner; link to it instead of copying rules.

| Document | Owns / read before |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | System structure; read before cross-component changes |
| [Domain rules](docs/DOMAIN_RULES.md) | Functional invariants; read before patient/guardian, diagnosis, history or appointment changes |
| [Security model](docs/SECURITY_MODEL.md) | Auth/access/privacy boundaries; read before security-sensitive changes |
| [Design system](docs/DESIGN_SYSTEM.md) | Existing UI conventions; read before substantial UI work |
| [Testing](docs/TESTING.md) | Validation strategy and commands |
| [Deployment](docs/DEPLOYMENT.md) | Release process; read before deployment-related work |

Code and tests establish current behavior. If documentation conflicts with them, identify the discrepancy rather than changing behavior to fit prose. Follow the user's explicitly approved scope before substantial work; this snapshot includes no internal product roadmap.

## Critical rules

- Backend is the source of truth.
- Frontend validation is UX only.
- Do not weaken auth, JWT, cookies, CORS, captcha, rate limits, or role checks.
- Identify the impact before changing business/domain rules or approval behavior.
- Do not silently modify medical data.
- Medical changes must be explicit and reviewable.
- Do not touch unrelated systems.
- Preserve unrelated user changes. Inspect source, callers, routes and tests before editing.
- Never publish credentials, private URLs or patient/user data in documentation, logs, fixtures or reports.
- State verified facts and uncertainties; do not invent certification, deployment state or product claims.

## Git and release safety

Inspect the current branch and `git status -sb` before editing. Work on a dedicated branch for approved changes; do not modify `main` directly or overwrite user work.

Stage, commit, push, open a PR, merge or deploy only when authorized. Do not reset, rebase, force-push, delete branches or rewrite history without explicit authorization. Inspect the intended diff for unrelated files and secrets before staging.

Deployment files are technical references described in [Deployment](docs/DEPLOYMENT.md). Do not restore an executable production deployment workflow or production account/domain bindings in this snapshot.

## Workflow

- Plan first.
- Explain root cause before changing code.
- Keep changes minimal.
- Do not refactor unrelated files.
- Use the change-appropriate checks in [Testing](docs/TESTING.md). Documentation-only changes do not require runtime edits to make descriptions match.
- Report the branch, exact files created/modified, checks and outcomes, manual validation where relevant, uncertainties and remaining work. Leave changes unstaged when review is requested.

The `.agents/`, `.codex/` and `.opencode/` directories contain repository- and platform-specific instructions. Canonical topic ownership remains with the documents listed above; do not rewrite tooling directories incidentally or create competing copies of canonical rules.
