# Security model

This describes implemented, source-visible controls. It is not a comprehensive security assessment or evidence of regulatory, clinical or security certification.

Abbreviated middleware/model/utility paths resolve under `backend/src/`; controller filenames refer to `backend/src/controllers/`.

## Sessions and accounts

- `backend/src/utils/generateTokenAndSetCookie.js` issues JWTs with userId/sessionVersion and seven-day expiry. The token cookie is HTTP-only, SameSite=Lax, path `/`, Secure in production, with matching seven-day lifetime.
- `middleware/auth.js` verifies the cookie JWT, loads User and compares session versions, rejecting invalid or revoked sessions.
- `models/User.js` hashes passwords with bcrypt and allowlists public fields. Passwords, verification/reset credentials and sessionVersion are not in public serialization.
- Registration/reset enforce `utils/passwordPolicy.js`: string, at least six characters, ASCII lowercase/uppercase, digit and non-alphanumeric character. Passwords are not trimmed/normalized.
- `authController.js` resets through one conditional `findOneAndUpdate` matching the hashed bearer and expiry. The winner writes an explicitly hashed password, consumes reset/verification fields, verifies the account and increments sessionVersion once. Reset does not issue a new login cookie. `verifyResetCode` atomically exchanges a code hash for a bearer hash. Regression evidence is under `controllers/vips-test/auth/`.
- Email verification consumes a matching unexpired code through a conditional write. Resend rotates the stored code through a conditional update, and a superseded code cannot verify the account.
- Browser session-change notifications use a nonce without identity or medical data. The browser revalidates with the server after relevant focus, storage or back-forward-cache events. The auth store clears cached query state when it discards the identity and scopes asynchronous results to the active session.
- Verification/reset credentials are distinct from login JWTs. Domain routes generally require protect then requireVerified, followed by role/resource checks. Auth and health routes have their own requirements; not all API routes require a verified account.

## Roles and resource privacy

Roles are doctor/patient. `middleware/roles.js` and routes constrain operations; services/controllers additionally authorize the particular resource. Frontend guards and hidden navigation are UX, not authorization.

[Domain rules](DOMAIN_RULES.md) owns exact ownership, current-minor/guardian, snapshots, histories and per-Patient consent rules. Knowing an ID or matching stale guardian metadata does not imply access to the complete record. Doctor identification uses exact name, email and adult/minor mode in a rate-limited POST body and returns a neutral acknowledgement for valid submissions. Legacy search/preview do not query Patients; legacy POST aliases require identification rather than an ID alone. Doctor request history requires an approved request and current ownership.

Identification is not consent: only the patient/guardian decision transaction grants access to the exact requested record. Validation errors do not echo identification inputs, and unexpected failures use the sanitized error pipeline. Patient create/update conflict responses retain their error codes without returning another Patient's ID. These controls do not guarantee that all application responses conceal record existence or have constant-time behavior.

`notificationController.js` scopes read/read-state actions to the authenticated recipient. Access-request serialization selects fields needed by that flow.

## Account eligibility and email identity

Doctor-registration eligibility is controlled by PROFESSIONAL_ALLOWLIST_ENFORCED. When enforcement is enabled, `authController.js` applies ProfessionalAllowlist email/domain checks to password doctor registration, Google pending eligibility and Google doctor finalization. Membership is not evidence of licensure or clinical qualification. The public configuration is a technical reference, not a statement of live eligibility policy.

Doctor creation by password or Google finalization rejects Patient.email collisions with `409 / DOCTOR_EMAIL_RESERVED`. Patient writes reject doctor User emails with `409 / PATIENT_EMAIL_RESERVED`; patient-role User emails remain allowed. These application-level checks are independent of allowlist enforcement and do not provide a cross-collection database uniqueness guarantee.

Registration uses `utils/emailAddress.js` normalization/single-mailbox validation before lookup/create/delivery. The Cloudflare Email Sending transport validates recipients; `utils/email.js` escapes untrusted welcome-name text before substitution. Email delivery supports only explicit EMAIL_PROVIDER=`cloudflare`; missing or unsupported providers fail without fallback.

Google OAuth uses state-cookie comparison, server-side exchange and a short-lived signed pending cookie for new-user role selection. The captcha pre-step is enforced when captcha is enabled. Preserve these checks when changing role-selection UX.

## HTTP and abuse controls

`server.js` configures credentialed CORS for CLIENT_URL and the local Vite development origin. CORS is not resource authorization.

`middleware/securityHeaders.js` configures Helmet/CSP and production HSTS for Express. `frontend/public/_headers` separately configures static-asset headers; Helmet does not cover Worker-served HTML. API middleware sets private/no-store headers. The global error handler classifies expected failures and returns a generic internal-error response; patientController forwards unexpected failures to it.

CAPTCHA_ENABLED controls whether `middleware/captcha.js` requires verification. When enabled, Turnstile verification checks provider success, expected action and hostname; production requires configured expected hostnames. Missing configuration, unsupported providers and verification failures do not bypass an enabled check. Auth routes apply verification to login, registration and the Google pre-step. POST `/api/auth/google/recaptcha` is the compatibility URL for that Turnstile-protected OAuth pre-step.

The login page suspends the visible password Turnstile widget while it obtains a separate Google OAuth captcha token. The backend continues to verify the token for the requested action.

Rate limits in `middleware/rateLimit.js` use standard RateLimit headers and controlled 429 responses. Separate limiters cover API traffic, authentication, email actions, verification, reads, writes and authenticated avatar operations. Route declarations determine applicability/order; notifications use readLimiter for GET and writeLimiter for both PUT actions. Avatar limits use authenticated user identity. These are process-local middleware limits.

Avatar routes authenticate before limiting. Multer applies MIME-type filtering and uses memoryStorage with one avatar file, 2 MB, no text fields, one part and nesting depth 1. The server streams the upload buffer to Cloudinary. For URL imports, it validates the HTTP(S) URL and asks Cloudinary to retrieve it. The server saves a provider-returned HTTPS URL after a successful result and returns controlled errors on failure.

## Configuration and trust boundaries

The browser receives public build configuration. Worker bindings explicitly forward environment names to Node. Secret values belong in private secret storage, never documentation or client VITE variables. [Deployment](DEPLOYMENT.md) describes reference configuration and release boundaries; [Architecture](ARCHITECTURE.md) owns request routing.

Use synthetic identities and disposable data for local testing.
