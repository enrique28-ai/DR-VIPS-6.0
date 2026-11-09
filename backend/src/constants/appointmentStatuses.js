export const ACTIVE_APPOINTMENT_STATUSES = Object.freeze(["pending", "accepted"]);
export const CANCELLED_DUE_TO_DEATH_STATUS = "cancelled_due_to_death";
export const CANCELLED_DUE_TO_GUARDIAN_UNAVAILABLE_STATUS =
  "cancelled_due_to_guardian_unavailable";
export const APPOINTMENT_STATUSES = Object.freeze([
  ...ACTIVE_APPOINTMENT_STATUSES,
  CANCELLED_DUE_TO_DEATH_STATUS,
  CANCELLED_DUE_TO_GUARDIAN_UNAVAILABLE_STATUS,
]);
