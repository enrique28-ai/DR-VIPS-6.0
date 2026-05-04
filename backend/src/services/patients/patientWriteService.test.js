import assert from "node:assert/strict";
import dnsPromises from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { after, test } from "node:test";

const originalResolveMx = dnsPromises.resolveMx;
const originalResolve4 = dnsPromises.resolve4;
const originalResolve6 = dnsPromises.resolve6;

dnsPromises.resolveMx = async () => [{ exchange: "mail.example.com", priority: 10 }];
dnsPromises.resolve4 = async () => [];
dnsPromises.resolve6 = async () => [];
syncBuiltinESMExports();

const { default: Patient } = await import("../../models/Patient.js");
const { createPatientService, updatePatientService } = await import(
  "./patientWriteService.js"
);

after(() => {
  dnsPromises.resolveMx = originalResolveMx;
  dnsPromises.resolve4 = originalResolve4;
  dnsPromises.resolve6 = originalResolve6;
  syncBuiltinESMExports();
});

test("createPatientService blocks duplicate phoneDigits on create", async () => {
  const originalFindOne = Patient.findOne;
  const originalFind = Patient.find;
  const originalCreate = Patient.create;

  const user = { _id: "doctor-id" };
  const duplicate = { _id: "duplicate-patient-id" };
  const findOneCalls = [];

  Patient.findOne = (query) => {
    findOneCalls.push(query);

    return {
      select: (projection) => {
        assert.match(projection, /_id/);
        return {
          lean: async () => (query.phoneDigits ? duplicate : null),
        };
      },
    };
  };
  Patient.find = (query) => ({
    sort: (sort) => {
      assert.deepEqual(query, { email: "new@example.com" });
      assert.deepEqual(sort, { updatedAt: -1 });
      return {
        select: (projection) => {
          assert.equal(projection, "_id updatedAt");
          return {
            lean: async () => [],
          };
        },
      };
    },
  });
  Patient.create = async () => {
    throw new Error("Patient.create should not be called for duplicate phone");
  };

  try {
    await assert.rejects(
      () =>
        createPatientService({
          user,
          body: {
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
  } finally {
    Patient.findOne = originalFindOne;
    Patient.find = originalFind;
    Patient.create = originalCreate;
  }
});

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
