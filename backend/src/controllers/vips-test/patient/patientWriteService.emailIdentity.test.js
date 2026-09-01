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
const { default: PatientHistory } = await import("../../../models/PatientHistory.js");
const { default: User } = await import("../../../models/User.js");
const { createPatientService, updatePatientService } = await import(
  "../../../services/patients/patientWriteService.js"
);

const originalMethods = {
  patientCreate: Patient.create,
  patientFind: Patient.find,
  patientFindOne: Patient.findOne,
  patientFindOneAndUpdate: Patient.findOneAndUpdate,
  patientHistoryCreate: PatientHistory.create,
  userFindOne: User.findOne,
  userFindOneAndUpdate: User.findOneAndUpdate,
};

const queryResult = (value) => ({
  lean: async () => value,
  select: () => ({ lean: async () => value }),
  sort: () => ({ select: () => ({ lean: async () => value }) }),
});

const minorBirthDate = () => `${new Date().getUTCFullYear() - 10}-01-01`;

const makeAdultCreateBody = (overrides = {}) => ({
  fullname: "Adult Patient",
  email: "adult@example.com",
  phone: "6195550102",
  phoneCountry: "United States",
  phoneCountryIso: "US",
  birthDate: "1990-01-01",
  bloodtype: "O+",
  gender: "female",
  organDonor: true,
  bloodDonor: false,
  measurementSystem: "metric",
  height: 1.7,
  weight: 68,
  country: "United States",
  state: "California",
  city: "San Diego",
  birthCountry: "United States",
  birthState: "California",
  birthCity: "San Diego",
  ...overrides,
});

const makeMinorCreateBody = (overrides = {}) => ({
  fullname: "Minor Patient",
  parentEmail: "parent@example.com",
  birthDate: minorBirthDate(),
  bloodtype: "O+",
  gender: "female",
  organDonor: false,
  bloodDonor: false,
  measurementSystem: "metric",
  height: 1.35,
  weight: 32,
  country: "United States",
  state: "California",
  city: "San Diego",
  birthCountry: "United States",
  birthState: "California",
  birthCity: "San Diego",
  ...overrides,
});

const makeAdultPatient = (overrides = {}) => ({
  _id: "adult-patient-id",
  fullname: "Adult Patient",
  email: "adult@example.com",
  phone: "+16195550102",
  phoneDigits: "16195550102",
  phoneCountry: "United States",
  phoneCountryIso: "US",
  birthDate: new Date("1990-01-01T12:00:00.000Z"),
  age: 36,
  bloodtype: "O+",
  gender: "female",
  organDonor: true,
  bloodDonor: false,
  measurementSystem: "metric",
  heightM: 1.7,
  weightKg: 68,
  diseases: [],
  allergies: [],
  medications: [],
  children: [],
  childrenCount: 0,
  country: "United States",
  state: "California",
  city: "San Diego",
  owners: ["doctor-id"],
  createdBy: "doctor-id",
  isDeceased: false,
  ...overrides,
});

const makeMinorPatient = (overrides = {}) => ({
  _id: "minor-patient-id",
  fullname: "Minor Patient",
  email: undefined,
  phone: "+16195550103",
  phoneDigits: "16195550103",
  phoneCountry: "United States",
  phoneCountryIso: "US",
  birthDate: new Date(`${minorBirthDate()}T12:00:00.000Z`),
  age: 10,
  bloodtype: "O+",
  gender: "female",
  organDonor: false,
  bloodDonor: false,
  measurementSystem: "metric",
  heightM: 1.35,
  weightKg: 32,
  diseases: [],
  allergies: [],
  medications: [],
  country: "United States",
  state: "California",
  city: "San Diego",
  parentEmail: "parent@example.com",
  minorKey: "parent@example.com::minor patient",
  owners: ["doctor-id"],
  createdBy: "doctor-id",
  isDeceased: false,
  ...overrides,
});

const approvedParent = {
  _id: "parent-patient-id",
  birthDate: new Date("1980-01-01T12:00:00.000Z"),
  age: 46,
  approvedAt: new Date("2026-01-01T12:00:00.000Z"),
  approvedSnapshot: { children: [{ name: "Minor Patient" }] },
  children: [{ name: "Minor Patient" }],
  isDeceased: false,
};

