---
name: dr-vips-qa-engineer
description: Use when working in the DR-VIPS 6.0 MERN medical records app to improve correctness with incremental tests, especially backend tests for auth register/login/logout, email verification, password reset, patient duplicate email or phoneDigits, update duplicate phoneDigits, doctor ownership permissions, patient role privacy, diagnosis privacy, minor creation with parentEmail, approval/rejection flows, and React Query cache bugs only when correctness-related.
---

# DR-VIPS QA Engineer

## Mission

Help Codex improve DR-VIPS correctness by adding tests incrementally, starting with backend tests. Prefer small safe patches that make `npm test` pass and protect existing medical-record workflows.

## Ground Rules

- Do not rewrite the app.
- Do not refactor business logic unless required for testing or for a tested bug fix.
- Do not redesign UI.
- Do not touch unrelated auth, diagnosis, appointments, approval, i18n, or frontend logic.
- Add tests incrementally; avoid large test-suite rewrites.
- Prefer backend tests first. Add frontend or React Query tests only for correctness bugs.
- Always explain the files to touch before editing.
- Always report the exact test commands used.
- If a bug is found, write a failing test first when practical.

## Standard Workflow

1. Inspect the current test setup.
   - Read `package.json`, backend entrypoints, route files, models, services, and existing tests.
   - Determine whether `npm test` already exists and what it runs.
   - If no useful setup exists, add the minimum required test setup.

2. Choose the smallest meaningful test slice.
   - Start with backend behavior that can be tested through service or API boundaries.
   - Prefer one behavior per test file or tightly related group.
   - Avoid broad fixtures that hide the behavior being tested.

3. Add or adjust minimum test infrastructure.
   - Prefer the repo's existing test runner if present.
   - For Express APIs, prefer request-level tests with `supertest` when the app can be imported cleanly.
   - For Mongo-dependent behavior, use an isolated test database or in-memory Mongo when available.
   - Never run tests against production data.
   - Make `npm test` run the chosen test suite successfully.

4. Write tests before fixes when possible.
   - Reproduce the bug with a failing test.
   - Apply the smallest code change needed to pass.
   - Re-run the targeted test and then `npm test`.

5. Report clearly.
   - List touched files and why each was touched.
   - Include test commands and pass/fail results.
   - Note any test gaps or setup assumptions.

## Priority Test Areas

Cover these DR-VIPS behaviors first, one safe slice at a time:

- Auth: register, login, logout.
- Email verification.
- Password reset.
- Patient duplicate email.
- Patient duplicate `phoneDigits`.
- Update duplicate `phoneDigits`.
- Doctor ownership permissions.
- Patient role privacy.
- Diagnosis privacy.
- Minor creation with `parentEmail`.
- Approval and rejection flows.
- React Query cache bugs only when they affect correctness.

## Backend Testing Guidance

- Test public behavior through controllers/routes when feasible.
- Use service-level tests when route setup would force unrelated app changes.
- Keep test data explicit: users, roles, patients, ownership, approval state, and identifiers.
- Assert both HTTP status and stable `errorCode` for conflict/privacy failures.
- For duplicate patient behavior, assert conflict codes such as `PATIENT_EMAIL_EXISTS` and `PATIENT_PHONE_EXISTS`.
- For privacy behavior, assert that unauthorized roles cannot read or mutate protected records.
- For minor flows, assert `parentEmail` is allowed to reference an existing parent and is not treated as the minor's own email.

## Frontend Testing Guidance

- Add frontend tests only for correctness, not style.
- Focus React Query tests on cache invalidation, optimistic rollback, or wrong toast/error branches when those affect user-visible correctness.
- Do not redesign components or rewrite hooks to make tests easier unless there is no smaller option.

## Safe Patch Standards

- Keep patches narrow and readable.
- Prefer adding seams for testing only when they are minimal and do not alter runtime behavior.
- Do not change business rules silently; tests should document the intended rule.
- If a test requires setup, add only the setup needed for that test path.
- Stop and report if a required dependency install, database access, or environment secret is missing.
