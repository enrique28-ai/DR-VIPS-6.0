import assert from "node:assert/strict";
import test from "node:test";

import { createPatientService } from "../patientWriteService.js";

const user = { _id: "doctor-id" };

function makeValidCreateBody(overrides = {}) {
  return {
    fullname: "New Patient",
    email: "new@example.com",
    phone: "6195550102",
    birthDate: "1990-01-01",
    bloodtype: "O+",
    gender: "male",
    organDonor: true,
    bloodDonor: false,
    measurementSystem: "metric",
    height: 1.75,
    weight: 72,
    country: "United States",
    state: "California",
    city: "San Diego",
    ...overrides,
  };
}

test("createPatientService rejects missing birthDate", async () => {
  await assert.rejects(
    () =>
      createPatientService({
        user,
        body: makeValidCreateBody({ birthDate: "" }),
      }),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.errorCode, "BIRTHDATE_REQUIRED");
      return true;
    }
  );
});

test("createPatientService rejects future birthDate", async () => {
  await assert.rejects(
    () =>
      createPatientService({
        user,
        body: makeValidCreateBody({ birthDate: "2999-01-01" }),
      }),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.errorCode, "BIRTHDATE_IN_FUTURE");
      return true;
    }
  );
});

test("createPatientService rejects invalid gender", async () => {
  await assert.rejects(
    () =>
      createPatientService({
        user,
        body: makeValidCreateBody({ gender: "unknown" }),
      }),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.message, "Missing required fields");
      return true;
    }
  );
});

test("createPatientService rejects adult without email", async () => {
  await assert.rejects(
    () =>
      createPatientService({
        user,
        body: makeValidCreateBody({ email: "" }),
      }),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.message, "Missing required fields");
      return true;
    }
  );
});

test("createPatientService rejects adult without phone", async () => {
  await assert.rejects(
    () =>
      createPatientService({
        user,
        body: makeValidCreateBody({ phone: "" }),
      }),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.message, "Missing required fields");
      return true;
    }
  );
});
