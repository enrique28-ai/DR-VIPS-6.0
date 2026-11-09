import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import mongoose from "mongoose";

import Patient from "../../../models/Patient.js";
import PatientHistory from "../../../models/PatientHistory.js";
import Diagnosis from "../../../models/Diagnosis.js";
import User from "../../../models/User.js";
import Appointment from "../../../models/Appointment.js";
import { approveChildProfile, rejectChildProfile } from "../../patientController.js";
import {
  approveChildProfileService,
  approvePatientProfileService,
  rejectChildProfileService,
  rejectPatientProfileService,
} from "../../../services/patients/patientApprovalService.js";
import { getMyHealthInfoService } from "../../../services/patients/patientPortalService.js";

const originalPatientMethods = {
  find: Patient.find,
  findOne: Patient.findOne,
  updateMany: Patient.updateMany,
  updateOne: Patient.updateOne,
};

const decisionSession = { id: "synthetic-decision-session" };
beforeEach((t) => {
  t.mock.method(mongoose.connection, "transaction", async (callback) => callback(decisionSession));
  t.mock.method(Patient, "exists", () => ({
    session: async () => null,
    then: (resolve, reject) => Promise.resolve(null).then(resolve, reject),
  }));
});

const declaredChildren = (count) => Array.from({ length: count }, (_, index) => ({
  name: `Synthetic child ${index + 1}`,
}));

function mockChildrenReview(t, profiles, relatedRecords = []) {
  const user = makePatientUser();
  let lastHealthDecisionAt = new Date("2026-01-01T12:00:00.000Z");
  const queryResult = (getData) => ({
    sort() { return this; },
    populate() { return this; },
    select() { return this; },
    lean: async () => structuredClone(getData()),
  });
  const matches = (doc, filter) => doc.email === filter.email && (!filter._id || doc._id === filter._id);
  const find = t.mock.method(Patient, "find", (filter) => queryResult(() =>
    [...profiles, ...relatedRecords].filter((doc) => matches(doc, filter)).sort((a, b) => b.updatedAt - a.updatedAt),
  ));
  t.mock.method(Patient, "findOne", (filter) => queryResult(() => profiles.find((doc) => matches(doc, filter))));
  const write = t.mock.method(Patient, "updateMany", async (filter, { $set, $unset }) => {
    for (const doc of profiles.filter((entry) => matches(entry, filter))) {
      Object.assign(doc, structuredClone($set));
      for (const key of Object.keys($unset ?? {})) delete doc[key];
    }
  });
  const history = t.mock.method(PatientHistory, "create", async () => {});
  t.mock.method(User, "findById", () => queryResult(() => ({ lastHealthDecisionAt })));
  t.mock.method(User, "findByIdAndUpdate", async (_id, { $set }) => {
    lastHealthDecisionAt = $set.lastHealthDecisionAt;
  });
  const read = (account = user, query = {}) => getMyHealthInfoService({ user: account, req: { query } });
  return { user, read, find, write, history };
}

for (const [before, proposed, decision, multiple] of [
  [0, 1, "approve", false],
  [0, 1, "reject", false],
  [1, 2, "approve", true],
  [2, 3, "reject", true],
]) {
  test(`children review keeps ${before} approved until ${decision} of proposal ${proposed}`, async (t) => {
    const approvedAt = new Date("2026-01-01T12:00:00.000Z");
    const approved = declaredChildren(before);
    const target = makePatient({
      approvedAt,
      approvedSnapshot: { set: { children: approved, childrenCount: before }, unset: {} },
      children: declaredChildren(proposed),
      childrenCount: proposed,
    });
    const sibling = makePatient({
      _id: "other-doctor-profile",
      updatedAt: approvedAt,
      approvedAt,
      approvedSnapshot: { children: approved },
      children: declaredChildren(proposed + 1),
      childrenCount: proposed + 1,
    });
    const profiles = multiple ? [target, sibling] : [target];
    const { user, read, history } = mockChildrenReview(t, profiles);

    const pending = await read();
    assert.equal(pending.pendingDecision, true);
    assert.deepEqual(pending.snapshot.childrenReview, { approvedCount: before, proposedCount: proposed });

    const decide = decision === "approve" ? approvePatientProfileService : rejectPatientProfileService;
    const result = await decide({ user, profileId: target._id });
    const confirmed = decision === "approve" ? proposed : before;
    assert.equal(result.pendingDecision, false);
    const [[entry], options] = history.mock.calls[0].arguments;
    assert.equal(options.session, decisionSession);
    if (decision === "reject") {
      assert.equal(entry.eventType, "rejected");
      assert.equal(entry.approvedAt, undefined);
      assert.deepEqual(entry.proposedSnapshot.set.children, declaredChildren(proposed));
    } else {
      assert.deepEqual(entry.approvedSnapshot.set.children, declaredChildren(proposed));
    }
    assert.equal(result.snapshot.childrenReview.approvedCount, confirmed);
    for (const profile of profiles) {
      assert.deepEqual(profile.children, declaredChildren(confirmed));
      assert.equal(profile.childrenCount, confirmed);
    }
    const reloaded = await read({ ...user, email: "PATIENT@example.com" });
    assert.equal(reloaded.pendingDecision, false);
    assert.deepEqual(reloaded.snapshot.childrenReview, { approvedCount: confirmed, proposedCount: confirmed });
  });
}

