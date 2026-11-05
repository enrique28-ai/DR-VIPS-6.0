import assert from "node:assert/strict";
import { after, test } from "node:test";

import mongoose from "mongoose";

import Patient from "../../../models/Patient.js";
import PatientAccessRequest from "../../../models/PatientAccessRequest.js";
import { importPatient } from "../../patientController.js";
import {
  approvePatientAccessRequestService,
  createPatientAccessRequestService,
  listDecidablePatientAccessRequestsService,
  listDoctorPatientAccessRequestsService,
  rejectPatientAccessRequestService,
} from "../../../services/patients/patientAccessRequestService.js";

const DOCTOR_A_ID = "64b000000000000000000001";
const DOCTOR_B_ID = "64b000000000000000000002";
const ADULT_PATIENT_ID = "64b000000000000000000003";
const CHILD_PATIENT_ID = "64b000000000000000000004";
const SIBLING_PATIENT_ID = "64b000000000000000000005";
const REQUEST_ID = "64b000000000000000000006";
const PATIENT_USER_ID = "64b000000000000000000007";
const OTHER_REQUEST_ID = "64b000000000000000000008";
const TEST_SESSION = Object.freeze({ id: "patient-access-request-test-session" });

const originalPatientMethods = {
  find: Patient.find,
  findById: Patient.findById,
  findByIdAndUpdate: Patient.findByIdAndUpdate,
  findOneAndUpdate: Patient.findOneAndUpdate,
  updateMany: Patient.updateMany,
  updateOne: Patient.updateOne,
};

const originalAccessRequestMethods = {
  find: PatientAccessRequest.find,
  findById: PatientAccessRequest.findById,
  findOne: PatientAccessRequest.findOne,
  findOneAndUpdate: PatientAccessRequest.findOneAndUpdate,
};

const originalTransaction = mongoose.connection.transaction;

after(() => {
  restoreModelMethods();
  mongoose.connection.transaction = originalTransaction;
});

function restoreModelMethods() {
  Patient.find = originalPatientMethods.find;
  Patient.findById = originalPatientMethods.findById;
  Patient.findByIdAndUpdate = originalPatientMethods.findByIdAndUpdate;
  Patient.findOneAndUpdate = originalPatientMethods.findOneAndUpdate;
  Patient.updateMany = originalPatientMethods.updateMany;
  Patient.updateOne = originalPatientMethods.updateOne;
  PatientAccessRequest.find = originalAccessRequestMethods.find;
  PatientAccessRequest.findById = originalAccessRequestMethods.findById;
  PatientAccessRequest.findOne = originalAccessRequestMethods.findOne;
  PatientAccessRequest.findOneAndUpdate = originalAccessRequestMethods.findOneAndUpdate;
  mongoose.connection.transaction = originalTransaction;
}

function makeDoctor(overrides = {}) {
  return {
    _id: DOCTOR_A_ID,
    role: "doctor",
    name: "Dr. Requester",
    email: "doctor-a@example.com",
    ...overrides,
  };
}

function makePatientUser(overrides = {}) {
  return {
    _id: PATIENT_USER_ID,
    role: "patient",
    email: "Patient@Example.com ",
    ...overrides,
  };
}

function makeAdultPatient(overrides = {}) {
  return {
    _id: ADULT_PATIENT_ID,
    fullname: "Adult Patient",
    email: "patient@example.com",
    birthDate: new Date("1990-01-01T12:00:00.000Z"),
    age: 36,
    createdBy: DOCTOR_B_ID,
    owners: [DOCTOR_B_ID],
    ...overrides,
  };
}

function makeChildPatient(overrides = {}) {
  return {
    _id: CHILD_PATIENT_ID,
    fullname: "Minor Patient",
    parentEmail: "parent@example.com",
    birthDate: new Date("2015-01-01T12:00:00.000Z"),
    age: 11,
    createdBy: DOCTOR_B_ID,
    owners: [DOCTOR_B_ID],
    ...overrides,
  };
}

function makeAccessRequest(overrides = {}) {
  return {
    _id: REQUEST_ID,
    patient: ADULT_PATIENT_ID,
    doctor: DOCTOR_A_ID,
    status: "pending",
    decidedBy: null,
    decidedAt: null,
    createdAt: new Date("2026-08-01T12:00:00.000Z"),
    updatedAt: new Date("2026-08-01T12:00:00.000Z"),
    ...overrides,
  };
}

function makeQueryResult(value, call) {
  const query = {
    select(projection) {
      call.select = projection;
      return query;
    },
    sort(sort) {
      call.sort = sort;
      return query;
    },
    limit(limit) {
      call.limit = limit;
      return query;
    },
    populate(path, select) {
      call.populate = { path, select };
      return query;
    },
    session(session) {
      call.session = session;
      return query;
    },
    async lean(options) {
      call.leanOptions = options;
      return value;
    },
  };

  return query;
}

