# Architecture

## Verified current architecture

This describes the checked-in implementation, not live infrastructure state or the currently deployed SHA.

### Frontend

`frontend/src/main.jsx` mounts React with BrowserRouter, TanStack Query's provider, language initialization and toasts. `frontend/src/App.jsx` defines public/auth and role-specific application routes.

| Area | Organization |
| --- | --- |
| Build/style | Vite and Tailwind CSS, configured in `frontend/vite.config.js` and `frontend/src/index.css` |
| Navigation | React Router, Navbar, shared navigation configuration, Sidebar and MobileNavigationDrawer |
| Client state | Zustand stores under `frontend/src/stores/`, including auth |
| Server state | TanStack Query feature hooks under `frontend/src/features/` |
| HTTP | Credentialed Axios in `frontend/src/lib/axios.js`; development API versus relative production `/api` |
| Languages | react-i18next/i18next, `frontend/src/i18n.js`, English/Spanish catalogs under `frontend/src/locals/` |
| Pages | Registration, patient records, diagnosis records, patient/guardian portal and calendar |

Frontend guards present the appropriate flow; [Security model](SECURITY_MODEL.md) owns access enforcement. [Design system](DESIGN_SYSTEM.md) describes existing components.

### Backend

`backend/src/server.js` configures Express, proxy trust, headers, CORS, JSON/cookies, API routes and the global error handler. `runtime/startup.js` validates required configuration, connects MongoDB before HTTP startup, conditionally starts reminders and registers graceful shutdown. `config/db.js` bounds connection attempts; `runtime/gracefulShutdown.js` handles shutdown.

| Layer under `backend/src/` | Responsibility |
| --- | --- |
| `routes/` | HTTP endpoints and ordered middleware |
| `middleware/` | Auth, verification, roles, captcha, limits, headers and shared errors |
| `controllers/` | Request/response handling; some domains also keep substantial business logic here |
| `services/patients/` | Writes, reads, portal, history, approvals and access requests |
| `services/appointments/` | Appointment lifecycle transitions |
| `services/reminderService.js` | Scheduled appointment reminders |
| `models/` | Mongoose documents and indexes |
| `controllers/helpers/`, `utils/` | Normalization, age, mail, token and integration helpers |

Do not assume every controller delegates to a service: auth and diagnosis are controller-centered examples.

### API domains and models

| Mount | Route file | Main models |
| --- | --- | --- |
| `/api/auth` | `authRoutes.js` | User, ProfessionalAllowlist; Patient for identity collisions |
| `/api/patients` | `patientRoutes.js` | Patient, PatientHistory, PatientAccessRequest |
| `/api/diagnoses` | `diagnosesRoutes.js` | Diagnosis, DiagnosisHistory, Patient |
| `/api/appointments` | `appointmentRoutes.js` | Appointment, Patient, User, Notification |
| `/api/notifications` | `notificationRoutes.js` | Notification |
| `/api/health` | `healthRoutes.js` | Liveness response and Mongoose connection-state readiness |

Models live under `backend/src/models/`. User accounts and Patient records are separate resources. History models hold snapshots; access requests relate a doctor to one Patient. [Domain rules](DOMAIN_RULES.md) owns functional relationships.

Mail uses `utils/email.js` templates and the explicit `utils/emailTransport.js` provider guard, with Cloudflare Email Sending as the only supported transport; missing or unsupported EMAIL_PROVIDER values fail without sending. Google OAuth, Cloudinary avatar handling and DeepL translation utilities are integrations, not proof of external-service availability.

### Configured production boundary

```text
Browser
  |
  v
Cloudflare (original deployment architecture)
  +-- Static Assets: frontend/dist, SPA fallback
  |
  +-- /api and /api/* -> Worker
                         |
                         v
                 DrVipsApi Container (primary)
                         |
                         v
                 Node.js / Express -> MongoDB
```

Sources: `wrangler.jsonc`, `cloudflare/src/index.js`, `Dockerfile`, `backend/src/server.js` (repository-root paths). The public Wrangler reference retains the component wiring with reserved example addresses and no production account/domain binding; [Deployment](DEPLOYMENT.md) explains the configuration deviations.

Wrangler runs the Worker first for `/api` and `/api/*`. The Worker tests these exact boundaries and forwards to `DR_VIPS_API`; it returns 404 if invoked for non-API requests. Normal frontend serving belongs to Static Assets.

The container uses port 8080, `sleepAfter = "10m"` and Internet access. Wrangler selects a `lite` instance with `max_instances: 1`. These are configuration facts, not capacity or availability guarantees.

Docker installs production dependencies and copies only `backend/`. Express contains a production `frontend/dist` fallback, but Docker does not copy that directory; the configured Cloudflare frontend path is Static Assets.

## Assumptions / unknown

No alternative hosting architecture is assumed. The live deployed revision, database topology and settings outside the repository need separate verification; see [Deployment](DEPLOYMENT.md).
