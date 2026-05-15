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
    const call = { query, sort: undefined, populate: undefined };
    calls.push(call);
    return {
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
          "email phoneDigits minorKey parentEmail fullname approvedSnapshot approvedAt lastEditedBy createdBy",
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
        select: "email phoneDigits minorKey parentEmail fullname",
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
        query: { patientEmail: "patient@example.com" },
        sort: { approvedAt: -1 },
        populate: { path: "editedBy", select: "name email" },
      },
    ]);
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
        populate: { path: "editedBy", select: "name email" },
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
    assert.equal(findOneCalls[0].select, "minorKey fullname parentEmail");
  } finally {
    restoreModelMethods();
  }
});

test("getChildHistoryOneService scopes single child history lookup to the parent's child key", async () => {
  restoreModelMethods();

  mockPatientFindOne({
    _id: "child-profile-id",
    fullname: "Minor Patient",
    parentEmail: "patient@example.com",
    minorKey: "patient@example.com::minor-patient",
  });
  const historyFindOneCalls = mockPatientHistoryFindOne({
    _id: "history-id",
    approvedSnapshot: null,
    approvedAt: new Date("2026-01-01T00:00:00.000Z"),
  });

  try {
    const result = await getChildHistoryOneService({
      user: makePatientUser(),
      childId: "child-profile-id",
      historyId: "history-id",
      req: { query: { lang: "en" } },
    });

    assert.equal(result._id, "history-id");
    assert.deepEqual(historyFindOneCalls, [
      {
        query: {
          _id: "history-id",
          patientKey: "patient@example.com::minor-patient",
        },
        populate: { path: "editedBy", select: "name email role" },
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});