test("the declared total ignores guardian access, adulthood, death, and duplicate names", async (t) => {
  const children = [...declaredChildren(2), { name: " SYNTHETIC   CHILD 1 " }];
  const profile = makePatient({
    children,
    childrenCount: 99,
    approvedAt: new Date("2026-01-01T12:00:00.000Z"),
    approvedSnapshot: { set: { children } },
  });
  const linked = [
    { email: "other@example.test", parentEmail: profile.email, isDeceased: true, age: 10 },
    { email: "adult@example.test", parentEmail: profile.email, age: 20 },
    { email: "ward@example.test", parentEmail: profile.email, age: 12 },
  ];
  const { user, read, find, write } = mockChildrenReview(t, [profile], linked);
  const own = await read(user, { lang: "es" });
  assert.deepEqual(own.snapshot.childrenReview, { approvedCount: 2, proposedCount: 2 });
  assert.deepEqual(find.mock.calls[0].arguments, [{ email: "patient@example.com" }]);

  const unrelated = { ...user, email: "unrelated@example.test" };
  assert.equal((await read(unrelated)).snapshot, null);
  await assert.rejects(approvePatientProfileService({ user: unrelated, profileId: profile._id }), { status: 404 });
  await assert.rejects(rejectPatientProfileService({ user: unrelated, profileId: profile._id }), { status: 404 });
  await assert.rejects(read({ ...user, role: "doctor" }), { status: 403 });
  assert.equal(write.mock.callCount(), 0);
});

test("a deceased profile blocks adult decisions even when the submitted profile belongs to a different doctor", async (t) => {
  const proposal = makePatient({ children: declaredChildren(3) });
  const deceased = makePatient({ _id: "death-profile", isDeceased: true });
  const { user, write, history } = mockChildrenReview(t, [proposal, deceased]);
  t.mock.method(Patient, "exists", (query) => ({
    session: async (session) => {
      assert.deepEqual(query, { email: "patient@example.com", isDeceased: true });
      assert.equal(session, decisionSession);
      return { _id: deceased._id };
    },
  }));
  for (const decide of [approvePatientProfileService, rejectPatientProfileService]) {
    for (const { _id: profileId } of [proposal, deceased]) {
      await assert.rejects(decide({ user, profileId }), {
        status: 409,
        errorCode: "PATIENT_DECEASED_READ_ONLY",
      });
    }
  }
  assert.equal(write.mock.callCount(), 0);
  assert.equal(history.mock.callCount(), 0);
});

test("adult portal reloads the approved baseline and archived proposal after death, including translated requests", async (t) => {
  const proposal = makePatient({ children: declaredChildren(3), diseases: ["Proposed condition"] });
  const deceased = makePatient({
    _id: "death-profile",
    isDeceased: true,
    dateOfDeath: new Date("2026-01-20"),
    children: declaredChildren(3),
    diseases: ["Proposed condition"],
    approvedSnapshot: {
      set: { fullname: "Approved Patient", children: declaredChildren(2), diseases: ["Approved condition"] },
      unresolvedReviewId: "unresolved-history-id",
    },
  });
  const { read } = mockChildrenReview(t, [proposal, deceased]);
  const lookup = t.mock.method(PatientHistory, "findOne", () => ({
    lean: async () => ({ proposedSnapshot: { set: { children: declaredChildren(3) } } }),
  }));
  for (const query of [{}, { lang: "es" }]) {
    const data = await read(undefined, query);
    assert.equal(data.pendingDecision, false);
    assert.equal(data.unresolvedAtDeath, true);
    assert.equal(data.snapshot.fullname, "Approved Patient");
    assert.deepEqual(data.snapshot.diseases, ["Approved condition"]);
    assert.deepEqual(data.snapshot.childrenReview, { approvedCount: 2, proposedCount: 3 });
  }
  assert.deepEqual(lookup.mock.calls[0].arguments[0], {
    _id: "unresolved-history-id", patientEmail: "patient@example.com", eventType: "unresolvedAtDeath",
  });
});

