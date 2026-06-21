import assert from "node:assert/strict";
import { after, test } from "node:test";

import Patient from "../../../models/Patient.js";
import User from "../../../models/User.js";
import {
  getMyChildrenHealthInfoService,
  getMyHealthInfoService,
} from "../../../services/patients/patientPortalService.js";

const originalPatientMethods = {
  find: Patient.find,
  populate: Patient.populate,
};

const originalUserMethods = {
  findById: User.findById,
};

after(() => {
  restoreModelMethods();
});

function restoreModelMethods() {
  Patient.find = originalPatientMethods.find;
  Patient.populate = originalPatientMethods.populate;
  User.findById = originalUserMethods.findById;
}

function makePatientUser(overrides = {}) {
  return {
    _id: "patient-user-id",
    role: "patient",
    email: "Patient@Example.com ",
    ...overrides,
  };
}

function makeDoctorRef(id, name, email) {
  return {
    name,
    email,
    toString: () => id,
  };
}

function makePatient(overrides = {}) {
  return {
    _id: "patient-profile-id",
    fullname: "Patient Profile",
    email: "patient@example.com",
    phone: "+16195550101",
    phoneDigits: "16195550101",
    birthDate: new Date("1990-01-01T12:00:00.000Z"),
    age: 36,
    ageCategory: "18-59",
    bloodtype: "O+",
    gender: "female",
    organDonor: true,
    bloodDonor: false,
    measurementSystem: "metric",
    heightM: 1.7,
    weightKg: 70,
    bmi: 24.2,
    bmiCategory: "healthy",
    country: "United States",
    state: "California",
    city: "San Diego",
    diseases: [],
    allergies: [],
    medications: [],
    isDeceased: false,
    createdBy: makeDoctorRef("doctor-id", "Dr. Owner", "doctor@example.com"),
    updatedAt: new Date("2026-01-02T12:00:00.000Z"),
    approvedAt: new Date("2026-01-02T12:00:00.000Z"),
    approvedSnapshot: null,
    ...overrides,
  };
}

function makeChildPatient(overrides = {}) {
  return makePatient({
    _id: "child-profile-id",
    fullname: "Minor Patient",
    email: undefined,
    parentEmail: "parent@example.com",
    minorKey: "parent@example.com::minor-patient",
    birthDate: new Date("2015-01-01T12:00:00.000Z"),
    age: 11,
    ageCategory: "0-12",
    phone: undefined,
    phoneDigits: undefined,
    updatedAt: new Date("2026-01-02T12:00:00.000Z"),
    approvedAt: new Date("2026-01-02T12:00:00.000Z"),
    ...overrides,
  });
}

function mockPatientFind(response) {
  const calls = [];

  Patient.find = (query) => {
    const call = {
      query,
      sort: undefined,
      populate: undefined,
      leanOptions: undefined,
    };
    calls.push(call);

    return {
      sort: (sort) => {
        call.sort = sort;
        return {
          populate: (path, select) => {
            call.populate = { path, select };
            return {
              lean: async (leanOptions) => {
                call.leanOptions = leanOptions;
                return response;
              },
            };
          },
          lean: async (leanOptions) => {
            call.leanOptions = leanOptions;
            return response;
          },
        };
      },
    };
  };

  return calls;
}

function mockPatientPopulate() {
  const calls = [];

  Patient.populate = async (docs, options) => {
    calls.push({ docs, options });
    return docs;
  };

  return calls;
}

