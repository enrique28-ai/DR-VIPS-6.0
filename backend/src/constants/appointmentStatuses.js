export const ACTIVE_APPOINTMENT_STATUSES = Object.freeze(["pending", "accepted"]);
export const CANCELLED_DUE_TO_DEATH_STATUS = "cancelled_due_to_death";
export const APPOINTMENT_STATUSES = Object.freeze([
  ...ACTIVE_APPOINTMENT_STATUSES,
  CANCELLED_DUE_TO_DEATH_STATUS,
]);