const restoreMethods = () => {
  Patient.create = originalMethods.patientCreate;
  Patient.find = originalMethods.patientFind;
  Patient.findOne = originalMethods.patientFindOne;
  Patient.findOneAndUpdate = originalMethods.patientFindOneAndUpdate;
  PatientHistory.create = originalMethods.patientHistoryCreate;
  User.findOne = originalMethods.userFindOne;
  User.findOneAndUpdate = originalMethods.userFindOneAndUpdate;
};

after(() => {
  restoreMethods();
  dnsPromises.resolveMx = originalResolveMx;
  dnsPromises.resolve4 = originalResolve4;
  dnsPromises.resolve6 = originalResolve6;
  syncBuiltinESMExports();
});

const mockUserDirectory = (users = []) => {
  const calls = [];
  User.findOne = (query) => {
    calls.push(query);
    const match = users.find(
      (candidate) => candidate.email === query.email && candidate.role === query.role
    );
    return {
      select: (projection) => {
        assert.equal(projection, "_id");
        return { lean: async () => match || null };
      },
    };
  };
  return calls;
};

const guardWrites = () => {
  Patient.create = async () => {
    throw new Error("Patient.create must not be called");
  };
  Patient.findOneAndUpdate = () => {
    throw new Error("Patient.findOneAndUpdate must not be called");
  };
  PatientHistory.create = async () => {
    throw new Error("PatientHistory.create must not be called");
  };
  User.findOneAndUpdate = async () => {
    throw new Error("User.findOneAndUpdate must not be called");
  };
};

const assertReservedError = (error) => {
  assert.equal(error.status, 409);
  assert.equal(error.errorCode, "PATIENT_EMAIL_RESERVED");
  assert.equal(error.message, "This email cannot be used for a patient profile.");
  assert.equal(Object.hasOwn(error, "patientId"), false);
  return true;
};

const mockAdultCreateDependencies = (users) => {
  const userCalls = mockUserDirectory(users);
  Patient.findOne = () => queryResult(null);
  Patient.find = () => ({
    sort: () => ({ select: () => ({ lean: async () => [] }) }),
  });
  return userCalls;
};

const runAllowedAdultCreate = async ({ email, users }) => {
  restoreMethods();
  const userCalls = mockAdultCreateDependencies(users);
  const createCalls = [];
  Patient.create = async (payload) => {
    createCalls.push(payload);
    return { toObject: () => ({ _id: "created-patient-id", ...payload }) };
  };

  try {
    const result = await createPatientService({
      user: { _id: "doctor-id" },
      body: makeAdultCreateBody({ email }),
    });
    return { result, createCalls, userCalls };
  } finally {
    restoreMethods();
  }
};

test("adult creation rejects the acting doctor's normalized email", async () => {
  restoreMethods();
  guardWrites();
  const userCalls = mockAdultCreateDependencies([
    { _id: "doctor-id", email: "doctor@example.com", role: "doctor" },
  ]);

  try {
    await assert.rejects(
      createPatientService({
        user: { _id: "doctor-id", email: "doctor@example.com" },
        body: makeAdultCreateBody({ email: "Doctor@Example.COM" }),
      }),
      assertReservedError
    );
    assert.deepEqual(userCalls, [{ email: "doctor@example.com", role: "doctor" }]);
  } finally {
    restoreMethods();
  }
});

test("adult creation rejects another doctor's email", async () => {
  restoreMethods();
  guardWrites();
  const userCalls = mockAdultCreateDependencies([
    { _id: "other-doctor-id", email: "other.doctor@example.com", role: "doctor" },
  ]);

  try {
    await assert.rejects(
      createPatientService({
        user: { _id: "doctor-id", email: "acting@example.com" },
        body: makeAdultCreateBody({ email: "other.doctor@example.com" }),
      }),
      assertReservedError
    );
    assert.deepEqual(userCalls, [
      { email: "other.doctor@example.com", role: "doctor" },
    ]);
  } finally {
    restoreMethods();
  }
});

test("minor creation rejects an optional doctor-owned patient email", async () => {
  restoreMethods();
  guardWrites();
  const userCalls = mockUserDirectory([
    { _id: "doctor-user-id", email: "doctor@example.com", role: "doctor" },
  ]);

  Patient.findOne = (query) => {
    if (query.email === "parent@example.com") return queryResult(approvedParent);
    return queryResult(null);
  };
  Patient.find = () => ({
    sort: () => ({ select: () => ({ lean: async () => [] }) }),
  });

  try {
    await assert.rejects(
      createPatientService({
        user: { _id: "doctor-id" },
        body: makeMinorCreateBody({ email: "doctor@example.com" }),
      }),
      assertReservedError
    );
    assert.deepEqual(userCalls, [{ email: "doctor@example.com", role: "doctor" }]);
  } finally {
    restoreMethods();
  }
});