function mockPatientFindByIdSequence(values) {
  const calls = [];
  Patient.findById = (id) => {
    const value = values[Math.min(calls.length, values.length - 1)];
    const call = { id };
    calls.push(call);
    return makeQueryResult(value, call);
  };
  return calls;
}

function mockPatientFind(value) {
  const calls = [];
  Patient.find = (query) => {
    const call = { query };
    calls.push(call);
    return makeQueryResult(value, call);
  };
  return calls;
}

function mockAccessRequestFind(value) {
  const calls = [];
  PatientAccessRequest.find = (query) => {
    const call = { query };
    calls.push(call);
    return makeQueryResult(value, call);
  };
  return calls;
}

function mockAccessRequestFindById(value) {
  const calls = [];
  PatientAccessRequest.findById = (id) => {
    const call = { id };
    calls.push(call);
    return makeQueryResult(value, call);
  };
  return calls;
}

function mockAccessRequestFindOne(value) {
  const calls = [];
  PatientAccessRequest.findOne = (query) => {
    const call = { query };
    calls.push(call);
    return makeQueryResult(value, call);
  };
  return calls;
}

function mockAccessRequestFindOneAndUpdate(values) {
  const responses = Array.isArray(values) ? values : [values];
  const calls = [];
  PatientAccessRequest.findOneAndUpdate = (query, updateDoc, options) => {
    const value = responses[Math.min(calls.length, responses.length - 1)];
    const call = { query, updateDoc, options };
    calls.push(call);
    return makeQueryResult(value, call);
  };
  return calls;
}

function guardPatientOwnershipWrites() {
  Patient.findByIdAndUpdate = async () => {
    throw new Error("Patient.findByIdAndUpdate must not grant access");
  };
  Patient.findOneAndUpdate = async () => {
    throw new Error("Patient.findOneAndUpdate must not grant access");
  };
  Patient.updateMany = async () => {
    throw new Error("Patient.updateMany must not grant access or cascade");
  };
  Patient.updateOne = async () => {
    throw new Error("Patient.updateOne must not run in this path");
  };
}

function mockPatientUpdateOne(result = { acknowledged: true, matchedCount: 1, modifiedCount: 1 }) {
  const calls = [];
  Patient.updateOne = async (query, updateDoc, options) => {
    calls.push({ query, updateDoc, options });
    return result;
  };
  Patient.updateMany = async () => {
    throw new Error("Patient.updateMany must not cascade access");
  };
  Patient.findByIdAndUpdate = async () => {
    throw new Error("Patient.findByIdAndUpdate must not grant access");
  };
  Patient.findOneAndUpdate = async () => {
    throw new Error("Patient.findOneAndUpdate must not grant access");
  };
  return calls;
}

function mockTransaction() {
  const state = { calls: 0, commits: 0, aborts: 0, session: TEST_SESSION };
  mongoose.connection.transaction = async (callback) => {
    state.calls += 1;
    try {
      const result = await callback(TEST_SESSION);
      state.commits += 1;
      return result;
    } catch (err) {
      state.aborts += 1;
      throw err;
    }
  };
  return state;
}

function assertAccessError(err, status, errorCode) {
  assert.equal(err.status, status);
  assert.equal(err.errorCode, errorCode);
  return true;
}

function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("PatientAccessRequest model enforces one pending request per patient and doctor", () => {
  const pendingUniqueIndex = PatientAccessRequest.schema.indexes().find(
    ([fields, options]) =>
      fields.patient === 1 &&
      fields.doctor === 1 &&
      options.unique === true &&
      options.partialFilterExpression?.status === "pending"
  );

  assert.ok(pendingUniqueIndex);
  assert.deepEqual(
    PatientAccessRequest.schema.path("status").enumValues,
    ["pending", "approved", "rejected"]
  );
});

const identification = { mode: "adult", fullname: "Adult Patient", email: "patient@example.com" };
const accepted = { message: "If a matching patient is found, the access request will be available for the patient or authorized guardian to review." };

