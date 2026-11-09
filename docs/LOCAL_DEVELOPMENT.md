# Local development

Run Express and Vite on your workstation with a separate MongoDB database for fictitious data. The default setup supports password sign-in, patient review, diagnosis and history, and appointments with the synthetic fixture below. It uses the same backend and frontend as the public snapshot.

## Prerequisites

- Node.js **22.23.2**, matching [`.node-version`](../.node-version).
- Docker Desktop with a running Linux engine version 28 or later and Compose with `up --wait` support. [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/)
- Free ports `5001` for Express, `5173` for Vite and `27018` for MongoDB.

Run these commands from the repository root in PowerShell. Use the same Node version in each terminal.

```powershell
node --version
docker version
docker compose version
npm.cmd ci
npm.cmd ci --prefix frontend
```

## Configure the environment

Review any existing `.env` and inherited environment variables before starting. Dotenv preserves values already set in the shell. Use a development-only shell and the local URI below.

```powershell
if (Test-Path -LiteralPath .env) { throw 'Review the existing .env before replacing it.' }
Copy-Item -LiteralPath .env.example -Destination .env
node -p "require('node:crypto').randomBytes(32).toString('hex')"
node -p "require('node:crypto').randomBytes(32).toString('hex')"
```

Set `JWT_SECRET` and `PENDING_SECRET` in `.env` to the first and second generated values respectively. Keep them private. Startup requires both nonempty secrets and `MONGO_URI`. The root `.env` and frontend `.env.local` are ignored by Git. Keep real connection strings, provider credentials and medical data out of the repository.

| Backend setting | Local behavior |
| --- | --- |
| `MONGO_URI` | `mongodb://127.0.0.1:27018/dr_vips_local?replicaSet=dr-vips-local&directConnection=true` for the Compose instance. |
| `JWT_SECRET`, `PENDING_SECRET` | Independent secrets for login sessions and pending OAuth flows. Both are required at startup. |
| `NODE_ENV`, `PORT`, `CLIENT_URL` | Development mode, `5001`, and `http://localhost:5173` in the example. `npm.cmd run dev` sets development mode. |
| `APPT_REMINDERS_ENABLED`, `APPT_REMINDER_MINUTES` | The example enables the scheduled in-app reminder job with a 60-minute lead time. It checks accepted appointments while the local backend is running. Set `APPT_REMINDERS_ENABLED=false` to disable the job; appointment operations still work. |
| `PROFESSIONAL_ALLOWLIST_ENFORCED` | Omit to retain the backend default. This affects new doctor registration. The seed supplies a fictitious doctor with its verification fields set. |

The credential-free setup needs no frontend environment file. Vite's development mode targets `http://localhost:5001/api`. If you enable Turnstile, use the frontend variables in the integration table below.

## Start MongoDB

```powershell
docker compose -f compose.local.yml up --wait
docker compose -f compose.local.yml ps
```

