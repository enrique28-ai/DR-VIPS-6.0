import assert from "node:assert/strict";
import { after, test } from "node:test";

import Patient from "../../../models/Patient.js";
import PatientHistory from "../../../models/PatientHistory.js";
import {
  getChildHistoryOneService,
  getChildHistoryService,
  getMyHistoryOneService,
  getMyHistoryService,
  getPatientHistoryOneService,
  getPatientHistoryService,
} from "../../../services/patients/patientHistoryService.js";

const originalPatientMethods = {
  findOne: Patient.findOne,
};

const originalPatientHistoryMethods = {
  create: PatientHistory.create,
  find: PatientHistory.find,
  findOne: PatientHistory.findOne,
};

after(() => {
  restoreModelMethods();
});

function restoreModelMethods() {
  Patient.findOne = originalPatientMethods.findOne;
  PatientHistory.create = originalPatientHistoryMethods.create;
  PatientHistory.find = originalPatientHistoryMethods.find;
  PatientHistory.findOne = originalPatientHistoryMethods.findOne;
}

function makeDoctor(overrides = {}) {
  return {
    _id: "doctor-id",
    role: "doctor",
    email: "doctor@example.com",
    ...overrides,
  };
}

function makePatientUser(overrides = {}) {
  return {
    _id: "patient-user-id",
    role: "patient",
    email: "Patient@Example.com ",
    ...overrides,
  };
}

function mockPatientFindOne(response) {
  const calls = [];

  Patient.findOne = (query) => {
    const call = { query, select: undefined };
    calls.push(call);
    return {
      select: (projection) => {
        call.select = projection;
        return {
          lean: async () => response,
        };
      },
    };
  };

  return calls;
}

function mockPatientHistoryFind(response) {
  const calls = [];

  PatientHistory.find = (query) => {
    const call = { query };
    calls.push(call);
    return {
      select: (projection) => {
        call.select = projection;
        return {
          lean: async () => response,
        };
      },
      sort: (sort) => {
        call.sort = sort;
        return {
          populate: (path, select) => {
            call.populate = { path, select };
            return {
              lean: async () => response,
            };
          },
        };
      },
    };
  };

  return calls;
}

function mockPatientHistoryFindOne(response) {
  const calls = [];

  PatientHistory.findOne = (query) => {
    const call = { query, populate: undefined };
    calls.push(call);
    return {
      populate: (path, select) => {
        call.populate = { path, select };
        return {
          lean: async () => response,
        };
      },
    };
  };

  return calls;
}

function guardPatientHistoryCollection() {
  PatientHistory.create = async () => {
    throw new Error("PatientHistory.create should not be called in privacy rejection paths");
  };
  PatientHistory.find = () => {
    throw new Error("PatientHistory.find should not be called in privacy rejection paths");
  };
  PatientHistory.findOne = () => {
    throw new Error("PatientHistory.findOne should not be called in privacy rejection paths");
  };
}