test("multi-doctor rejection restores the last approved data instead of another doctor's live draft", async (t) => {
  const approvedAt = new Date("2026-01-01T12:00:00Z");
  const approvedSnapshot = { set: { diseases: ["Confirmed condition"], medications: [], children: [] }, unset: { birthCity: 1 } };
  const target = makePatient({ diseases: ["Rejected condition"], birthCity: "Proposed city", approvedSnapshot, approvedAt });
  const other = makePatient({
    _id: "other-profile", diseases: ["Different unapproved condition"], medications: ["Unapproved medication"],
    approvedSnapshot, approvedAt, updatedAt: approvedAt,
  });
  const { user, find, history } = mockChildrenReview(t, [target, other]);
  const result = await rejectPatientProfileService({ user, profileId: target._id });
  assert.equal(result.pendingDecision, false);
  assert.deepEqual(result.snapshot.diseases, ["Confirmed condition"]);
  assert.equal(find.mock.calls.at(-1).arguments[2].session, decisionSession);
  for (const profile of [target, other]) {
    assert.deepEqual(profile.diseases, ["Confirmed condition"]);
    assert.deepEqual(profile.medications, []);
    assert.equal(profile.birthCity, undefined);
    assert.deepEqual(profile.approvedSnapshot, approvedSnapshot);
  }
  const [[rejected]] = history.mock.calls[0].arguments;
  assert.deepEqual(rejected.proposedSnapshot.set.diseases, ["Rejected condition"]);
});

test("a decision on a stale portal version cannot write or add history", async (t) => {
  const profile = makePatient();
  const { user, write, history } = mockChildrenReview(t, [profile]);
  for (const decide of [approvePatientProfileService, rejectPatientProfileService]) {
    await assert.rejects(decide({
      user, profileId: profile._id, expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
    }), { status: 409, errorCode: "PATIENT_REVIEW_CHANGED" });
  }
  assert.equal(write.mock.callCount(), 0);
  assert.equal(history.mock.callCount(), 0);
});

test("rejection cannot delete a legacy approved profile or restore from a sibling with no confirmed baseline", async (t) => {
  const profile = makePatient({ approvedAt: new Date("2026-01-01T12:00:00Z"), approvedSnapshot: null });
  const profiles = [profile];
  const { user, write, history } = mockChildrenReview(t, profiles);
  const deleted = t.mock.method(Patient, "deleteOne", async () => assert.fail("Unexpected profile deletion"));
  for (const count of [1, 2]) {
    if (count === 2) profiles.push(makePatient({ _id: "other-profile", approvedSnapshot: null }));
    await assert.rejects(rejectPatientProfileService({ user, profileId: profile._id }), {
      status: 409, errorCode: "PATIENT_REVIEW_BASELINE_MISSING",
    });
  }
  assert.equal(deleted.mock.callCount(), 0);
  assert.equal(write.mock.callCount(), 0);
  assert.equal(history.mock.callCount(), 0);
});

test("child decision endpoints return the read-only conflict for a deceased guardian", async (t) => {
  const child = makeChildPatient();
  t.mock.method(Patient, "findOne", () => ({ lean: async () => child }));
  t.mock.method(Patient, "exists", (filter) => {
    assert.deepEqual(filter, { email: "parent@example.com", isDeceased: true });
    return { session: async (session) => {
      assert.equal(session, decisionSession);
      return { _id: "deceased-guardian" };
    } };
  });
  const writes = t.mock.method(Patient, "updateMany", async () => assert.fail("Unexpected child profile write"));
  const history = t.mock.method(PatientHistory, "create", async () => assert.fail("Unexpected child history write"));
  const req = { user: makePatientUser({ email: "parent@example.com" }), params: { id: child._id } };
  for (const decide of [approveChildProfile, rejectChildProfile]) {
    const response = {};
    const res = {
      status(code) { response.status = code; return this; },
      json(body) { response.body = body; return this; },
    };

    await decide(req, res, (err) => { throw err; });
    assert.deepEqual(response, {
      status: 409,
      body: {
        error: "A deceased patient's profile cannot be approved or rejected",
        errorCode: "PATIENT_DECEASED_READ_ONLY",
      },
    });
  }
  assert.equal(writes.mock.callCount(), 0);
  assert.equal(history.mock.callCount(), 0);
});

test("correction to living permits rejection of the first proposal without treating the death event as medical approval", async (t) => {
  const corrected = makePatient({
    isDeceased: false,
    approvedAt: new Date("2026-01-02T12:00:00Z"),
    approvedSnapshot: {
      set: { isDeceased: false, children: [], childrenCount: 0 },
      deathStatusOnly: true,
      unresolvedReviewId: "unresolved-history-id",
    },
    children: declaredChildren(1),
  });
  const { user, read, write, history } = mockChildrenReview(t, [corrected]);
  t.mock.method(PatientHistory, "findOne", () => ({ lean: async () => ({
    approvedFromProfile: corrected._id,
    proposedSnapshot: { set: { children: corrected.children } },
  }) }));
  const deleteProfile = t.mock.method(Patient, "deleteOne", async () => {});
  const deleteDiagnoses = t.mock.method(Diagnosis, "deleteMany", async () => {});
  assert.equal((await read()).pendingDecision, true);
  const result = await rejectPatientProfileService({ user, profileId: corrected._id });
  assert.equal(result.hasRecords, false);
  assert.equal(write.mock.callCount(), 0);
  assert.equal(deleteProfile.mock.callCount(), 1);
  assert.equal(deleteDiagnoses.mock.callCount(), 1);
  const [[rejected]] = history.mock.calls[0].arguments;
  assert.equal(rejected.eventType, "rejected");
  assert.deepEqual(rejected.proposedSnapshot.set.children, declaredChildren(1));
});

