import assert from "node:assert/strict";
import test from "node:test";

import Patient from "../../models/Patient.js";
import { updatePatientService } from "./patientWriteService.js";

test("updatePatientService blocks duplicate phoneDigits on update", async () => {
  const originalFindOne = Patient.findOne;

  const user = { _id: "doctor-id" };
  const current = {
    _id: "current-patient-id",
    fullname: "Current Patient",
    email: "current@example.com",
    phone: "+16195550101",
    phoneDigits: "16195550101",
    country: "United States",
    birthDate: new Date("1990-01-01T12:00:00.000Z"),
    age: 35,
    owners: [user._id],
    createdBy: user._id,
  };
  const duplicate = { _id: "duplicate-patient-id" };
  const findOneCalls = [];

  Patient.findOne = (query) => {
    findOneCalls.push(query);

    if (findOneCalls.length === 1) {
      return {
        lean: async () => current,
      };
    }

    return {
      select: (projection) => {
        assert.equal(projection, "_id");
        return {
          lean: async () => duplicate,
        };
      },
    };
  };

  try {
    await assert.rejects(
      () =>
        updatePatientService({
          user,
          patientId: current._id,
          body: {
            phone: "6195550102",
          },
        }),
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.errorCode, "PATIENT_PHONE_EXISTS");
        assert.equal(err.patientId, duplicate._id);
        return true;
      }
    );

    assert.equal(findOneCalls.length, 2);

    const duplicateLookup = findOneCalls[1];
    assert.equal(duplicateLookup.phoneDigits, "16195550102");
    assert.deepEqual(duplicateLookup._id, { $ne: current._id });
  } finally {
    Patient.findOne = originalFindOne;
  }
});