test("exact adult identification creates only a pending request and returns no match confirmation", async () => {
  restoreModelMethods();
  const findCalls = mockPatientFind([makeAdultPatient()]);
  const upsertCalls = mockAccessRequestFindOneAndUpdate(makeAccessRequest());
  guardPatientOwnershipWrites();
  try {
    const result = await createPatientAccessRequestService({
      user: makeDoctor(),
      body: { ...identification, fullname: "  ADULT   Patient ", email: " Patient@Example.com " },
    });
    assert.deepEqual(result, accepted);
    assert.equal(findCalls[0].query.email, identification.email);
    assert.deepEqual(findCalls[0].query, { email: identification.email });
    assert.deepEqual(upsertCalls[0].query, { patient: ADULT_PATIENT_ID, doctor: DOCTOR_A_ID, status: "pending" });
    assert.deepEqual(upsertCalls[0].options, {
      new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true, timestamps: false,
    });
    assert.equal(upsertCalls[0].updateDoc.$set, undefined);
  } finally { restoreModelMethods(); }
});

test("repeated identification reuses the pending pair with the same neutral response", async () => {
  restoreModelMethods();
  mockPatientFind([makeAdultPatient()]);
  const calls = mockAccessRequestFindOneAndUpdate(makeAccessRequest());
  guardPatientOwnershipWrites();
  try {
    assert.deepEqual(await createPatientAccessRequestService({ user: makeDoctor(), body: identification }), accepted);
    assert.deepEqual(await createPatientAccessRequestService({ user: makeDoctor(), body: identification }), accepted);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].query, calls[1].query);
    assert.equal(calls[1].updateDoc.$set, undefined);
  } finally { restoreModelMethods(); }
});

test("a duplicate pending upsert race reuses the existing pair without disclosure", async () => {
  restoreModelMethods();
  mockPatientFind([makeAdultPatient()]);
  const duplicate = Object.assign(new Error("duplicate pending request"), { code: 11000 });
  PatientAccessRequest.findOneAndUpdate = () => ({ lean: async () => { throw duplicate; } });
  const calls = mockAccessRequestFindOne(makeAccessRequest());
  guardPatientOwnershipWrites();
  try {
    assert.deepEqual(await createPatientAccessRequestService({ user: makeDoctor(), body: identification }), accepted);
    assert.equal(calls.length, 0);
  } finally { restoreModelMethods(); }
});

test("a pending upsert race remains neutral after the other request was consumed without a fallback lookup", async () => {
  restoreModelMethods();
  mockPatientFind([makeAdultPatient()]);
  const duplicate = Object.assign(new Error("pending pair consumed concurrently"), { code: 11000 });
  PatientAccessRequest.findOneAndUpdate = () => ({ lean: async () => { throw duplicate; } });
  const fallbackCalls = mockAccessRequestFindOne(null);
  guardPatientOwnershipWrites();
  try {
    assert.deepEqual(await createPatientAccessRequestService({ user: makeDoctor(), body: identification }), accepted);
    assert.equal(fallbackCalls.length, 0);
  } finally { restoreModelMethods(); }
});

for (const [description, candidates] of [
  ["missing", []],
  ["owner", [makeAdultPatient({ owners: [DOCTOR_A_ID] })]],
  ["creator", [makeAdultPatient({ createdBy: DOCTOR_A_ID })]],
  ["duplicate", [makeAdultPatient(), makeAdultPatient({ _id: SIBLING_PATIENT_ID })]],
  ["owned and unowned duplicate", [makeAdultPatient({ owners: [DOCTOR_A_ID] }), makeAdultPatient({ _id: SIBLING_PATIENT_ID })]],
  ["unknown age", [makeAdultPatient({ birthDate: "invalid" })]],
  ["name mismatch", [makeAdultPatient({ fullname: "Different Patient" })]],
  ["array name", [makeAdultPatient({ fullname: ["Adult Patient"] })]],
  ["array email", [makeAdultPatient({ email: ["patient@example.com"] })]],
  ["object email", [makeAdultPatient({ email: { value: "patient@example.com" } })]],
]) {
  test(`identification is neutral without request writes for ${description}`, async () => {
    restoreModelMethods();
    mockPatientFind(candidates);
    PatientAccessRequest.findOneAndUpdate = () => { throw new Error("No request should be written"); };
    guardPatientOwnershipWrites();
    try {
      assert.deepEqual(await createPatientAccessRequestService({ user: makeDoctor(), body: identification }), accepted);
    } finally { restoreModelMethods(); }
  });
}