The pinned image starts a one-member replica set. The health check initializes it on first start and waits for an elected primary. Diagnosis writes, appointment creation and several patient decisions use transactions, so use the replica set even for local review. `directConnection=true` keeps the host application on the published endpoint while MongoDB advertises its internal member address. [MongoDB connection options](https://www.mongodb.com/docs/manual/reference/connection-string-options/)

MongoDB is published on `127.0.0.1:27018`. The instance has no database authentication and is intended for a trusted workstation with synthetic data. The named Docker volume keeps records between starts.

## Load synthetic data and start the app

Optionally run the seed once against the empty local database:

```powershell
node scripts/seed-local-development.mjs
```

The command checks development mode, the exact loopback URI and the replica set before writing. It refuses a populated database and inserts the fixtures in one transaction. It prints randomly generated passwords for `doctor@example.test` and `patient@example.test` once. Save them locally for sign-in. The fixture accounts start verified so the offline demo can use the existing password and session flow without email delivery. The seed runs only when invoked explicitly.

Open two PowerShell terminals at the repository root and run one command in each:

```powershell
# Terminal 1
npm.cmd run dev
```

```powershell
# Terminal 2
npm.cmd --prefix frontend run dev -- --host localhost --strictPort
```

Check that the backend can reach MongoDB:

```powershell
Invoke-RestMethod http://localhost:5001/api/health/ready
```

Expect `status` to be `ready`. Open [the frontend](http://localhost:5173) and sign in using the printed credentials. Keep the Express port unexposed to other machines through your workstation firewall. Use `localhost` in the browser so the origin and session cookies match the development configuration.

1. Sign in as the demo doctor to find the pending **Demo Patient** record in the owned patient list.
2. Sign in as the demo patient to review and approve the pending profile in HealthInfo. Use separate browser profiles or sign out before switching roles, since tabs in the same profile share the login cookie.
3. Return as the doctor to create a fictitious diagnosis or appointment for the approved record. As the patient, inspect the resulting diagnosis and review the appointment. Use example text and avoid real identities or medical information.

The seed creates one adult profile. Creating new adult or guardian-linked records through the app can require email-domain DNS validation. Reserved fixture addresses are for the seeded records. The automated tests also exercise guardian and other cases using synthetic fixtures.

## Optional integrations

| Integration | Features and settings |
| --- | --- |
| Cloudflare Email Sending | Registration verification, resend, welcome and password reset email use `EMAIL_PROVIDER=cloudflare`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_API_TOKEN`, `EMAIL_FROM_ADDRESS` and `EMAIL_FROM_NAME`. Use a development account and authorized sender. The demo uses fixture accounts when mail is unavailable. |
| Turnstile | The example sets `CAPTCHA_ENABLED=false` for the local demo. To test verification, set `CAPTCHA_ENABLED=true`, `CAPTCHA_PROVIDER=turnstile`, `TURNSTILE_SECRET_KEY` and the widget's `TURNSTILE_EXPECTED_HOSTNAMES` in the root `.env`. Set `VITE_CAPTCHA_ENABLED=true`, `VITE_CAPTCHA_PROVIDER=turnstile` and `VITE_TURNSTILE_SITE_KEY` in `frontend/.env.local` and restart both processes. Use a matching development key pair. Only the site key is public. |
| Google OAuth | Google sign-in requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and a registered `API_GOOGLE_REDIRECT_URI`, which defaults to `http://localhost:5001/api/auth/google/callback` for local use. `CLIENT_URL` controls the frontend return origin. |
| Cloudinary | Avatar uploads and imports require `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`. |
| DeepL | Translation uses `DEEPL_API_KEY` and optionally `DEEPL_API_URL` for the translation endpoint. Without the key, views use the original text. |

## Automated checks

The test suites use synthetic fixtures and mocked integrations. See [Testing](TESTING.md) for the full test matrix and focused examples.

```powershell
node --env-file=.env --test "backend/**/*.test.js"
node --test "cloudflare/**/*.test.js"
node --test ".github/**/*.test.mjs"
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run build
node .github/scripts/verify-build.mjs
git diff --check
```

The CI helper tests use Git Bash on Windows. The build check verifies static artifacts. Use the Vite development server above for an interactive local session.

## Troubleshooting and shutdown

- **Docker cannot connect to its engine.** Start Docker Desktop with Linux containers and wait for `docker version` to show the server. For MongoDB startup issues, run `docker compose -f compose.local.yml logs mongo`.
- **MongoDB is unreachable or transactions fail.** Check that Compose reports a healthy primary and that `.env` contains the exact local URI. A standalone server lacks the required transaction support.
- **Backend exits before listening.** Check the root `.env`, both generated secrets and port `5001`. Check the shell for overrides before retrying.
- **Login or CORS fails.** Open `http://localhost:5173`, check that Vite did not change ports, and verify the backend readiness endpoint. If using Turnstile, check the frontend and backend flags and the configured hostname.
- **Seed refuses to run.** Use the development database and keep the accounts from the first run. A production mode, alternate URI or populated database is rejected.

Stop Express and Vite with Ctrl+C, then stop the local database:

```powershell
docker compose -f compose.local.yml down
```

The named volume retains the synthetic accounts and records for the next session.
