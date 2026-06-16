# DR-VIPS-6.0 Agent Instructions

## Project
DR-VIPS-6.0 is a medical records web application.

Backend:
- Node.js
- Express
- MongoDB/Mongoose
- JWT cookies
- Role-based access: doctor / patient

Frontend:
- React
- Vite
- React Router
- Zustand
- TanStack Query
- i18n

This project is not Flask.

## Critical rules
- Backend is the source of truth.
- Frontend validation is UX only.
- Do not weaken auth, JWT, cookies, CORS, captcha, rate limits, or role checks.
- Do not auto-approve patient profiles.
- Do not silently modify medical data.
- Medical changes must be explicit and reviewable.
- Do not touch unrelated systems.

## DR-VIPS domain rules
- Adults require email and phone.
- Minors may omit email and phone.
- If a minor has a phone, it must be valid.
- Phone must be normalized by backend to E.164.
- phoneDigits must be derived from E.164.
- Duplicate phone checks must use normalized phoneDigits.
- Linked minor parentEmail must not be edited through normal PatientEditPage.
- Guardian reassignment must go through PATCH /api/patients/:id/guardian.
- Deceased patients keep historical diagnosis/history readable.
- Archived lifecycle appointments must not be automatically reactivated.

## Commands
For backend changes:
npm.cmd test
git diff --check

For frontend changes:
npm.cmd --prefix frontend run build
git diff --check

## Workflow
- Plan first.
- Explain root cause before changing code.
- Keep changes minimal.
- Do not refactor unrelated files.
- Report files changed, tests run, and manual test steps.