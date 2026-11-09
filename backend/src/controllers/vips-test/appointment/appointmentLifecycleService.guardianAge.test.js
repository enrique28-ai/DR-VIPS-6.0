import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Appointment from "../../../models/Appointment.js";
import Patient from "../../../models/Patient.js";
import { cancelFutureActiveChildAppointmentsDueToGuardianUnavailable } from "../../../services/appointments/appointmentLifecycleService.js";

const originalPatientFind = Patient.find;
const originalAppointmentUpdateMany = Appointment.updateMany;

afterEach(() => {
  Patient.find = originalPatientFind;
  Appointment.updateMany = originalAppointmentUpdateMany;
});

function birthDateAtBoundary(referenceDate, dayOffset = 0) {
  const birthDate = new Date(referenceDate);
  birthDate.setHours(12, 0, 0, 0);
  birthDate.setFullYear(birthDate.getFullYear() - 18);
  birthDate.setDate(birthDate.getDate() + dayOffset);
  return birthDate;
}

test("guardian-unavailable lifecycle excludes adults with stale parentEmail", async () => {
  const now = new Date("2026-08-16T10:00:00.000Z");
  const profiles = [
    {
      _id: "adult-patient-id",
      parentEmail: "guardian@example.com",
      birthDate: birthDateAtBoundary(now, 0),
      age: 17,
      isDeceased: false,
    },
    {
      _id: "minor-patient-id",
      parentEmail: "guardian@example.com",
      birthDate: birthDateAtBoundary(now, 1),
      age: 17,
      isDeceased: false,
    },
  ];
  const patientFindCalls = [];
  Patient.find = (query) => {
    patientFindCalls.push(query);
    return {
      select() {
        return {
          lean: async () => profiles,
        };
      },
    };
  };
  const updateCalls = [];
  Appointment.updateMany = async (query, update) => {
    updateCalls.push({ query, update });
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  };

  await cancelFutureActiveChildAppointmentsDueToGuardianUnavailable(
    " Guardian@Example.com ",
    now
  );

  assert.equal(patientFindCalls.length, 1);
  assert.deepEqual(updateCalls[0].query.patient.$in, ["minor-patient-id"]);
});
