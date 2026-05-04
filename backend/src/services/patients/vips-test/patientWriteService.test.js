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

const { default: Patient } = await import("../../../models/Patient.js");
const { createPatientService, updatePatientService } = await import(
  "../patientWriteService.js"
);

const originalPatientMethods = {
  create: Patient.create,
  find: Patient.find,
  findOne: Patient.findOne,
};

after(() => {
  dnsPromises.resolveMx = originalResolveMx;
  dnsPromises.resolve4 = originalResolve4;
  dnsPromises.resolve6 = originalResolve6;
  syncBuiltinESMExports();
  restorePatientMethods();
});

function makeAdultPatient(overrides = {}) {
  return {
    _id: "current-patient-id",
    fullname: "Current Patient",
    email: "current@example.com",
    phone: "+16195550101",
    phoneDigits: "16195550101",
    country: "United States",
    birthDate: new Date("1990-01-01T12:00:00.000Z"),
    age: 35,
    owners: ["doctor-id"],
    createdBy: "doctor-id",
    ...overrides,
  };
}

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

function restorePatientMethods() {
  Patient.create = originalPatientMethods.create;
  Patient.find = originalPatientMethods.find;
  Patient.findOne = originalPatientMethods.findOne;
}

function mockPatientFindOneSequence(responses) {
  const calls = [];

  Patient.findOne = (query) => {
    calls.push(query);
    const response = responses[calls.length - 1];

    if (!response || response.kind === "lean") {
      return {
        lean: async () => response?.value,
      };
    }

    if (response.kind === "selectLean") {
      return {
        select: (projection) => {
          if (response.projection) assert.equal(projection, response.projection);
          else assert.match(projection, /_id/);
          return {
            lean: async () => response.value,
          };
        },
      };
    }

    throw new Error(`Unsupported Patient.findOne mock response: ${response.kind}`);
  };

  return calls;
}

test("createPatientService blocks duplicate email on create", async () => {
  restorePatientMethods();

  const user = { _id: "doctor-id" };
  const duplicate = { _id: "duplicate-patient-id" };
  const findOneCalls = mockPatientFindOneSequence([
    { kind: "selectLean", value: duplicate },
  ]);

  Patient.create = async () => {
    throw new Error("Patient.create should not be called for duplicate email");
  };

  try {
    await assert.rejects(
      () =>
        createPatientService({
          user,
          body: makeValidCreateBody({ email: "New@Example.com" }),
        }),
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.errorCode, "PATIENT_EMAIL_EXISTS");
        assert.equal(err.patientId, duplicate._id);
        return true;
      }
    );

    assert.equal(findOneCalls.length, 1);
    assert.deepEqual(findOneCalls[0], { email: "new@example.com" });
  } finally {
    restorePatientMethods();
  }
});

test("createPatientService blocks duplicate phoneDigits on create", async () => {
  restorePatientMethods();

  const user = { _id: "doctor-id" };
  const duplicate = { _id: "duplicate-patient-id" };
  const findOneCalls = mockPatientFindOneSequence([
    { kind: "selectLean", value: null },
    { kind: "selectLean", value: duplicate, projection: "_id" },
  ]);

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
          body: makeValidCreateBody(),
        }),
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.errorCode, "PATIENT_PHONE_EXISTS");
        assert.equal(err.patientId, duplicate._id);
        return true;
      }
    );

    assert.equal(findOneCalls.length, 2);
    assert.equal(findOneCalls[1].phoneDigits, "16195550102");
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService blocks duplicate phoneDigits on update", async () => {
  restorePatientMethods();

  const user = { _id: "doctor-id" };
  const current = makeAdultPatient({ owners: [user._id], createdBy: user._id });
  const duplicate = { _id: "duplicate-patient-id" };
  const findOneCalls = mockPatientFindOneSequence([
    { kind: "lean", value: current },
    { kind: "selectLean", value: duplicate, projection: "_id" },
  ]);

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
    assert.equal(findOneCalls[1].phoneDigits, "16195550102");
    assert.deepEqual(findOneCalls[1]._id, { $ne: current._id });
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService blocks duplicate email on update when current patient has no email", async () => {
  restorePatientMethods();

  const user = { _id: "doctor-id" };
  const current = makeAdultPatient({
    email: undefined,
    owners: [user._id],
    createdBy: user._id,
  });
  const duplicate = { _id: "duplicate-patient-id" };
  const findOneCalls = mockPatientFindOneSequence([
    { kind: "lean", value: current },
    { kind: "selectLean", value: duplicate, projection: "_id" },
  ]);

  try {
    await assert.rejects(
      () =>
        updatePatientService({
          user,
          patientId: current._id,
          body: {
            email: "New@Example.com",
          },
        }),
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.errorCode, "PATIENT_EMAIL_EXISTS");
        assert.equal(err.patientId, duplicate._id);
        return true;
      }
    );

    assert.equal(findOneCalls.length, 2);
    assert.deepEqual(findOneCalls[1], {
      email: "new@example.com",
      _id: { $ne: current._id },
    });
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService rejects changing an existing email", async () => {
  restorePatientMethods();

  const user = { _id: "doctor-id" };
  const current = makeAdultPatient({ owners: [user._id], createdBy: user._id });
  const findOneCalls = mockPatientFindOneSequence([{ kind: "lean", value: current }]);

  try {
    await assert.rejects(
      () =>
        updatePatientService({
          user,
          patientId: current._id,
          body: {
            email: "new@example.com",
          },
        }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(
          err.message,
          "You can not modify the email once it is registered."
        );
        return true;
      }
    );

    assert.equal(findOneCalls.length, 1);
  } finally {
    restorePatientMethods();
  }
});