function mockUserFindById(response) {
  const calls = [];

  User.findById = (id) => {
    const call = { id, select: undefined };
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

function guardPatientAndUserQueries() {
  Patient.find = () => {
    throw new Error("Patient.find should not be called in this rejection path");
  };
  Patient.populate = () => {
    throw new Error("Patient.populate should not be called in this rejection path");
  };
  User.findById = () => {
    throw new Error("User.findById should not be called in this rejection path");
  };
}

test("getMyHealthInfoService rejects non-patient role with 403 and does not query Patient or User", async () => {
  restoreModelMethods();
  guardPatientAndUserQueries();

  try {
    await assert.rejects(
      () =>
        getMyHealthInfoService({
          user: { _id: "doctor-id", role: "doctor", email: "doctor@example.com" },
          req: { query: {} },
        }),
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

test("getMyHealthInfoService scopes lookup to normalized user email and ignores request email fields", async () => {
  restoreModelMethods();

  const pats = [makePatient()];
  const findCalls = mockPatientFind(pats);
  const populateCalls = mockPatientPopulate();
  const userFindCalls = mockUserFindById({
    lastHealthDecisionAt: new Date("2026-01-03T12:00:00.000Z"),
  });

  try {
    const result = await getMyHealthInfoService({
      user: makePatientUser(),
      req: {
        body: { email: "other@example.com" },
        query: { email: "other@example.com" },
      },
    });

    assert.equal(result.snapshot.email, "patient@example.com");
    assert.deepEqual(findCalls, [
      {
        query: { email: "patient@example.com" },
        sort: { updatedAt: -1 },
        populate: { path: "createdBy", select: "name email" },
        leanOptions: undefined,
      },
    ]);
    assert.equal(populateCalls.length, 1);
    assert.equal(populateCalls[0].docs, pats);
    assert.deepEqual(populateCalls[0].options, {
      path: "createdBy",
      select: "name email",
    });
    assert.deepEqual(userFindCalls, [
      { id: "patient-user-id", select: "lastHealthDecisionAt" },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("getMyHealthInfoService returns pendingDecision true when latest patient update is newer than user decision", async () => {
  restoreModelMethods();

  mockPatientFind([
    makePatient({ updatedAt: new Date("2026-01-03T12:00:00.000Z") }),
  ]);
  mockPatientPopulate();
  mockUserFindById({
    lastHealthDecisionAt: new Date("2026-01-02T12:00:00.000Z"),
  });

  try {
    const result = await getMyHealthInfoService({
      user: makePatientUser(),
      req: { query: {} },
    });

    assert.equal(result.pendingDecision, true);
  } finally {
    restoreModelMethods();
  }
});

test("getMyHealthInfoService returns pendingDecision false when user decision is current", async () => {
  restoreModelMethods();

  mockPatientFind([
    makePatient({ updatedAt: new Date("2026-01-03T12:00:00.000Z") }),
  ]);
  mockPatientPopulate();
  mockUserFindById({
    lastHealthDecisionAt: new Date("2026-01-03T12:00:00.000Z"),
  });

  try {
    const result = await getMyHealthInfoService({
      user: makePatientUser(),
      req: { query: {} },
    });

    assert.equal(result.pendingDecision, false);
  } finally {
    restoreModelMethods();
  }
});

test("getMyHealthInfoService applies approvedSnapshot baseline when pending with one approved snapshot", async () => {
  restoreModelMethods();

  const approvedAt = new Date("2026-01-01T12:00:00.000Z");
  mockPatientFind([
    makePatient({
      fullname: "Current Name",
      diseases: ["current disease"],
      approvedAt,
      approvedSnapshot: {
        set: {
          fullname: "Approved Name",
          diseases: ["baseline disease"],
        },
        unset: {},
      },
      updatedAt: new Date("2026-01-03T12:00:00.000Z"),
    }),
  ]);
  mockPatientPopulate();
  mockUserFindById({
    lastHealthDecisionAt: new Date("2026-01-02T12:00:00.000Z"),
  });

  try {
    const result = await getMyHealthInfoService({
      user: makePatientUser(),
      req: { query: {} },
    });

    assert.equal(result.pendingDecision, true);
    assert.equal(result.snapshot.fullnameWrapper.changed, true);
    assert.deepEqual(result.snapshot.fullnameWrapper.alternatives, [
      "Current Name",
      "Approved Name",
    ]);
    assert.deepEqual(result.snapshot.commonDiseases, ["baseline disease"]);
    assert.deepEqual(result.snapshot.diseasesCombined, [
      "current disease",
      "baseline disease",
    ]);
    assert.equal(result.snapshot.diseasesChanged, true);
    assert.equal(result.snapshot.approvedBaselineAt, approvedAt);
  } finally {
    restoreModelMethods();
  }
});

test("getMyHealthInfoService does not apply approvedSnapshot baseline when no decision is pending", async () => {
  restoreModelMethods();

  mockPatientFind([
    makePatient({
      fullname: "Current Name",
      diseases: ["current disease"],
      approvedSnapshot: {
        set: {
          fullname: "Approved Name",
          diseases: ["baseline disease"],
        },
        unset: {},
      },
      updatedAt: new Date("2026-01-03T12:00:00.000Z"),
    }),
  ]);
  mockPatientPopulate();
  mockUserFindById({
    lastHealthDecisionAt: new Date("2026-01-03T12:00:00.000Z"),
  });

  try {
    const result = await getMyHealthInfoService({
      user: makePatientUser(),
      req: { query: {} },
    });

    assert.equal(result.pendingDecision, false);
    assert.equal(result.snapshot.fullnameWrapper.changed, undefined);
    assert.deepEqual(result.snapshot.fullnameWrapper.alternatives, ["Current Name"]);
    assert.deepEqual(result.snapshot.commonDiseases, ["current disease"]);
    assert.equal(result.snapshot.diseasesChanged, undefined);
    assert.equal(result.snapshot.approvedBaselineAt, undefined);
  } finally {
    restoreModelMethods();
  }
});

test("getMyChildrenHealthInfoService rejects non-patient role with 403", async () => {
  restoreModelMethods();
  guardPatientAndUserQueries();

  try {
    await assert.rejects(
      () =>
        getMyChildrenHealthInfoService({
          user: { _id: "doctor-id", role: "doctor", email: "doctor@example.com" },
          req: { query: {} },
        }),
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

test("getMyChildrenHealthInfoService applies approvedSnapshot phone baseline when pending", async () => {
  restoreModelMethods();

  const currentPhone = "+16195550101";
  const previousApprovedPhone = "+442079460056";

  mockPatientFind([
    makeChildPatient({
      phone: currentPhone,
      phoneDigits: "16195550101",
      approvedAt: new Date("2026-01-01T12:00:00.000Z"),
      approvedSnapshot: {
        set: {
          phone: previousApprovedPhone,
        },
        unset: {},
      },
      updatedAt: new Date("2026-01-03T12:00:00.000Z"),
    }),
  ]);

  User.findById = () => {
    throw new Error("User.findById should not be called for children health info");
  };

  try {
    const result = await getMyChildrenHealthInfoService({
      user: makePatientUser({
        _id: "parent-user-id",
        email: "Parent@Example.com ",
      }),
      req: { query: {} },
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].pendingDecision, true);
    assert.equal(result[0].snapshot.phone.changed, true);
    assert.deepEqual(result[0].snapshot.phone.alternatives, [
      currentPhone,
      previousApprovedPhone,
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("getMyChildrenHealthInfoService queries only by normalized parentEmail plus minor query", async () => {
  restoreModelMethods();

  const findCalls = mockPatientFind([]);
  User.findById = () => {
    throw new Error("User.findById should not be called for children health info");
  };

  try {
    const result = await getMyChildrenHealthInfoService({
      user: makePatientUser({
        _id: "parent-user-id",
        email: " Parent@Example.com ",
      }),
      req: { query: {} },
    });

    assert.deepEqual(result, []);
    assert.equal(findCalls.length, 1);
    assert.deepEqual(Object.keys(findCalls[0].query).sort(), ["$or", "parentEmail"]);
    assert.equal(findCalls[0].query.parentEmail, "parent@example.com");
    assert.equal(Array.isArray(findCalls[0].query.$or), true);
    assert.equal(findCalls[0].query.$or.length, 3);
    assert.ok(findCalls[0].query.$or[0].birthDate.$gt instanceof Date);
    assert.deepEqual(findCalls[0].query.$or[1], {
      birthDate: { $exists: false },
      age: { $lt: 18 },
    });
    assert.deepEqual(findCalls[0].query.$or[2], {
      birthDate: null,
      age: { $lt: 18 },
    });
    assert.deepEqual(findCalls[0].sort, { updatedAt: -1 });
    assert.deepEqual(findCalls[0].populate, {
      path: "createdBy",
      select: "name email role",
    });
    assert.deepEqual(findCalls[0].leanOptions, { virtuals: true });
  } finally {
    restoreModelMethods();
  }
});

test("getMyChildrenHealthInfoService source metadata only comes from returned child records", async () => {
  restoreModelMethods();

  const unrelatedChild = makeChildPatient({
    _id: "unrelated-child-id",
    parentEmail: "other-parent@example.com",
    createdBy: makeDoctorRef(
      "unrelated-doctor-id",
      "Dr. Unrelated",
      "unrelated@example.com"
    ),
  });
  const returnedChildren = [
    makeChildPatient({
      _id: "child-profile-id",
      createdBy: makeDoctorRef("doctor-one-id", "Dr. Child One", "one@example.com"),
    }),
    makeChildPatient({
      _id: "child-profile-two-id",
      updatedAt: new Date("2026-01-01T12:00:00.000Z"),
      createdBy: makeDoctorRef("doctor-two-id", "Dr. Child Two", "two@example.com"),
    }),
  ];

  mockPatientFind(returnedChildren);
  User.findById = () => {
    throw new Error("User.findById should not be called for children health info");
  };

  try {
    const result = await getMyChildrenHealthInfoService({
      user: makePatientUser({
        _id: "parent-user-id",
        email: "Parent@Example.com ",
      }),
      req: { query: {} },
    });

    assert.equal(unrelatedChild.createdBy.name, "Dr. Unrelated");
    assert.equal(result.length, 1);
    assert.equal(result[0].profileId, "child-profile-id");
    assert.equal(result[0].parentEmail, "parent@example.com");

    const sourceDoctorNames = result[0].snapshot.sources.map(
      (source) => source.doctorName
    );
    const sourceDoctorEmails = result[0].snapshot.sources.map(
      (source) => source.doctorEmail
    );

    assert.deepEqual(sourceDoctorNames, ["Dr. Child One", "Dr. Child Two"]);
    assert.deepEqual(sourceDoctorEmails, ["one@example.com", "two@example.com"]);
    assert.equal(sourceDoctorNames.includes("Dr. Unrelated"), false);
    assert.equal(sourceDoctorEmails.includes("unrelated@example.com"), false);
  } finally {
    restoreModelMethods();
  }
});
