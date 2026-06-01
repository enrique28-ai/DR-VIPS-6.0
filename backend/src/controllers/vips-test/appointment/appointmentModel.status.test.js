import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACTIVE_APPOINTMENT_STATUSES,
  APPOINTMENT_STATUSES,
  CANCELLED_DUE_TO_DEATH_STATUS,
  CANCELLED_DUE_TO_GUARDIAN_UNAVAILABLE_STATUS,
} from "../../../constants/appointmentStatuses.js";
import Appointment from "../../../models/Appointment.js";

test("Appointment model supports active and inactive lifecycle statuses", () => {
  const statusPath = Appointment.schema.path("status");

  assert.deepEqual(ACTIVE_APPOINTMENT_STATUSES, ["pending", "accepted"]);
  assert.equal(CANCELLED_DUE_TO_DEATH_STATUS, "cancelled_due_to_death");
  assert.equal(
    CANCELLED_DUE_TO_GUARDIAN_UNAVAILABLE_STATUS,
    "cancelled_due_to_guardian_unavailable"
  );
  assert.deepEqual(APPOINTMENT_STATUSES, [
    "pending",
    "accepted",
    "cancelled_due_to_death",
    "cancelled_due_to_guardian_unavailable",
  ]);
  assert.deepEqual(statusPath.enumValues, APPOINTMENT_STATUSES);
  assert.equal(statusPath.defaultValue, "pending");
});
