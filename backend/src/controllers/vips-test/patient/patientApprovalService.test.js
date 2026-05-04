import assert from "node:assert/strict";
import { after, test } from "node:test";

import Patient from "../../../models/Patient.js";
import PatientHistory from "../../../models/PatientHistory.js";
import User from "../../../models/User.js";
import {
  approvePatientProfileService,
  rejectPatientProfileService,
} from "../../../services/patients/patientApprovalService.js";

const originalPatientMethods = {
  find: Patient.find,
  findOne: Patient.findOne,
  updateMany: Patient.updateMany,
};

const originalPatientHistoryMethods = {
  create: PatientHistory.create,
};

const originalUserMethods = {
  findByIdAndUpdate: User.findByIdAndUpdate,
};

after(() => {
  restoreModelMethods();
});

function restoreModelMethods() {
  Patient.find = originalPatientMethods.find;
  Patient.findOne = originalPatientMethods.findOne;
  Patient.updateMany = originalPatientMethods.updateMany;
  PatientHistory.create = originalPatientHistoryMethods.create;
  User.findByIdAndUpdate = originalUserMethods.findByIdAndUpdate;
}

function makePatient(overrides = {}) {
  return {
    _id: "profile-id",
    fullname: "Patient Profile",
    email: "patient@example.com",
    phoneDigits: "16195550101",
    birthDate: new Date("1990-01-01T12:00:00.000Z"),
    age: 36,
    bloodtype: "O+",
    gender: "female",
    organDonor: true,
    bloodDonor: false,
    measurementSystem: "metric",
    heightM: 1.7,
    weightKg: 70,
    country: "United States",
    state: "California",
    city: "San Diego",
    diseases: [],
    allergies: [],
    medications: [],
    children: [],
    createdBy: "doctor-id",
    lastEditedBy: "doctor-id",
    updatedAt: new Date("2026-01-02T12:00:00.000Z"),
    ...overrides,
  };
}

function makePatientUser(overrides = {}) {
  return {
    _id: "patient-user-id",
    role: "patient",
    email: "Patient@Example.com",
    ...overrides,
  };
}

function mockPatientFindOne(value) {
  const calls = [];

  Patient.findOne = (query) => {
    calls.push(query);
    return {
      lean: async () => value,
    };
  };

  return calls;
}

function mockPatientFindSequence(values) {
  const calls = [];

  Patient.find = (query) => {
    const value = values[calls.length];
    const call = { query, sort: undefined, populate: undefined };
    calls.push(call);

    return {
      sort(sort) {
        call.sort = sort;
        return {
          lean: async () => value,
          populate(path, select) {
            call.populate = { path, select };
            return {
              lean: async () => value,
            };
          },
        };
      },
    };
  };

  return calls;
}

function mockPatientUpdateMany() {
  const calls = [];

  Patient.updateMany = async (query, updateDoc, options) => {
    calls.push({ query, updateDoc, options });
    return { acknowledged: true, modifiedCount: 1 };
  };

  return calls;
}

function mockPatientHistoryCreate() {
  const calls = [];

  PatientHistory.create = async (doc) => {
    calls.push(doc);
    return doc;
  };

  return calls;
}

function mockUserDecisionUpdate() {
  const calls = [];

  User.findByIdAndUpdate = async (id, updateDoc, options) => {
    calls.push({ id, updateDoc, options });
    return null;
  };

  return calls;
}

