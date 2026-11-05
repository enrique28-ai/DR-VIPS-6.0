# Domain rules

This is the canonical description of functional invariants observed in models, controllers, services and regression tests. It is not a new medical policy. Abbreviated backend paths resolve under `backend/src/`; bare filenames refer to the directory identified alongside them. [Security model](SECURITY_MODEL.md) owns HTTP/session protections; this document owns record relationships and permitted domain operations.

## Accounts, records and doctor ownership

User roles are `doctor` and `patient`; a User account is distinct from a Patient resource. `Patient.createdBy` records the creator, `owners` identifies doctors with access, and `lastEditedBy` records the last editor. New model saves add the creator to owners. Patient reads/writes check owners or creator rather than trusting a supplied doctor ID.

Sources: `backend/src/models/User.js`, `Patient.js`, `services/patients/patientWriteService.js`, `patientReadService.js` and `controllers/vips-test/patient/patientOwnershipService.test.js`.

## Identity and required contact information

- New profiles require birthDate; create/update validate required demographic and measurement inputs on the backend. Dynamic age determines adult/minor treatment.
- Adults require email and phone. Minors may omit both; supplied values still require validation.
- Patient email is trimmed/lowercased. The patient email helper checks syntax and domain MX/A/AAAA availability. Account single-mailbox validation is a separate implementation; do not assume the two validators are identical.
- Phone country/name and ISO must identify a consistent supported country. `libphonenumber-js` validates the number against that country, stores E.164 and derives `phoneDigits` from the normalized E.164 value. Duplicate checks use phoneDigits rather than raw formatting.
- Patient declares partial unique indexes on nonempty email and phoneDigits. Services also perform duplicate checks.
- An existing nonempty Patient email is immutable in ordinary updates. A missing email may be added subject to validation.
- A Patient email matching any doctor User is rejected with `409 / PATIENT_EMAIL_RESERVED`. Patient-role User emails remain allowed. Update validates the effective resulting adult email, including one already present before a minor-to-adult transition. The inverse account-registration protection is described in [Security model](SECURITY_MODEL.md#account-eligibility-and-email-identity).

Sources: `models/Patient.js`, `services/patients/patientWriteService.js`, `controllers/helpers/patienthelpers.js`; tests `patientWriteService.validation.test.js`, `patientWriteService.minors.test.js`, `patientWriteService.emailIdentity.test.js` under `controllers/vips-test/patient/`.

## Current minor status and guardian identity

`computeDynamicAge` in `controllers/helpers/patienthelpers.js` prefers a present valid birthDate. An invalid birthDate does not fall back to stored age. Future birth dates fail closed relative to the local reference calendar day; comparisons allow timestamps within that same day. These are calendar-day semantics, not an exact time-of-birth calculation.

Legacy age is used only when birthDate is absent/null and age is a finite, non-negative number. Null, empty, negative, numeric strings and malformed ages are not valid legacy evidence. `isCurrentMinorPatient` additionally excludes deceased records and requires age strictly below 18. Exactly 18 ends current guardian authority. The Mongo query helper uses the corresponding DOB cutoff/bounds or numeric legacy range `[0,18)`; its default excludes deceased patients.

The model stores age, but DOB-derived age is authoritative when available. Display/history age can freeze at dateOfDeath. Deterministic boundary, leap-day and malformed/legacy cases are covered in `patienthelpers.currentMinor.test.js`.

Minor creation links normalized parentEmail to an existing adult Patient with an approved profile and the child's name in its approved children data (including the existing legacy fallback). `minorKey` combines guardian email and normalized child name; it is a grouping key, not blanket family authorization. Ordinary updates cannot change an existing linked parentEmail. The explicit adulthood transition removes parentEmail/minorKey subject to adult validation.

Stale parentEmail alone does not authorize current-minor appointment or child-diagnosis operations. Adult self-access follows the adult's own authenticated email. Historical access follows each endpoint's identity checks and regression coverage.

## Patient identification and consent to doctor access

Verified doctors identify an existing Patient through `POST /api/patients/access-requests` with an adult/minor mode, full name and email. Adult mode uses the Patient email; minor mode uses the current guardian email. Email uses single-mailbox normalization. Names are trimmed, whitespace-collapsed and lowercased; punctuation and accents remain significant. A pending request requires exactly one matching identity and an eligible patient/guardian decision relationship. Ambiguous matches are not selected arbitrarily.

Valid identification submissions return the same neutral `202` acknowledgement without confirming a match or returning Patient/request IDs or contact details. Authentication, validation, rate limits and operational errors retain separate error responses. Legacy global search/preview return a constant `404` without querying Patients. Legacy ID-based POST aliases require the same identification body and ignore the path ID. Full Patient read still requires ownership.

Identification creates a pending PatientAccessRequest rather than immediately granting ownership. Each request identifies one Patient and the authenticated doctor. A partial unique index enforces one pending pair, and repeated creation reuses it. Statuses are pending, approved and rejected. Doctor request history returns only approved requests for Patients the doctor still owns.

The pending inbox is restricted to requests decidable by the authenticated adult's own Patient email or a current living minor's guardian email. Decision revalidates the relationship in a Mongo transaction. Conditional pending-request consumption and the approval owner grant share that transaction. Approval adds the doctor only to the request's exact Patient `_id`; no sibling/parent cascade. Rejection adds no owner. The service does not create access-request notifications.

Sources: `services/patients/patientReadService.js`, `patientAccessRequestService.js`, `models/PatientAccessRequest.js`, `routes/patientRoutes.js`; tests `patientAccessRequestService.test.js`, `patientAccessRequestRoutes.test.js` and `patientDiscoveryPrivacy.test.js`.

## Profile decisions and snapshots

Ordinary profile creation/edit participates in patient/guardian review. Patient stores approvedSnapshot as `{ set, unset }` and approvedAt; its isPendingApproval virtual is true before first approval and thereafter compares edit/approval timestamps. Portal services separately return pendingDecision, using their timestamp logic and the User's lastHealthDecisionAt where applicable. Pending decisions normally block further overlapping edits.

Patient approval canonicalizes the selected profile and synchronizes matching email profiles; child decisions use authorized guardian/minor identity and minorKey grouping. Approval stamps state and records PatientHistory. This legacy profile synchronization is different from exact-record access-request grants.

Rejection restores prior approved state where available. Initial rejection without a prior snapshot can delete the sole Patient profile and associated diagnoses; multiple legacy profiles have reconstruction behavior. Do not describe all rejection as non-destructive or a simple snapshot restore.

Existing explicit death-status workflows are exceptions to ordinary pending approval: certain isolated adult death-status transitions and minor death-status handling with unavailable guardian stamp approved state/history directly. These exceptions must not be generalized to other edits.

Sources: `models/Patient.js`, `services/patients/patientApprovalService.js`, `patientWriteService.js`, `patientPortalService.js`; tests `patientApprovalService.test.js` and patient write tests.

## Histories and diagnoses

PatientHistory stores approved snapshots, source Patient/editor/approval time, email/phone/minor identity and reassignment lineage. Doctor history is first scoped to an owned Patient; self history uses authenticated email; child history resolves guardian-linked minor identity. Detail reads combine history ID with authorized identity. Some history reads backfill a missing snapshot entry; do not assume every GET is persistence-free.

Diagnosis and DiagnosisHistory contain the current diagnosis and created/updated snapshots. Creation and update/history writes use transactions. Only an owning doctor creates a diagnosis; update additionally requires the diagnosis creator. A deceased Patient blocks new/updated diagnosis. No-change updates are rejected.

Doctor diagnosis reads remain creator-scoped: importing Patient access does not automatically reveal all other doctors' diagnoses. Own-patient portal reads can cover diagnoses for that patient's identity across doctors. Diagnosis history checks creator plus ownership for doctors or matching Patient email for self-access. Child endpoints use current guardian/current-minor resolution and constrain diagnosis/history IDs to the authorized group.

Sources: `models/PatientHistory.js`, `Diagnosis.js`, `DiagnosisHistory.js`, `services/patients/patientHistoryService.js`, `controllers/diagnosisController.js`; privacy/history tests under `controllers/vips-test/patient/` and `controllers/vips-test/diagnosis/`.

## Guardian reassignment

`PATCH /api/patients/:id/guardian` is a dedicated owning-doctor operation for a living linked minor. The current guardian Patient must exist and be deceased; generic absence is not sufficient. The replacement must be an existing living adult with an approved profile listing the child in approved children data.

The service updates matching minor-group records and approved snapshots and writes old/new guardian/minor-key lineage to PatientHistory. It does not reactivate appointments. Sources: `patientWriteService.js` (`reassignMinorGuardianService`), `patientGuardianReassignmentService.test.js`, `patientRoutes.guardianReassignment.test.js`.

## Appointments, lifecycle and notifications

Doctor creation requires a living owned Patient, valid ordered dates and an available guardian for a current minor. It rejects active appointment overlaps for the doctor or Patient and creates a pending appointment with eligible-recipient notification in a transaction. Patient acceptance requires own email or guardian email plus current minor status, pending state and the existing availability/conflict checks. Deletion permits the appointment doctor or authorized patient/guardian and physically removes the appointment; this differs from lifecycle archival.

Active states are pending/accepted. Lifecycle states include `cancelled_due_to_death` and `cancelled_due_to_guardian_unavailable`. Death processing archives future-start active appointments for the exact Patient. Guardian-unavailable processing selects current living minors, excluding adults with stale parentEmail. Archived states are excluded from active selectors and are not automatically reactivated on reassignment.

Notification recipients depend on each flow; appointment creation prefers the Patient email and falls back to the current minor's guardian. Do not promise identical recipients for every cancellation/lifecycle operation. Notification declares recipient/code/appointment uniqueness, read state, bilingual text and a 30-day TTL index; this is not a precise delivery/deletion-time guarantee. Reminder scheduling is controlled by APPT_REMINDERS_ENABLED; [Deployment](DEPLOYMENT.md#versioned-configuration-and-secret-boundaries) describes configuration forwarding.

Sources: `controllers/appointmentController.js`, `services/appointments/appointmentLifecycleService.js`, `services/reminderService.js`, `models/Appointment.js`, `Notification.js`, `constants/appointmentStatuses.js`; appointment/guardian-age regression tests under `controllers/vips-test/appointment/`.