for (const [description, patient, body, creates] of [
  ["current guardian", makeChildPatient(), { mode: "minor", fullname: "Minor Patient", email: "parent@example.com" }, true],
  ["stale guardian adult", makeChildPatient({ birthDate: new Date("2000-01-01") }), { mode: "minor", fullname: "Minor Patient", email: "parent@example.com" }, false],
  ["deceased minor", makeChildPatient({ isDeceased: true }), { mode: "minor", fullname: "Minor Patient", email: "parent@example.com" }, false],
  ["wrong guardian", makeChildPatient(), { mode: "minor", fullname: "Minor Patient", email: "other@example.com" }, false],
  ["malformed guardian contact", makeChildPatient({ parentEmail: ["parent@example.com"] }), { mode: "minor", fullname: "Minor Patient", email: "parent@example.com" }, false],
  ["minor using own email", makeChildPatient({ email: "minor@example.com" }), { mode: "adult", fullname: "Minor Patient", email: "minor@example.com" }, false],
  ["deceased adult self", makeAdultPatient({ isDeceased: true }), identification, true],
]) {
  test(`exact identification preserves eligibility for ${description}`, async () => {
    restoreModelMethods();
    mockPatientFind([patient]);
    const calls = mockAccessRequestFindOneAndUpdate(makeAccessRequest());
    guardPatientOwnershipWrites();
    try {
      assert.deepEqual(await createPatientAccessRequestService({ user: makeDoctor(), body }), accepted);
      assert.equal(calls.length, creates ? 1 : 0);
      if (creates) assert.equal(calls[0].query.patient, patient._id);
    } finally { restoreModelMethods(); }
  });
}

test("identification rejects invalid fields and non-doctors before patient lookup", async () => {
  restoreModelMethods();
  Patient.find = () => { throw new Error("No lookup for invalid identification"); };
  try {
    await assert.rejects(() => createPatientAccessRequestService({ user: makeDoctor(), body: {} }),
      (err) => assertAccessError(err, 400, "INVALID_PATIENT_IDENTIFICATION"));
    await assert.rejects(() => createPatientAccessRequestService({ user: makePatientUser(), body: identification }),
      (err) => assertAccessError(err, 403, "INSUFFICIENT_ROLE"));
  } finally { restoreModelMethods(); }
});

test("all email candidates use the same Unicode name key before deciding uniqueness", async () => {
  restoreModelMethods();
  mockPatientFind([
    makeChildPatient({ fullname: "Other One" }),
    makeChildPatient({ fullname: "Other Two" }),
    makeChildPatient({ fullname: "İpek D'Ávila" }),
  ]);
  const calls = mockAccessRequestFindOneAndUpdate(makeAccessRequest());
  guardPatientOwnershipWrites();
  try {
    assert.deepEqual(await createPatientAccessRequestService({
      user: makeDoctor(), body: { mode: "minor", fullname: " i\u0307pek  d'ávila ", email: "parent@example.com" },
    }), accepted);
    assert.equal(calls.length, 1);
    // Normalization preserves accents and punctuation; it is not fuzzy matching.
    assert.deepEqual(await createPatientAccessRequestService({
      user: makeDoctor(), body: { mode: "minor", fullname: "ipek d'avila", email: "parent@example.com" },
    }), accepted);
    assert.equal(calls.length, 1);
  } finally { restoreModelMethods(); }
});

test("duplicate full names after other email candidates are never chosen by an early result cap", async () => {
  restoreModelMethods();
  mockPatientFind([
    makeChildPatient({ fullname: "Other One" }),
    makeChildPatient({ fullname: "Other Two" }),
    makeChildPatient(),
    makeChildPatient({ _id: SIBLING_PATIENT_ID, birthDate: "invalid" }),
  ]);
  const calls = mockAccessRequestFindOneAndUpdate(makeAccessRequest());
  try {
    assert.deepEqual(await createPatientAccessRequestService({
      user: makeDoctor(), body: { mode: "minor", fullname: "Minor Patient", email: "parent@example.com" },
    }), accepted);
    assert.equal(calls.length, 0);
  } finally { restoreModelMethods(); }
});

test("legacy import ignores all supplied IDs and requires the same exact identity body", async () => {
  restoreModelMethods();
  mockPatientFind([makeAdultPatient()]);
  const calls = mockAccessRequestFindOneAndUpdate(makeAccessRequest());
  guardPatientOwnershipWrites();
  const res = makeRes();
  try {
    await importPatient({
      user: makeDoctor(), params: { id: "unrelated-id" },
      body: { ...identification, doctorId: DOCTOR_B_ID, patientId: CHILD_PATIENT_ID, owners: [DOCTOR_A_ID] },
    }, res);
    assert.equal(res.statusCode, 202);
    assert.deepEqual(res.body, accepted);
    assert.equal(calls[0].query.patient, ADULT_PATIENT_ID);
    assert.equal(calls[0].query.doctor, DOCTOR_A_ID);
  } finally { restoreModelMethods(); }
});