test("conflicting or missing legacy approvals do not turn a current declaration into an approved total", async (t) => {
  const approvedAt = new Date("2026-01-01T12:00:00.000Z");
  const first = makePatient({
    approvedAt,
    approvedSnapshot: { children: declaredChildren(1) },
    children: declaredChildren(3),
  });
  const second = makePatient({
    approvedAt,
    approvedSnapshot: { children: declaredChildren(2) },
  });
  const { read } = mockChildrenReview(t, [first, second]);
  assert.deepEqual((await read()).snapshot.childrenReview, { approvedCount: null, proposedCount: 3 });
  second.approvedSnapshot = null;
  assert.deepEqual((await read()).snapshot.childrenReview, { approvedCount: null, proposedCount: 3 });
});

const originalPatientHistoryMethods = {
  create: PatientHistory.create,
};

const originalUserMethods = {
  findByIdAndUpdate: User.findByIdAndUpdate,
};

const originalAppointmentMethods = {
  updateMany: Appointment.updateMany,
};

after(() => {
  restoreModelMethods();
});

function restoreModelMethods() {
  Patient.find = originalPatientMethods.find;
  Patient.findOne = originalPatientMethods.findOne;
  Patient.updateMany = originalPatientMethods.updateMany;
  Patient.updateOne = originalPatientMethods.updateOne;
  PatientHistory.create = originalPatientHistoryMethods.create;
  User.findByIdAndUpdate = originalUserMethods.findByIdAndUpdate;
  Appointment.updateMany = originalAppointmentMethods.updateMany;
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

function makeChildPatient(overrides = {}) {
  return {
    _id: "child-profile-id",
    fullname: "Corrected Minor",
    parentEmail: "parent@example.com",
    minorKey: "parent@example.com::minor patient",
    birthDate: new Date("2016-01-01T12:00:00.000Z"),
    age: 10,
    ageCategory: "0-12",
    bloodtype: "O+",
    gender: "female",
    organDonor: false,
    bloodDonor: false,
    measurementSystem: "metric",
    heightM: 1.35,
    weightKg: 32,
    country: "United States",
    state: "California",
    city: "San Diego",
    diseases: [],
    allergies: [],
    medications: [],
    children: [],
    approvedAt: new Date("2026-01-01T12:00:00.000Z"),
    approvedSnapshot: {
      set: {
        fullname: "Minor Patient",
        age: 10,
        ageCategory: "0-12",
        bloodtype: "O+",
        gender: "female",
        organDonor: false,
        bloodDonor: false,
        measurementSystem: "metric",
        heightM: 1.35,
        weightKg: 32,
        country: "United States",
        state: "California",
        city: "San Diego",
        diseases: [],
        allergies: [],
        medications: [],
        children: [],
        birthDate: new Date("2016-01-01T12:00:00.000Z"),
      },
      unset: {},
    },
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

function mockFlexiblePatientFindSequence(responses) {
  const calls = [];

  Patient.find = (query) => {
    const response = responses[calls.length];
    const call = { query, select: undefined, sort: undefined, populate: undefined };
    calls.push(call);

    if (response.kind === "lean") return { lean: async () => response.value };

    if (response.kind === "selectLean") {
      return {
        select: (projection) => {
          call.select = projection;
          return {
            lean: async () => response.value,
          };
        },
      };
    }

    if (response.kind === "sortLean" || response.kind === "sortPopulateLean") {
      return {
        sort: (sort) => {
          call.sort = sort;
          return {
            lean: async () => response.value,
            populate(path, select) {
              call.populate = { path, select };
              return {
                lean: async () => response.value,
              };
            },
          };
        },
      };
    }

    throw new Error(`Unsupported Patient.find mock response: ${response.kind}`);
  };

  return calls;
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
    if (updateDoc.$inc?.clinicalWriteVersion) {
      assert.equal(options.session, decisionSession);
      assert.equal(options.timestamps, false);
      return { acknowledged: true, modifiedCount: 1 };
    }
    calls.push({ query, updateDoc, options });
    return { acknowledged: true, modifiedCount: 1 };
  };

  return calls;
}

function mockPatientUpdateOne() {
  const calls = [];

  Patient.updateOne = async (query, updateDoc, options) => {
    calls.push({ query, updateDoc, options });
    return { acknowledged: true, modifiedCount: 1 };
  };

  return calls;
}

function mockPatientHistoryCreate() {
  const calls = [];

  PatientHistory.create = async (doc) => {
    calls.push(...(Array.isArray(doc) ? doc : [doc]));
    return doc;
  };

  return calls;
}

function assertCurrentMinorQuery(query, expectedFields) {
  const cutoff = query.$or[0].birthDate.$gt;
  assert.equal(cutoff instanceof Date, true);
  assert.equal(new Date("1990-01-01T12:00:00.000Z") > cutoff, false);
  assert.equal(new Date("2016-01-01T12:00:00.000Z") > cutoff, true);
  assert.deepEqual(query.$or.slice(1), [
    { birthDate: { $exists: false }, age: { $gte: 0, $lt: 18 } },
    { birthDate: null, age: { $gte: 0, $lt: 18 } },
  ]);
  assert.deepEqual(
    Object.fromEntries(Object.entries(query).filter(([key]) => key !== "$or")),
    expectedFields
  );
}

function mockAppointmentDeathArchive() {
  const calls = [];

  Appointment.updateMany = async (query, updateDoc) => {
    calls.push({ query, updateDoc });
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  };

  return calls;
}

function guardAppointmentDeathArchive() {
  Appointment.updateMany = async () => {
    throw new Error("Appointment.updateMany should not be called");
  };
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
  mockPatientHistoryCreate();

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
    assert.deepEqual(updateManyCalls[0].options, { timestamps: false, session: decisionSession });
    assert.equal(userUpdateCalls.length, 1);
    assert.deepEqual(findCalls[1].populate, { path: "createdBy", select: "name email" });
  } finally {
    restoreModelMethods();
  }
});

