# DR-VIPS 6.0

DR-VIPS is a full-stack web application for patient profiles, diagnoses and their histories, appointments and notifications. It provides doctor and patient account roles, including patient/guardian review flows. This repository contains the actual application source, automated tests and deployment engineering for technical inspection and evaluation.

Production deployment is managed separately. Docker, Cloudflare configuration and the [production workflow reference](docs/deployment/deploy-production.reference.yml) document the implemented architecture; the executable GitHub Actions workflow runs CI tests and build checks.

## Stack and structure

The frontend uses React, Vite, React Router, Zustand, TanStack Query, react-i18next and Tailwind CSS. The backend uses Node.js, Express and MongoDB through Mongoose. See [package.json](package.json) and [frontend/package.json](frontend/package.json).

| Path | Purpose |
| --- | --- |
| `frontend/src/` | Pages, components, feature hooks, stores and translations |
| `backend/src/` | Express entrypoint, routes, controllers, services, models and middleware |
| `cloudflare/` | Worker-to-container routing and tests |
| `.github/` | CI testing and build/smoke verification helpers |
| `Dockerfile`, `wrangler.jsonc` | Backend image and Worker/assets/container configuration |
| `.agents/`, `.codex/`, `.opencode/` | Agent instructions and tooling metadata |
| `docs/` | Canonical project documentation |

## Local development

Use the Node version in [.node-version](.node-version). From the root:

```powershell
npm.cmd ci
npm.cmd ci --prefix frontend
```

Provide private development configuration using a disposable database and development credentials. `backend/src/server.js` loads dotenv; startup requires `MONGO_URI`, `JWT_SECRET` and `PENDING_SECRET`. Integrations need their own configuration. Do not copy production credentials or medical data. See [Security model](docs/SECURITY_MODEL.md).

Run in separate terminals:

```powershell
npm.cmd run dev
npm.cmd --prefix frontend run dev
```

The backend defaults to port 5001. The development Axios client targets `http://localhost:5001/api`; backend CORS includes `http://localhost:5173`, Vite's normal development address. Port changes require reviewing that wiring. Production browser requests use relative `/api` URLs.

`npm.cmd start` runs the backend with `NODE_ENV=production`; it does not deploy Cloudflare. Root `build` installs dependencies and builds frontend; use the explicit commands in [Testing](docs/TESTING.md) for validation.

## Documentation

- [AGENTS.md](AGENTS.md): how to work in this repository.
- [Architecture](docs/ARCHITECTURE.md): component and runtime structure.
- [Domain rules](docs/DOMAIN_RULES.md): functional invariants and workflow boundaries.
- [Security model](docs/SECURITY_MODEL.md): authentication, access and privacy.
- [Design system](docs/DESIGN_SYSTEM.md): existing UI conventions.
- [Testing](docs/TESTING.md): suites, CI and build verification.
- [Deployment](docs/DEPLOYMENT.md): implemented release engineering and reference configuration.

## Configured production architecture

The implemented architecture uses Cloudflare Static Assets for `frontend/dist` and routes API requests through a Worker to the `DrVipsApi` Container running Express, which connects to MongoDB. The single `wrangler.jsonc` retains that architecture with a distinct reference Worker name, reserved example addresses and no production account or domain route. See [Architecture](docs/ARCHITECTURE.md) and [Deployment](docs/DEPLOYMENT.md).