test("minor update rejects adding a doctor-owned patient email", async () => {
  restoreMethods();
  guardWrites();
  const current = makeMinorPatient();
  const userCalls = mockUserDirectory([
    { _id: "doctor-user-id", email: "doctor@example.com", role: "doctor" },
  ]);

  Patient.findOne = (query) => {
    if (query._id === current._id) return queryResult(current);
    if (query.email === "parent@example.com") return queryResult(approvedParent);
    return queryResult(null);
  };

  try {
    await assert.rejects(
      updatePatientService({
        user: { _id: "doctor-id" },
        patientId: current._id,
        body: { email: "Doctor@Example.COM" },
      }),
      assertReservedError
    );
    assert.deepEqual(userCalls, [{ email: "doctor@example.com", role: "doctor" }]);
  } finally {
    restoreMethods();
  }
});

test("adult update rejects introducing a doctor-owned email", async () => {
  restoreMethods();
  guardWrites();
  const current = makeAdultPatient({ email: undefined });
  const userCalls = mockUserDirectory([
    { _id: "doctor-user-id", email: "doctor@example.com", role: "doctor" },
  ]);

  Patient.findOne = (query) => {
    if (query._id === current._id) return queryResult(current);
    return queryResult(null);
  };

  try {
    await assert.rejects(
      updatePatientService({
        user: { _id: "doctor-id" },
        patientId: current._id,
        body: { email: "doctor@example.com" },
      }),
      assertReservedError
    );
    assert.deepEqual(userCalls, [{ email: "doctor@example.com", role: "doctor" }]);
  } finally {
    restoreMethods();
  }
});

test("minor-to-adult transition rejects the persisted effective doctor email", async () => {
  restoreMethods();
  guardWrites();
  const current = makeMinorPatient({ email: "doctor@example.com" });
  const userCalls = mockUserDirectory([
    { _id: "doctor-user-id", email: "doctor@example.com", role: "doctor" },
  ]);

  Patient.findOne = (query) => {
    if (query._id === current._id) return queryResult(current);
    if (query.email === "parent@example.com") return queryResult(approvedParent);
    return queryResult(null);
  };

  try {
    await assert.rejects(
      updatePatientService({
        user: { _id: "doctor-id" },
        patientId: current._id,
        body: { birthDate: "1990-01-01" },
      }),
      assertReservedError
    );
    assert.deepEqual(userCalls, [{ email: "doctor@example.com", role: "doctor" }]);
  } finally {
    restoreMethods();
  }
});

test("patient-role User email remains allowed for adult patient creation", async () => {
  const { result, createCalls, userCalls } = await runAllowedAdultCreate({
    email: "Patient.User@Example.COM",
    users: [
      { _id: "patient-user-id", email: "patient.user@example.com", role: "patient" },
    ],
  });

  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].email, "patient.user@example.com");
  assert.equal(result.email, "patient.user@example.com");
  assert.deepEqual(userCalls, [
    { email: "patient.user@example.com", role: "doctor" },
  ]);
});

test("email with no registered User remains allowed for adult patient creation", async () => {
  const { result, createCalls, userCalls } = await runAllowedAdultCreate({
    email: "ordinary@example.com",
    users: [],
  });

  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].email, "ordinary@example.com");
  assert.equal(result.email, "ordinary@example.com");
  assert.deepEqual(userCalls, [{ email: "ordinary@example.com", role: "doctor" }]);
});

test("doctor-email lookup is normalized and case-insensitive", async () => {
  restoreMethods();
  guardWrites();
  const userCalls = mockAdultCreateDependencies([
    { _id: "doctor-user-id", email: "mixed.case@example.com", role: "doctor" },
  ]);

  try {
    await assert.rejects(
      createPatientService({
        user: { _id: "doctor-id" },
        body: makeAdultCreateBody({ email: "Mixed.Case@Example.COM" }),
      }),
      assertReservedError
    );
    assert.deepEqual(userCalls, [
      { email: "mixed.case@example.com", role: "doctor" },
    ]);
  } finally {
    restoreMethods();
  }
});