test("rejectPatientProfileService restores phone country from previous profile", async () => {
  restoreModelMethods();

  const target = makePatient({
    _id: "profile-id",
    phone: "+16195550101",
    phoneDigits: "16195550101",
    phoneCountry: "United States",
    phoneCountryIso: "US",
    country: "United States",
    state: "California",
    city: "San Diego",
    birthCountry: "United States",
    birthState: "California",
    birthCity: "Los Angeles",
    updatedAt: new Date("2026-01-03T12:00:00.000Z"),
  });
  const previous = makePatient({
    _id: "previous-profile-id",
    fullname: "Previous Patient",
    phone: "+442079460056",
    phoneDigits: "442079460056",
    phoneCountry: "United Kingdom",
    phoneCountryIso: "GB",
    country: "Mexico",
    state: "Ciudad de Mexico",
    city: "Mexico City",
    birthCountry: "Mexico",
    birthState: "Baja California",
    birthCity: "Mexicali",
    approvedAt: new Date("2026-01-01T12:00:00.000Z"),
    updatedAt: new Date("2026-01-01T12:00:00.000Z"),
  });

  mockPatientFindSequence([[target, previous], [previous]]);
  const updateManyCalls = mockPatientUpdateMany();
  const userUpdateCalls = mockUserDecisionUpdate();
  mockPatientHistoryCreate();

  try {
    const result = await rejectPatientProfileService({
      user: makePatientUser(),
      profileId: "profile-id",
    });

    assert.equal(result.ok, true);
    assert.equal(updateManyCalls.length, 1);
    assert.equal(updateManyCalls[0].updateDoc.$set.country, "Mexico");
    assert.equal(updateManyCalls[0].updateDoc.$set.state, "Ciudad de Mexico");
    assert.equal(updateManyCalls[0].updateDoc.$set.city, "Mexico City");
    assert.equal(updateManyCalls[0].updateDoc.$set.birthCountry, "Mexico");
    assert.equal(updateManyCalls[0].updateDoc.$set.birthState, "Baja California");
    assert.equal(updateManyCalls[0].updateDoc.$set.birthCity, "Mexicali");
    assert.equal(updateManyCalls[0].updateDoc.$set.phone, "+442079460056");
    assert.equal(updateManyCalls[0].updateDoc.$set.phoneDigits, "442079460056");
    assert.equal(updateManyCalls[0].updateDoc.$set.phoneCountry, "United Kingdom");
    assert.equal(updateManyCalls[0].updateDoc.$set.phoneCountryIso, "GB");
    assert.equal(userUpdateCalls.length, 1);
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
    assert.equal(updateManyCalls[0].updateDoc.$set.approvedSnapshot.unset.birthCountry, 1);
    assert.equal(updateManyCalls[0].updateDoc.$set.approvedSnapshot.unset.birthState, 1);
    assert.equal(updateManyCalls[0].updateDoc.$set.approvedSnapshot.unset.birthCity, 1);
    assert.deepEqual(updateManyCalls[0].options, { timestamps: false, session: decisionSession });
    assert.equal(historyCalls.length, 1);
    assert.equal(historyCalls[0].approvedFromProfile, "profile-id");
    assert.equal(historyCalls[0].approvedAt, updateManyCalls[0].updateDoc.$set.approvedAt);
    assert.equal(userUpdateCalls.length, 1);
    assert.deepEqual(findCalls[0].populate, { path: "createdBy", select: "name email" });
  } finally {
    restoreModelMethods();
  }
});