test("doctor request history returns only approved records with current ownership", async () => {
  restoreModelMethods();
  const patient = makeAdultPatient({ owners: [DOCTOR_A_ID] });
  const calls = mockAccessRequestFind([
    makeAccessRequest({ status: "pending", patient }),
    makeAccessRequest({ status: "rejected", patient }),
    makeAccessRequest({ status: "approved", patient: makeAdultPatient() }),
    makeAccessRequest({ status: "approved", patient: null }),
    makeAccessRequest({ status: "approved", patient }),
  ]);
  try {
    const result = await listDoctorPatientAccessRequestsService({ user: makeDoctor() });
    assert.deepEqual(calls[0].query, { doctor: DOCTOR_A_ID, status: "approved" });
    assert.deepEqual(calls[0].populate, { path: "patient", select: "fullname createdBy owners" });
    assert.equal(result.accessRequests.length, 1);
    assert.deepEqual(result.accessRequests[0].patient, { _id: ADULT_PATIENT_ID, fullname: "Adult Patient" });
    assert.equal(Object.hasOwn(result.accessRequests[0], "decidedBy"), false);
    assert.equal(Object.hasOwn(result.accessRequests[0], "doctor"), false);
  } finally { restoreModelMethods(); }
});

test("listDecidablePatientAccessRequestsService returns only the adult and current-guardian targets", async () => {
  restoreModelMethods();
  const adult = makeAdultPatient({ email: "parent@example.com" });
  const child = makeChildPatient();
  const formerMinorNowAdult = makeChildPatient({
    _id: SIBLING_PATIENT_ID,
    fullname: "Now Adult",
    birthDate: new Date("2000-01-01T12:00:00.000Z"),
    age: 17,
  });
  const deceasedChild = makeChildPatient({
    _id: new mongoose.Types.ObjectId(),
    fullname: "Deceased Minor",
    birthDate: new Date("2010-01-01T12:00:00.000Z"),
    dateOfDeath: new Date("2020-01-01T12:00:00.000Z"),
    isDeceased: true,
    age: 10,
  });
  const patientFindCalls = mockPatientFind([
    adult,
    child,
    formerMinorNowAdult,
    deceasedChild,
  ]);
  const requestFindCalls = mockAccessRequestFind([
    makeAccessRequest({
      patient: ADULT_PATIENT_ID,
      doctor: { _id: DOCTOR_A_ID, name: "Dr. A", email: "doctor-a@example.com" },
    }),
    makeAccessRequest({
      _id: OTHER_REQUEST_ID,
      patient: CHILD_PATIENT_ID,
      doctor: { _id: DOCTOR_B_ID, name: "Dr. B", email: "doctor-b@example.com" },
    }),
  ]);

  try {
    const result = await listDecidablePatientAccessRequestsService({
      user: makePatientUser({ email: "parent@example.com" }),
    });

    assert.deepEqual(patientFindCalls, [
      {
        query: {
          $or: [{ email: "parent@example.com" }, { parentEmail: "parent@example.com" }],
        },
        select: "_id fullname email parentEmail birthDate age dateOfDeath isDeceased",
        leanOptions: undefined,
      },
    ]);
    assert.deepEqual(requestFindCalls[0].query, {
      patient: { $in: [ADULT_PATIENT_ID, CHILD_PATIENT_ID] },
      status: "pending",
    });
    assert.deepEqual(requestFindCalls[0].sort, { createdAt: -1 });
    assert.deepEqual(requestFindCalls[0].populate, { path: "doctor", select: "name email" });
    assert.equal(result.accessRequests.length, 2);
    assert.deepEqual(result.accessRequests[0].patient, {
      _id: ADULT_PATIENT_ID,
      fullname: "Adult Patient",
    });
    assert.deepEqual(result.accessRequests[1].patient, {
      _id: CHILD_PATIENT_ID,
      fullname: "Minor Patient",
    });
  } finally {
    restoreModelMethods();
  }
});

test("listDecidablePatientAccessRequestsService scopes adult requests by the authenticated email", async () => {
  restoreModelMethods();
  const patientFindCalls = mockPatientFind([makeAdultPatient()]);
  const requestFindCalls = mockAccessRequestFind([makeAccessRequest()]);

  try {
    const result = await listDecidablePatientAccessRequestsService({
      user: makePatientUser(),
    });

    assert.deepEqual(patientFindCalls[0].query, {
      $or: [{ email: "patient@example.com" }, { parentEmail: "patient@example.com" }],
    });
    assert.deepEqual(requestFindCalls[0].query, {
      patient: { $in: [ADULT_PATIENT_ID] },
      status: "pending",
    });
    assert.equal(result.accessRequests.length, 1);
    assert.equal(result.accessRequests[0].patient._id, ADULT_PATIENT_ID);
  } finally {
    restoreModelMethods();
  }
});