test("approvePatientProfileService rejects when patient doc is not found", async () => {
  restoreModelMethods();

  const findOneCalls = mockPatientFindOne(null);

  try {
    await assert.rejects(
      () =>
        approvePatientProfileService({
          user: makePatientUser(),
          profileId: "missing-profile-id",
        }),
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.message, "Patient profile not found for this user");
        return true;
      }
    );

    assert.deepEqual(findOneCalls, [
      { _id: "missing-profile-id", email: "patient@example.com" },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("approvePatientProfileService rejects when authenticated user email does not match patient email", async () => {
  restoreModelMethods();

  const findOneCalls = mockPatientFindOne(null);

  try {
    await assert.rejects(
      () =>
        approvePatientProfileService({
          user: makePatientUser({ email: "wrong@example.com" }),
          profileId: "profile-id",
        }),
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.message, "Patient profile not found for this user");
        return true;
      }
    );

    assert.deepEqual(findOneCalls, [
      { _id: "profile-id", email: "wrong@example.com" },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("rejectPatientProfileService rejects when patient doc is not found", async () => {
  restoreModelMethods();

  const findCalls = mockPatientFindSequence([[]]);

  try {
    await assert.rejects(
      () =>
        rejectPatientProfileService({
          user: makePatientUser(),
          profileId: "missing-profile-id",
        }),
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.message, "No patient profiles found for this user");
        return true;
      }
    );

    assert.deepEqual(findCalls, [
      {
        query: { email: "patient@example.com" },
        sort: { updatedAt: -1 },
        populate: undefined,
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("rejectPatientProfileService rejects when authenticated user email does not match patient email", async () => {
  restoreModelMethods();

  const findCalls = mockPatientFindSequence([
    [makePatient({ _id: "other-profile-id", email: "wrong@example.com" })],
  ]);

  try {
    await assert.rejects(
      () =>
        rejectPatientProfileService({
          user: makePatientUser({ email: "wrong@example.com" }),
          profileId: "profile-id",
        }),
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.message, "Patient profile not found for this user");
        return true;
      }
    );

    assert.deepEqual(findCalls, [
      {
        query: { email: "wrong@example.com" },
        sort: { updatedAt: -1 },
        populate: undefined,
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("rejectPatientProfileService restores approvedSnapshot when available", async () => {
  restoreModelMethods();

  const approvedAt = new Date("2026-01-01T12:00:00.000Z");
  const target = makePatient({
    approvedAt,
    approvedSnapshot: {
      set: {
        fullname: "Approved Patient",
        email: "patient@example.com",
        phoneDigits: "16195550101",
        diseases: ["asthma"],
        allergies: [],
        medications: [],
        children: [],
      },
      unset: { causeOfDeath: 1 },
    },
  });

  const findCalls = mockPatientFindSequence([
    [target],
    [makePatient({ fullname: "Approved Patient", diseases: ["asthma"] })],
  ]);
  const updateManyCalls = mockPatientUpdateMany();
  const userUpdateCalls = mockUserDecisionUpdate();

  try {
    const result = await rejectPatientProfileService({
      user: makePatientUser(),
      profileId: "profile-id",
    });

    assert.equal(result.ok, true);
    assert.equal(result.pendingDecision, false);
    assert.equal(result.hasRecords, true);
    assert.equal(updateManyCalls.length, 1);
    assert.deepEqual(updateManyCalls[0].query, { email: "patient@example.com" });
    assert.equal(updateManyCalls[0].updateDoc.$set.fullname, "Approved Patient");
    assert.deepEqual(updateManyCalls[0].updateDoc.$set.diseases, ["asthma"]);
    assert.equal(updateManyCalls[0].updateDoc.$set.updatedAt, approvedAt);
    assert.deepEqual(updateManyCalls[0].updateDoc.$unset, { causeOfDeath: 1 });
    assert.deepEqual(updateManyCalls[0].options, { timestamps: false });
    assert.equal(userUpdateCalls.length, 1);
    assert.deepEqual(findCalls[1].populate, { path: "createdBy", select: "name email" });
  } finally {
    restoreModelMethods();
  }
});

test("approvePatientProfileService marks the target profile as approved", async () => {
  restoreModelMethods();

  const target = makePatient();
  const findOneCalls = mockPatientFindOne(target);
  const findCalls = mockPatientFindSequence([[target]]);
  const updateManyCalls = mockPatientUpdateMany();
  const historyCalls = mockPatientHistoryCreate();
  const userUpdateCalls = mockUserDecisionUpdate();

  try {
    const result = await approvePatientProfileService({
      user: makePatientUser(),
      profileId: "profile-id",
    });

    assert.equal(result.ok, true);
    assert.equal(result.pendingDecision, false);
    assert.deepEqual(findOneCalls, [
      { _id: "profile-id", email: "patient@example.com" },
    ]);
    assert.equal(updateManyCalls.length, 1);
    assert.deepEqual(updateManyCalls[0].query, { email: "patient@example.com" });
    assert(updateManyCalls[0].updateDoc.$set.approvedAt instanceof Date);
    assert.equal(
      updateManyCalls[0].updateDoc.$set.updatedAt,
      updateManyCalls[0].updateDoc.$set.approvedAt
    );
    assert.equal(
      updateManyCalls[0].updateDoc.$set.approvedSnapshot.set.fullname,
      "Patient Profile"
    );
    assert.deepEqual(updateManyCalls[0].options, { timestamps: false });
    assert.equal(historyCalls.length, 1);
    assert.equal(historyCalls[0].approvedFromProfile, "profile-id");
    assert.equal(historyCalls[0].approvedAt, updateManyCalls[0].updateDoc.$set.approvedAt);
    assert.equal(userUpdateCalls.length, 1);
    assert.deepEqual(findCalls[0].populate, { path: "createdBy", select: "name email" });
  } finally {
    restoreModelMethods();
  }
});