test("approveChildProfileService updates minor fullname and minorKey on parent approval", async () => {
  restoreModelMethods();

  const target = makeChildPatient();
  const findOneCalls = mockPatientFindOne(target);
  const findCalls = mockFlexiblePatientFindSequence([
    { kind: "selectLean", value: [] },
    {
      kind: "sortPopulateLean",
      value: [
        makeChildPatient({
          fullname: "Corrected Minor",
          minorKey: "parent@example.com::corrected minor",
        }),
      ],
    },
  ]);
  const updateManyCalls = mockPatientUpdateMany();
  const updateOneCalls = mockPatientUpdateOne();
  const historyCalls = mockPatientHistoryCreate();
  guardAppointmentDeathArchive();

  try {
    const result = await approveChildProfileService({
      user: makePatientUser({ email: "Parent@Example.com" }),
      profileId: "child-profile-id",
    });

    assert.equal(result.ok, true);
    assert.equal(result.pendingDecision, false);
    assert.equal(findOneCalls[0]._id, "child-profile-id");
    assert.equal(findOneCalls[0].parentEmail, "parent@example.com");
    assert.equal(updateManyCalls.length, 1);
    assertCurrentMinorQuery(updateManyCalls[0].query, {
      parentEmail: "parent@example.com",
      minorKey: "parent@example.com::minor patient",
    });
    assert.equal(updateManyCalls[0].updateDoc.$set.fullname, "Corrected Minor");
    assert.equal(updateManyCalls[0].updateDoc.$set.minorKey, "parent@example.com::corrected minor");
    assert.equal(
      updateManyCalls[0].updateDoc.$set.approvedSnapshot.set.fullname,
      "Corrected Minor"
    );
    assert.deepEqual(updateManyCalls[0].options, { timestamps: false, session: decisionSession });
    assert.equal(updateOneCalls.length, 0);
    assert.equal(historyCalls.length, 1);
    assert.equal(historyCalls[0].patientKey, "parent@example.com::corrected minor");
    assert.equal(findCalls[0].select, "_id children childrenCount approvedSnapshot");
    assert.deepEqual(findCalls[1].populate, { path: "createdBy", select: "name email role" });
  } finally {
    restoreModelMethods();
  }
});