test("listDecidablePatientAccessRequestsService does not query requests for a wrong guardian", async () => {
  restoreModelMethods();
  const patientFindCalls = mockPatientFind([]);
  PatientAccessRequest.find = async () => {
    throw new Error("Wrong guardian must not be able to enumerate requests");
  };

  try {
    const result = await listDecidablePatientAccessRequestsService({
      user: makePatientUser({ email: "wrong-guardian@example.com" }),
    });

    assert.deepEqual(result, { accessRequests: [] });
    assert.deepEqual(patientFindCalls[0].query, {
      $or: [
        { email: "wrong-guardian@example.com" },
        { parentEmail: "wrong-guardian@example.com" },
      ],
    });
  } finally {
    restoreModelMethods();
  }
});

test("approvePatientAccessRequestService grants only the explicit adult patient in one transaction", async () => {
  restoreModelMethods();
  const transaction = mockTransaction();
  const pending = makeAccessRequest();
  const decided = makeAccessRequest({
    status: "approved",
    decidedBy: PATIENT_USER_ID,
    decidedAt: new Date("2026-08-02T12:00:00.000Z"),
  });
  const requestFindCalls = mockAccessRequestFindById(pending);
  const patientFindCalls = mockPatientFindByIdSequence([makeAdultPatient()]);
  const decisionCalls = mockAccessRequestFindOneAndUpdate(decided);
  const grantCalls = mockPatientUpdateOne();

  try {
    const result = await approvePatientAccessRequestService({
      user: makePatientUser(),
      requestId: REQUEST_ID,
    });

    assert.equal(result.accessRequest.status, "approved");
    assert.equal(transaction.calls, 1);
    assert.equal(transaction.commits, 1);
    assert.equal(transaction.aborts, 0);
    assert.deepEqual(requestFindCalls, [
      { id: REQUEST_ID, session: TEST_SESSION, leanOptions: undefined },
    ]);
    assert.equal(patientFindCalls[0].session, TEST_SESSION);
    assert.deepEqual(decisionCalls[0].query, { _id: REQUEST_ID, status: "pending" });
    assert.equal(decisionCalls[0].updateDoc.$set.status, "approved");
    assert.equal(decisionCalls[0].updateDoc.$set.decidedBy, PATIENT_USER_ID);
    assert.equal(decisionCalls[0].options.session, TEST_SESSION);
    assert.deepEqual(grantCalls, [
      {
        query: { _id: ADULT_PATIENT_ID, email: "patient@example.com" },
        updateDoc: { $addToSet: { owners: DOCTOR_A_ID } },
        options: { session: TEST_SESSION, timestamps: false },
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("approvePatientAccessRequestService grants only the explicit child with no parent or sibling cascade", async () => {
  restoreModelMethods();
  const transaction = mockTransaction();
  const pending = makeAccessRequest({ patient: CHILD_PATIENT_ID });
  const decided = makeAccessRequest({ patient: CHILD_PATIENT_ID, status: "approved" });
  mockAccessRequestFindById(pending);
  mockPatientFindByIdSequence([makeChildPatient()]);
  mockAccessRequestFindOneAndUpdate(decided);
  const grantCalls = mockPatientUpdateOne();

  try {
    const result = await approvePatientAccessRequestService({
      user: makePatientUser({ email: "Parent@Example.com" }),
      requestId: REQUEST_ID,
    });

    assert.equal(result.accessRequest.status, "approved");
    assert.equal(transaction.commits, 1);
    assert.deepEqual(grantCalls, [
      {
        query: { _id: CHILD_PATIENT_ID, parentEmail: "parent@example.com" },
        updateDoc: { $addToSet: { owners: DOCTOR_A_ID } },
        options: { session: TEST_SESSION, timestamps: false },
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("rejectPatientAccessRequestService records the decision without granting ownership", async () => {
  restoreModelMethods();
  const transaction = mockTransaction();
  const pending = makeAccessRequest();
  const rejected = makeAccessRequest({
    status: "rejected",
    decidedBy: PATIENT_USER_ID,
    decidedAt: new Date("2026-08-02T12:00:00.000Z"),
  });
  mockAccessRequestFindById(pending);
  mockPatientFindByIdSequence([makeAdultPatient()]);
  const decisionCalls = mockAccessRequestFindOneAndUpdate(rejected);
  guardPatientOwnershipWrites();

  try {
    const result = await rejectPatientAccessRequestService({
      user: makePatientUser(),
      requestId: REQUEST_ID,
    });

    assert.equal(result.accessRequest.status, "rejected");
    assert.equal(result.accessRequest.decidedBy, PATIENT_USER_ID);
    assert.equal(transaction.commits, 1);
    assert.equal(decisionCalls[0].updateDoc.$set.status, "rejected");
    assert.equal(decisionCalls[0].options.session, TEST_SESSION);
  } finally {
    restoreModelMethods();
  }
});

test("current guardian can reject the explicit child without changing any patient owners", async () => {
  restoreModelMethods();
  const transaction = mockTransaction();
  const pending = makeAccessRequest({ patient: CHILD_PATIENT_ID });
  const rejected = makeAccessRequest({
    patient: CHILD_PATIENT_ID,
    status: "rejected",
    decidedBy: PATIENT_USER_ID,
  });
  mockAccessRequestFindById(pending);
  mockPatientFindByIdSequence([makeChildPatient()]);
  const decisionCalls = mockAccessRequestFindOneAndUpdate(rejected);
  guardPatientOwnershipWrites();

  try {
    const result = await rejectPatientAccessRequestService({
      user: makePatientUser({ email: "parent@example.com" }),
      requestId: REQUEST_ID,
    });

    assert.equal(result.accessRequest.status, "rejected");
    assert.equal(result.accessRequest.patient._id, CHILD_PATIENT_ID);
    assert.equal(transaction.commits, 1);
    assert.equal(transaction.aborts, 0);
    assert.equal(decisionCalls[0].updateDoc.$set.status, "rejected");
  } finally {
    restoreModelMethods();
  }
});

test("changed guardian cannot reject a child access request", async () => {
  restoreModelMethods();
  const transaction = mockTransaction();
  mockAccessRequestFindById(makeAccessRequest({ patient: CHILD_PATIENT_ID }));
  mockPatientFindByIdSequence([
    makeChildPatient({ parentEmail: "new-guardian@example.com" }),
  ]);
  PatientAccessRequest.findOneAndUpdate = async () => {
    throw new Error("Changed guardian must not reject the request");
  };
  guardPatientOwnershipWrites();

  try {
    await assert.rejects(
      () =>
        rejectPatientAccessRequestService({
          user: makePatientUser({ email: "old-guardian@example.com" }),
          requestId: REQUEST_ID,
        }),
      (err) => assertAccessError(err, 404, "ACCESS_REQUEST_NOT_FOUND")
    );
    assert.equal(transaction.commits, 0);
    assert.equal(transaction.aborts, 1);
  } finally {
    restoreModelMethods();
  }
});

for (const [description, patient, user] of [
  [
    "a changed guardian",
    makeChildPatient({ parentEmail: "new-guardian@example.com" }),
    makePatientUser({ email: "old-guardian@example.com" }),
  ],
  [
    "a minor who has become an adult",
    makeChildPatient({
      email: "adult-child@example.com",
      parentEmail: "parent@example.com",
      birthDate: new Date("2000-01-01T12:00:00.000Z"),
      age: 17,
    }),
    makePatientUser({ email: "parent@example.com" }),
  ],
  [
    "an unrelated adult patient",
    makeAdultPatient({ email: "other-patient@example.com" }),
    makePatientUser(),
  ],
]) {
  test(`decision returns IDOR-safe 404 for ${description}`, async () => {
    restoreModelMethods();
    const transaction = mockTransaction();
    mockAccessRequestFindById(makeAccessRequest({ patient: patient._id }));
    mockPatientFindByIdSequence([patient]);
    PatientAccessRequest.findOneAndUpdate = async () => {
      throw new Error("Unauthorized actor must not decide the request");
    };
    guardPatientOwnershipWrites();

    try {
      await assert.rejects(
        () =>
          approvePatientAccessRequestService({
            user,
            requestId: REQUEST_ID,
          }),
        (err) => assertAccessError(err, 404, "ACCESS_REQUEST_NOT_FOUND")
      );
      assert.equal(transaction.commits, 0);
      assert.equal(transaction.aborts, 1);
    } finally {
      restoreModelMethods();
    }
  });
}

for (const [decisionName, decide] of [
  ["approve", approvePatientAccessRequestService],
  ["reject", rejectPatientAccessRequestService],
]) {
  test(`${decisionName} denies a guardian decision for a deceased former minor`, async () => {
    restoreModelMethods();
    const transaction = mockTransaction();
    const deceasedChild = makeChildPatient({
      birthDate: new Date("2010-01-01T12:00:00.000Z"),
      dateOfDeath: new Date("2020-01-01T12:00:00.000Z"),
      isDeceased: true,
      age: 10,
    });
    mockAccessRequestFindById(makeAccessRequest({ patient: deceasedChild._id }));
    mockPatientFindByIdSequence([deceasedChild]);
    PatientAccessRequest.findOneAndUpdate = async () => {
      throw new Error("A deceased patient's former guardian must not decide the request");
    };
    guardPatientOwnershipWrites();

    try {
      await assert.rejects(
        () =>
          decide({
            user: makePatientUser({ email: deceasedChild.parentEmail }),
            requestId: REQUEST_ID,
          }),
        (err) => assertAccessError(err, 404, "ACCESS_REQUEST_NOT_FOUND")
      );
      assert.equal(transaction.commits, 0);
      assert.equal(transaction.aborts, 1);
    } finally {
      restoreModelMethods();
    }
  });
}

for (const [decisionName, decide] of [
  ["approve", approvePatientAccessRequestService],
  ["reject", rejectPatientAccessRequestService],
]) {
  for (const previousStatus of ["approved", "rejected"]) {
    test(`${decisionName} rejects a request already ${previousStatus} without a terminal or cross-state change`, async () => {
      restoreModelMethods();
      const transaction = mockTransaction();
      mockAccessRequestFindById(makeAccessRequest({ status: previousStatus }));
      mockPatientFindByIdSequence([makeAdultPatient()]);
      PatientAccessRequest.findOneAndUpdate = async () => {
        throw new Error("A terminal request must not be changed");
      };
      guardPatientOwnershipWrites();

      try {
        await assert.rejects(
          () =>
            decide({
              user: makePatientUser(),
              requestId: REQUEST_ID,
            }),
          (err) => assertAccessError(err, 409, "ACCESS_REQUEST_NOT_PENDING")
        );
        assert.equal(transaction.commits, 0);
        assert.equal(transaction.aborts, 1);
      } finally {
        restoreModelMethods();
      }
    });
  }
}

test("decision is single-use when another transaction consumes the pending request", async () => {
  restoreModelMethods();
  const transaction = mockTransaction();
  mockAccessRequestFindById(makeAccessRequest());
  mockPatientFindByIdSequence([makeAdultPatient()]);
  const decisionCalls = mockAccessRequestFindOneAndUpdate(null);
  guardPatientOwnershipWrites();

  try {
    await assert.rejects(
      () =>
        approvePatientAccessRequestService({
          user: makePatientUser(),
          requestId: REQUEST_ID,
        }),
      (err) => assertAccessError(err, 409, "ACCESS_REQUEST_NOT_PENDING")
    );
    assert.deepEqual(decisionCalls[0].query, { _id: REQUEST_ID, status: "pending" });
    assert.equal(transaction.commits, 0);
    assert.equal(transaction.aborts, 1);
  } finally {
    restoreModelMethods();
  }
});

test("approval aborts the transaction if the current identity filter no longer matches", async () => {
  restoreModelMethods();
  const transaction = mockTransaction();
  mockAccessRequestFindById(makeAccessRequest());
  mockPatientFindByIdSequence([makeAdultPatient()]);
  mockAccessRequestFindOneAndUpdate(makeAccessRequest({ status: "approved" }));
  const grantCalls = mockPatientUpdateOne({
    acknowledged: true,
    matchedCount: 0,
    modifiedCount: 0,
  });

  try {
    await assert.rejects(
      () =>
        approvePatientAccessRequestService({
          user: makePatientUser(),
          requestId: REQUEST_ID,
        }),
      (err) => assertAccessError(err, 404, "ACCESS_REQUEST_NOT_FOUND")
    );
    assert.equal(grantCalls.length, 1);
    assert.equal(transaction.commits, 0);
    assert.equal(transaction.aborts, 1);
  } finally {
    restoreModelMethods();
  }
});

test("decision returns stable not-found errors for missing request and missing patient", async () => {
  restoreModelMethods();
  let transaction = mockTransaction();
  mockAccessRequestFindById(null);
  Patient.findById = async () => {
    throw new Error("Patient lookup must not run when request is missing");
  };

  try {
    await assert.rejects(
      () =>
        approvePatientAccessRequestService({
          user: makePatientUser(),
          requestId: REQUEST_ID,
        }),
      (err) => assertAccessError(err, 404, "ACCESS_REQUEST_NOT_FOUND")
    );
    assert.equal(transaction.aborts, 1);

    restoreModelMethods();
    transaction = mockTransaction();
    mockAccessRequestFindById(makeAccessRequest());
    mockPatientFindByIdSequence([null]);

    await assert.rejects(
      () =>
        approvePatientAccessRequestService({
          user: makePatientUser(),
          requestId: REQUEST_ID,
        }),
      (err) => assertAccessError(err, 404, "PATIENT_NOT_FOUND")
    );
    assert.equal(transaction.aborts, 1);
  } finally {
    restoreModelMethods();
  }
});