test("getPatientHistoryService rejects unowned patient before history lookup", async () => {
  restoreModelMethods();

  const findOneCalls = mockPatientFindOne(null);
  guardPatientHistoryCollection();

  try {
    await assert.rejects(
      () =>
        getPatientHistoryService({
          user: makeDoctor(),
          patientId: "patient-id",
        }),
      (err) => {
        assert.equal(err.status, 403);
        assert.equal(err.message, "You do not have access to this patient.");
        return true;
      }
    );

    assert.deepEqual(findOneCalls, [
      {
        query: {
          _id: "patient-id",
          $or: [{ createdBy: "doctor-id" }, { owners: "doctor-id" }],
        },
        select:
          "email phoneDigits minorKey parentEmail birthDate approvedSnapshot approvedAt",
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("getPatientHistoryOneService rejects unowned patient before single history lookup", async () => {
  restoreModelMethods();

  const findOneCalls = mockPatientFindOne(null);
  guardPatientHistoryCollection();

  try {
    await assert.rejects(
      () =>
        getPatientHistoryOneService({
          user: makeDoctor(),
          patientId: "patient-id",
          historyId: "history-id",
          req: { query: { lang: "en" } },
        }),
      (err) => {
        assert.equal(err.status, 403);
        assert.equal(err.message, "Not authorized");
        return true;
      }
    );

    assert.deepEqual(findOneCalls, [
      {
        query: {
          _id: "patient-id",
          $or: [{ createdBy: "doctor-id" }, { owners: "doctor-id" }],
        },
        select: "email minorKey parentEmail birthDate",
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("getPatientHistoryService scopes history lookup to the owned patient's normalized email", async () => {
  restoreModelMethods();

  const findOneCalls = mockPatientFindOne({
    _id: "patient-id",
    email: "Patient@Example.com ",
    phoneDigits: "16195550101",
  });
  const historyFindCalls = mockPatientHistoryFind([
    {
      _id: "history-id",
      approvedSnapshot: null,
      approvedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ]);
  PatientHistory.create = async () => {
    throw new Error("PatientHistory.create should not be called when history exists");
  };

  try {
    const result = await getPatientHistoryService({
      user: makeDoctor(),
      patientId: "patient-id",
    });

    assert.equal(result.length, 1);
    assert.deepEqual(findOneCalls[0].query, {
      _id: "patient-id",
      $or: [{ createdBy: "doctor-id" }, { owners: "doctor-id" }],
    });
    assert.deepEqual(historyFindCalls, [
      {
        query: { $or: [
          { patientEmail: "patient@example.com" },
          { patientKey: { $type: "string" }, $or: [
            { patientId: { $in: ["patient-id"] } },
            { approvedFromProfile: { $in: ["patient-id"] } },
          ] },
        ] },
        sort: { approvedAt: -1 },
        populate: { path: "editedBy", select: "name" },
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("phone-only legacy history requires the exact owned profile even when a phone was reused", async () => {
  restoreModelMethods();
  const phone = "15555550100";
  mockPatientFindOne({ _id: "owned", phoneDigits: phone });
  const owned = { _id: "own-history", patientId: "owned", patientPhoneDigits: phone, approvedSnapshot: { fullname: "Own record" } };
  const foreign = { _id: "foreign-history", approvedFromProfile: "other", patientPhoneDigits: phone, approvedSnapshot: { fullname: "Other record" } };
  const rows = [owned, foreign];
  const matches = (row, query) => {
    if (query._id && row._id !== query._id) return false;
    if (query.$or) return query.$or.some((candidate) => Object.entries(candidate).every(([key, value]) => row[key] === value));
    return row.patientPhoneDigits === query.patientPhoneDigits;
  };
  PatientHistory.find = (query) => ({
    sort: () => ({ populate: () => ({ lean: async () => rows.filter((row) => matches(row, query)) }) }),
  });
  PatientHistory.findOne = (query) => ({
    populate: () => ({ lean: async () => rows.find((row) => matches(row, query)) }),
  });
  try {
    const user = makeDoctor();
    const history = await getPatientHistoryService({ user, patientId: "owned" });
    assert.deepEqual(history.map(({ _id }) => _id), ["own-history"]);
    const req = { query: { lang: "es" } };
    const version = await getPatientHistoryOneService({ user, patientId: "owned", historyId: "own-history", req });
    assert.equal(version.approvedSnapshot.set.fullname, "Own record");
    await assert.rejects(
      getPatientHistoryOneService({ user, patientId: "owned", historyId: "foreign-history", req }),
      { status: 404 },
    );
  } finally {
    restoreModelMethods();
  }
});

test("getMyHistoryService rejects non-patient role before history lookup", async () => {
  restoreModelMethods();

  guardPatientHistoryCollection();
  Patient.findOne = () => {
    throw new Error("Patient.findOne should not be called for non-patient history");
  };

  try {
    await assert.rejects(
      () => getMyHistoryService({ user: makeDoctor() }),
      (err) => {
        assert.equal(err.status, 403);
        assert.equal(err.message, "Insufficient role");
        return true;
      }
    );
  } finally {
    restoreModelMethods();
  }
});

test("doctor and patient history return the same recorded clinical values without private metadata", async (t) => {
  const set = {
    fullname: "Synthetic patient", age: 36, ageCategory: "18-59", gender: "female",
    birthDate: new Date("1990-01-01"), bloodtype: "O+", phone: "+15555550100",
    country: "Mexico", state: "Jalisco", city: "Guadalajara",
    birthCountry: "Mexico", birthState: "Puebla", birthCity: "Puebla",
    measurementSystem: "metric", heightM: 1.7, weightKg: 70, bmi: 24.2, bmiCategory: "healthy",
    organDonor: false, bloodDonor: true, isDeceased: true,
    dateOfDeath: new Date("2026-03-01"), causeOfDeath: "Synthetic cause",
    diseases: ["Synthetic diagnosis A", "Synthetic diagnosis B"], allergies: [],
    medications: ["Synthetic medication 5 mg"], childrenCount: 2,
    children: [{ name: "First child" }, { name: "Second child" }],
  };
  const approved = {
    _id: "approved", approvedAt: new Date("2026-03-02"),
    editedBy: { _id: "doctor-id", name: "Synthetic editor", email: "hidden@example.test" },
    approvedSnapshot: { set: { ...set, phoneDigits: "15555550100", owners: ["hidden"], children: [
      { name: "First child", _id: "internal-child-id" }, { name: "Second child" },
    ] } },
  };
  const rejected = {
    _id: "rejected", eventType: "rejected", eventAt: new Date("2026-01-02"),
    approvedFromProfile: "owned", proposedSnapshot: { set: { fullname: "Synthetic patient", age: 35, birthDate: set.birthDate }, unset: { city: 1, minorKey: 1 } },
  };
  const unresolved = {
    _id: "unresolved", eventType: "unresolvedAtDeath", eventAt: new Date("2026-03-02"),
    approvedFromProfile: "other-doctor", proposedSnapshot: { set: { childrenCount: 3 } },
  };
  t.after(restoreModelMethods);
  mockPatientFindOne({ email: "patient@example.com" });
  mockPatientHistoryFind([rejected, approved, unresolved]);
  const my = await getMyHistoryService({ user: makePatientUser() });
  const doctor = await getPatientHistoryService({ user: makeDoctor(), patientId: "owned" });
  assert.deepEqual(my.map((row) => row._id), ["unresolved", "approved", "rejected"]);
  assert.deepEqual(doctor.map((row) => row._id), ["approved", "rejected"]);
  assert.deepEqual(doctor[0], my[1]);
  assert.deepEqual(doctor[0].approvedSnapshot.set, set);
  assert.deepEqual(doctor[0].editedBy, { name: "Synthetic editor" });
  assert.deepEqual(doctor[1].proposedSnapshot, {
    set: { fullname: "Synthetic patient", age: 35, birthDate: set.birthDate },
    unset: { city: 1 },
  });

  mockPatientHistoryFindOne(unresolved);
  const req = { query: { lang: "es" } };
  await assert.rejects(getPatientHistoryOneService({ user: makeDoctor(), patientId: "owned", historyId: "unresolved", req }), { status: 404 });
  assert.equal((await getMyHistoryOneService({ user: makePatientUser(), historyId: "unresolved", req })).proposedSnapshot.set.childrenCount, 3);
  mockPatientHistoryFindOne(rejected);
  const translated = await getMyHistoryOneService({ user: makePatientUser(), historyId: "rejected", req });
  assert.equal(Object.hasOwn(translated.proposedSnapshot.set, "allergies"), false);
  assert.deepEqual(translated.proposedSnapshot.unset, { city: 1 });
});

test("getMyHistoryOneService scopes single history lookup to the patient's normalized email", async () => {
  restoreModelMethods();

  const historyFindOneCalls = mockPatientHistoryFindOne({
    _id: "history-id",
    approvedSnapshot: null,
    approvedAt: new Date("2026-01-01T00:00:00.000Z"),
  });

  try {
    const result = await getMyHistoryOneService({
      user: makePatientUser(),
      historyId: "history-id",
      req: { query: { lang: "en" } },
    });

    assert.equal(result._id, "history-id");
    assert.deepEqual(historyFindOneCalls, [
      {
        query: { _id: "history-id", patientEmail: "patient@example.com" },
        populate: { path: "editedBy", select: "name" },
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("getChildHistoryService rejects non-owned child before history lookup", async () => {
  restoreModelMethods();

  const findOneCalls = mockPatientFindOne(null);
  guardPatientHistoryCollection();

  try {
    await assert.rejects(
      () =>
        getChildHistoryService({
          user: makePatientUser(),
          childId: "child-profile-id",
        }),
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.message, "CHILD_PROFILE_NOT_FOUND");
        return true;
      }
    );

    assert.equal(findOneCalls.length, 1);
    assert.equal(findOneCalls[0].query._id, "child-profile-id");
    assert.equal(findOneCalls[0].query.parentEmail, "patient@example.com");
    assert.ok(Array.isArray(findOneCalls[0].query.$or));
    assert.equal(findOneCalls[0].select, "minorKey parentEmail birthDate");
  } finally {
    restoreModelMethods();
  }
});

const oldMinorKey = "old@example.test::synthetic minor";
const newMinorKey = "new@example.test::synthetic minor";
const childId = "child-profile-id";
const siblingId = "second-source-profile-id";
const birthDate = new Date("2016-01-01T12:00:00.000Z");
const identity = {
  $or: [{ patientId: { $in: [childId, siblingId] } }, { approvedFromProfile: { $in: [childId, siblingId] } }],
};
const child = { _id: childId, parentEmail: "new@example.test", minorKey: newMinorKey, birthDate };
const doctor = makeDoctor();
const guardian = makePatientUser({ email: child.parentEmail });
const req = { query: { lang: "en" } };
const approved = {
  _id: "approved", approvedFromProfile: siblingId, patientKey: oldMinorKey,
  approvedSnapshot: { set: { diseases: ["Approved"], medications: [] } },
};
const rejected = {
  _id: "rejected", approvedFromProfile: childId, patientKey: oldMinorKey, eventType: "rejected",
  editedBy: { _id: doctor._id, name: "Synthetic doctor" },
  proposedSnapshot: { set: { diseases: ["Rejected"] } },
};
const reassigned = {
  _id: "reassigned", patientId: childId, patientKey: newMinorKey, oldMinorKey, newMinorKey,
  approvedSnapshot: { set: { diseases: ["Approved"] } },
};
const siblingProposal = { ...rejected, _id: "sibling-proposal", approvedFromProfile: siblingId };

function mockChildSources(t) {
  mockPatientFindOne(child);
  t.mock.method(Patient, "find", (query) => {
    assert.deepEqual(query, { parentEmail: child.parentEmail, minorKey: newMinorKey, birthDate, _id: { $ne: childId } });
    return { select: () => ({ lean: async () => [{ _id: siblingId }] }) };
  });
}

test("the current guardian sees source-linked history through reassignment, including rejected proposals", async (t) => {
  restoreModelMethods();
  t.after(restoreModelMethods);
  mockChildSources(t);
  const listCalls = mockPatientHistoryFind([approved, rejected, reassigned]);
  const detailCalls = mockPatientHistoryFindOne(rejected);
  const rows = await getChildHistoryService({ user: guardian, childId });
  assert.deepEqual(rows.map((row) => row.eventType).sort(), ["approved", "guardianReassigned", "rejected"]);
  assert.deepEqual(listCalls[0].query, identity);
  assert.equal(rows.find((row) => row._id === "rejected").approvedSnapshot, undefined);
  const version = await getChildHistoryOneService({ user: guardian, childId, historyId: rejected._id, req });
  assert.deepEqual(detailCalls[0].query, { _id: rejected._id, ...identity });
  assert.deepEqual(version.proposedSnapshot.set.diseases, ["Rejected"]);
});

test("the doctor cannot read another doctor's proposal, including on a co-owned source", async (t) => {
  restoreModelMethods();
  t.after(restoreModelMethods);
  mockChildSources(t);
  const foreignAuthor = { ...rejected, _id: "foreign-author", editedBy: { _id: "other-doctor", name: "Other" } };
  mockPatientHistoryFind([approved, rejected, reassigned, siblingProposal, foreignAuthor]);
  const list = await getPatientHistoryService({ user: doctor, patientId: childId });
  assert.deepEqual(list.map((row) => row._id).sort(), ["approved", "reassigned", "rejected"]);
  for (const row of [siblingProposal, foreignAuthor]) {
    const calls = mockPatientHistoryFindOne(row);
    await assert.rejects(getPatientHistoryOneService({ user: doctor, patientId: childId, historyId: row._id, req }), { status: 404 });
    assert.deepEqual(calls[0].query, { _id: row._id, ...identity });
  }
  mockPatientHistoryFindOne(approved);
  assert.equal((await getPatientHistoryOneService({ user: doctor, patientId: childId, historyId: approved._id, req }))._id, approved._id);
});

test("a reused minor key does not recover history from a deleted, unrelated source", async (t) => {
  restoreModelMethods();
  t.after(restoreModelMethods);
  mockChildSources(t);
  const unrelated = { ...rejected, patientKey: newMinorKey, approvedFromProfile: "deleted-source" };
  t.mock.method(PatientHistory, "findOne", (query) => ({
    populate: () => ({ lean: async () => query.$or.some((branch) => branch.approvedFromProfile?.$in.includes(unrelated.approvedFromProfile)) ? unrelated : null }),
  }));
  await assert.rejects(getChildHistoryOneService({ user: guardian, childId, historyId: unrelated._id, req }), { status: 404 });
});

test("former guardian and adults without record linkage cannot use old child and history IDs", async (t) => {
  restoreModelMethods();
  t.after(restoreModelMethods);
  const calls = mockPatientFindOne(null);
  guardPatientHistoryCollection();
  await assert.rejects(getChildHistoryOneService({
    user: makePatientUser({ email: "old@example.test" }), childId, historyId: rejected._id, req,
  }), { status: 404 });
  assert.equal(calls[0].query.parentEmail, "old@example.test");
  assert.ok(Array.isArray(calls[0].query.$or));
});