test("approveChildProfileService archives future active appointments when guardian approves minor death", async () => {
  restoreModelMethods();

  const target = makeChildPatient({
    fullname: "Minor Patient",
    isDeceased: true,
    dateOfDeath: new Date("2026-01-15T12:00:00.000Z"),
    causeOfDeath: "Accident",
    approvedSnapshot: {
      set: {
        fullname: "Minor Patient",
        age: 10,
        ageCategory: "0-12",
        bloodtype: "O+",
        gender: "female",
        organDonor: false,
        bloodDonor: false,
        measurementSystem: "metric",
        heightM: 1.35,
        weightKg: 32,
        country: "United States",
        state: "California",
        city: "San Diego",
        diseases: [],
        allergies: [],
        medications: [],
        children: [],
        birthDate: new Date("2016-01-01T12:00:00.000Z"),
        isDeceased: false,
      },
      unset: { dateOfDeath: 1, causeOfDeath: 1 },
    },
  });

  mockPatientFindOne(target);
  mockFlexiblePatientFindSequence([
    { kind: "lean", value: [] },
    {
      kind: "sortPopulateLean",
      value: [target],
    },
  ]);
  const updateManyCalls = mockPatientUpdateMany();
  const updateOneCalls = mockPatientUpdateOne();
  const historyCalls = mockPatientHistoryCreate();
  const appointmentArchiveCalls = mockAppointmentDeathArchive();

  try {
    const result = await approveChildProfileService({
      user: makePatientUser({ email: "Parent@Example.com" }),
      profileId: "child-profile-id",
    });

    assert.equal(result.ok, true);
    assert.equal(result.pendingDecision, false);
    assert.equal(updateManyCalls.length, 1);
    assert.equal(updateManyCalls[0].updateDoc.$set.isDeceased, true);
    assert.equal(updateManyCalls[0].updateDoc.$set.causeOfDeath, "Accident");
    assert.equal(updateManyCalls[0].updateDoc.$set.dateOfDeath.toISOString().slice(0, 10), "2026-01-15");
    assert.equal(updateOneCalls.length, 0);
    assert.equal(historyCalls.length, 1);
    assert.equal(historyCalls[0].patientKey, "parent@example.com::minor patient");
    assert.equal(historyCalls[0].eventType, "deathRecorded");
    assert.deepEqual(appointmentArchiveCalls, [
      {
        query: {
          patient: target._id,
          status: { $in: ["pending", "accepted"] },
          start: { $gte: updateManyCalls[0].updateDoc.$set.approvedAt },
        },
        updateDoc: { $set: { status: "cancelled_due_to_death" } },
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("approveChildProfileService updates parent children and approved snapshot children on rename", async () => {
  restoreModelMethods();

  const target = makeChildPatient();
  const parentDoc = {
    _id: "parent-profile-id",
    children: [{ name: "Minor Patient" }, { name: "Sibling Child" }],
    childrenCount: 2,
    approvedSnapshot: {
      set: {
        fullname: "Parent Profile",
        children: [{ name: "Minor Patient" }, { name: "Sibling Child" }],
        childrenCount: 2,
      },
    },
  };

  mockPatientFindOne(target);
  mockFlexiblePatientFindSequence([
    { kind: "selectLean", value: [parentDoc] },
    {
      kind: "sortPopulateLean",
      value: [
        makeChildPatient({
          fullname: "Corrected Minor",
          minorKey: "parent@example.com::corrected minor",
        }),
      ],
    },
  ]);
  mockPatientUpdateMany();
  const updateOneCalls = mockPatientUpdateOne();
  mockPatientHistoryCreate();

  try {
    const result = await approveChildProfileService({
      user: makePatientUser({ email: "Parent@Example.com" }),
      profileId: "child-profile-id",
    });

    assert.equal(result.ok, true);
    assert.equal(updateOneCalls.length, 1);
    assert.deepEqual(updateOneCalls[0].query, { _id: "parent-profile-id" });
    assert.equal(updateOneCalls[0].updateDoc.$set.children[0].name, "Corrected Minor");
    assert.equal(updateOneCalls[0].updateDoc.$set.children[1].name, "Sibling Child");
    assert.equal(updateOneCalls[0].updateDoc.$set.childrenCount, 2);
    assert.equal(
      updateOneCalls[0].updateDoc.$set["approvedSnapshot.set.children"][0].name,
      "Corrected Minor"
    );
    assert.equal(updateOneCalls[0].updateDoc.$set["approvedSnapshot.set.childrenCount"], 2);
    assert.deepEqual(updateOneCalls[0].options, { timestamps: false, session: decisionSession });
  } finally {
    restoreModelMethods();
  }
});

test("rejectChildProfileService restores previous approved fullname and old minorKey for rename", async () => {
  restoreModelMethods();

  const target = makeChildPatient({
    fullname: "Corrected Minor",
    minorKey: "parent@example.com::minor patient",
  });

  mockPatientFindOne(target);
  const findCalls = mockFlexiblePatientFindSequence([
    { kind: "sortLean", value: [target] },
    {
      kind: "sortPopulateLean",
      value: [
        makeChildPatient({
          fullname: "Minor Patient",
          minorKey: "parent@example.com::minor patient",
        }),
      ],
    },
  ]);
  const updateManyCalls = mockPatientUpdateMany();
  const historyCalls = mockPatientHistoryCreate();

  Patient.updateOne = async () => {
    throw new Error("Parent children should not be updated when rejecting a child rename");
  };

  try {
    const result = await rejectChildProfileService({
      user: makePatientUser({ email: "Parent@Example.com" }),
      profileId: "child-profile-id",
    });

    assert.equal(result.ok, true);
    assert.equal(result.pendingDecision, false);
    assertCurrentMinorQuery(findCalls[0].query, {
      parentEmail: "parent@example.com",
      minorKey: "parent@example.com::minor patient",
    });
    assert.equal(updateManyCalls.length, 1);
    assert.deepEqual(updateManyCalls[0].query, {
      _id: target._id,
      parentEmail: "parent@example.com",
      minorKey: "parent@example.com::minor patient",
    });
    assert.equal(updateManyCalls[0].updateDoc.$set.fullname, "Minor Patient");
    assert.equal(updateManyCalls[0].updateDoc.$set.minorKey, "parent@example.com::minor patient");
    assert.equal(updateManyCalls[0].updateDoc.$set.approvedAt, target.approvedAt);
    assert.equal(historyCalls.length, 1);
    assert.equal(historyCalls[0].eventType, "rejected");
    assert.equal(historyCalls[0].approvedFromProfile, target._id);
    assert.equal(historyCalls[0].proposedAt, target.updatedAt);
    assert.equal(historyCalls[0].editedBy, target.lastEditedBy || target.createdBy);
    assert.ok(historyCalls[0].eventAt > target.updatedAt);
    assert.equal(historyCalls[0].proposedSnapshot.set.fullname, "Corrected Minor");
    assert.equal(historyCalls[0].approvedSnapshot, undefined);
    assert.deepEqual(updateManyCalls[0].options, { timestamps: false, session: decisionSession });
  } finally {
    restoreModelMethods();
  }
});

test("rejectChildProfileService restores optional minor phone country from previous profile", async () => {
  restoreModelMethods();

  const target = makeChildPatient({
    _id: "child-profile-id",
    fullname: "Pending Minor",
    phone: "+16195550101",
    phoneDigits: "16195550101",
    phoneCountry: "United States",
    phoneCountryIso: "US",
    country: "United States",
    state: "California",
    city: "San Diego",
    approvedSnapshot: null,
    updatedAt: new Date("2026-01-03T12:00:00.000Z"),
  });
  const previous = makeChildPatient({
    _id: "previous-child-profile-id",
    fullname: "Minor Patient",
    phone: "+442079460056",
    phoneDigits: "442079460056",
    phoneCountry: "United Kingdom",
    phoneCountryIso: "GB",
    country: "Mexico",
    state: "Ciudad de Mexico",
    city: "Mexico City",
    approvedSnapshot: null,
    updatedAt: new Date("2026-01-01T12:00:00.000Z"),
  });

  mockPatientFindOne(target);
  mockFlexiblePatientFindSequence([
    { kind: "sortLean", value: [target, previous] },
    { kind: "sortPopulateLean", value: [previous] },
  ]);
  const updateManyCalls = mockPatientUpdateMany();
  mockPatientHistoryCreate();

  Patient.updateOne = async () => {
    throw new Error("Parent children should not be updated when rejecting a child phone change");
  };

  try {
    const result = await rejectChildProfileService({
      user: makePatientUser({ email: "Parent@Example.com" }),
      profileId: "child-profile-id",
    });

    assert.equal(result.ok, true);
    assert.equal(updateManyCalls.length, 1);
    assert.equal(updateManyCalls[0].query._id, target._id);
    assert.equal(updateManyCalls[0].updateDoc.$set.country, "Mexico");
    assert.equal(updateManyCalls[0].updateDoc.$set.state, "Ciudad de Mexico");
    assert.equal(updateManyCalls[0].updateDoc.$set.city, "Mexico City");
    assert.equal(updateManyCalls[0].updateDoc.$set.phone, "+442079460056");
    assert.equal(updateManyCalls[0].updateDoc.$set.phoneDigits, "442079460056");
    assert.equal(updateManyCalls[0].updateDoc.$set.phoneCountry, "United Kingdom");
    assert.equal(updateManyCalls[0].updateDoc.$set.phoneCountryIso, "GB");
  } finally {
    restoreModelMethods();
  }
});

test("an initial minor rejection retains an audit row in the transaction and preserves deletion", async (t) => {
  const target = makeChildPatient({ approvedAt: undefined, approvedSnapshot: undefined });
  mockPatientFindOne(target);
  mockFlexiblePatientFindSequence([{ kind: "sortLean", value: [target] }]);
  mockPatientUpdateMany();
  const history = t.mock.method(PatientHistory, "create", async ([entry], { session }) => {
    assert.equal(session, decisionSession);
    assert.equal(entry.eventType, "rejected");
    assert.equal(entry.approvedFromProfile, target._id);
    assert.equal(entry.proposedAt, target.updatedAt);
  });
  t.mock.method(Diagnosis, "deleteMany", async (query, { session }) => {
    assert.deepEqual(query, { patient: target._id });
    assert.equal(session, decisionSession);
  });
  t.mock.method(Patient, "deleteOne", async (query, { session }) => {
    assert.deepEqual(query, { _id: target._id, parentEmail: target.parentEmail });
    assert.equal(session, decisionSession);
  });
  t.after(restoreModelMethods);

  const user = makePatientUser({ email: target.parentEmail });
  assert.equal((await rejectChildProfileService({ user, profileId: target._id })).hasRecords, false);
  mockPatientFindOne(null);
  await assert.rejects(rejectChildProfileService({ user, profileId: target._id }), { status: 404 });
  assert.equal(history.mock.callCount(), 1);
});

test("settled and stale child decisions cannot create another rejection or restore any profile", async (t) => {
  const target = makeChildPatient();
  const history = t.mock.method(PatientHistory, "create", async () => assert.fail("Unexpected audit write"));
  const writes = mockPatientUpdateMany();
  t.after(restoreModelMethods);
  const user = makePatientUser({ email: target.parentEmail });
  mockPatientFindOne({ ...target, updatedAt: target.approvedAt });
  await assert.rejects(rejectChildProfileService({ user, profileId: target._id }), {
    status: 409, errorCode: "PATIENT_REVIEW_CHANGED",
  });
  mockPatientFindOne(target);
  await assert.rejects(rejectChildProfileService({
    user, profileId: target._id, expectedUpdatedAt: target.approvedAt.toISOString(),
  }), { status: 409, errorCode: "PATIENT_REVIEW_CHANGED" });
  assert.equal(history.mock.callCount(), 0);
  assert.equal(writes.length, 0);
});

test("a failed minor rejection audit insert prevents deletion or restoration in the same transaction", async (t) => {
  const target = makeChildPatient();
  mockPatientFindOne(target);
  mockFlexiblePatientFindSequence([{ kind: "sortLean", value: [target] }]);
  const writes = mockPatientUpdateMany();
  t.mock.method(PatientHistory, "create", async (_events, { session }) => {
    assert.equal(session, decisionSession);
    throw new Error("Synthetic audit insert failure");
  });
  t.after(restoreModelMethods);
  await assert.rejects(rejectChildProfileService({
    user: makePatientUser({ email: target.parentEmail }), profileId: target._id,
  }), /Synthetic audit insert failure/);
  assert.equal(writes.length, 0);
});

test("a legacy string death date does not reopen a confirmed child's review", async (t) => {
  const target = makeChildPatient({
    isDeceased: true,
    dateOfDeath: new Date("2026-01-20T12:00:00Z"),
    causeOfDeath: "Synthetic cause",
    approvedSnapshot: {
      set: { isDeceased: true, dateOfDeath: "2026-01-20", causeOfDeath: "Synthetic cause" },
    },
  });
  mockPatientFindOne(target);
  mockPatientUpdateMany();
  t.after(restoreModelMethods);
  await assert.rejects(rejectChildProfileService({
    user: makePatientUser({ email: target.parentEmail }), profileId: target._id,
  }), { status: 409, errorCode: "PATIENT_DECEASED_READ_ONLY" });
});
