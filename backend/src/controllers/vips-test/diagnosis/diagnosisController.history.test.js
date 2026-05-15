import assert from "node:assert/strict";
import { after, test } from "node:test";

import Diagnosis from "../../../models/Diagnosis.js";
import DiagnosisHistory from "../../../models/DiagnosisHistory.js";
import Patient from "../../../models/Patient.js";
import {
  getDiagnosisHistory,
  getDiagnosisHistoryOne,
} from "../../diagnosisController.js";

const originalDiagnosisMethods = {
  findById: Diagnosis.findById,
};

const originalPatientMethods = {
  exists: Patient.exists,
};

const originalDiagnosisHistoryMethods = {
  find: DiagnosisHistory.find,
  findOne: DiagnosisHistory.findOne,
};

after(() => {
  restoreModelMethods();
});

function restoreModelMethods() {
  Diagnosis.findById = originalDiagnosisMethods.findById;
  Patient.exists = originalPatientMethods.exists;
  DiagnosisHistory.find = originalDiagnosisHistoryMethods.find;
  DiagnosisHistory.findOne = originalDiagnosisHistoryMethods.findOne;
}

function makeReq(overrides = {}) {
  return {
    body: {},
    params: { id: "diagnosis-id", historyId: "history-id" },
    query: {},
    user: { _id: "doctor-id", role: "doctor", email: "doctor@example.com" },
    ...overrides,
  };
}

function makeRes() {
  return {
    body: undefined,
    statusCode: 200,
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

function makeDiagnosis(overrides = {}) {
  return {
    _id: "diagnosis-id",
    patient: "patient-id",
    createdBy: "doctor-id",
    ...overrides,
  };
}

function mockDiagnosisFindById(response) {
  const calls = [];

  Diagnosis.findById = async (id) => {
    calls.push(id);
    return response;
  };

  return calls;
}

function mockPatientExists(response) {
  const calls = [];

  Patient.exists = async (query) => {
    calls.push(query);
    return response;
  };

  return calls;
}

function mockDiagnosisHistoryFind(response) {
  const calls = [];

  DiagnosisHistory.find = (query) => {
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

function mockDiagnosisHistoryFindOne(response) {
  const calls = [];

  DiagnosisHistory.findOne = (query) => {
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

function guardPatientExists() {
  Patient.exists = async () => {
    throw new Error("Patient.exists should not be called for this access path");
  };
}

function guardDiagnosisHistoryLookup() {
  DiagnosisHistory.find = () => {
    throw new Error("DiagnosisHistory.find should not be called before access is allowed");
  };
  DiagnosisHistory.findOne = () => {
    throw new Error("DiagnosisHistory.findOne should not be called before access is allowed");
  };
}

test("getDiagnosisHistory returns 404 when diagnosis does not exist", async () => {
  restoreModelMethods();

  const findByIdCalls = mockDiagnosisFindById(null);
  guardDiagnosisHistoryLookup();

  const req = makeReq();
  const res = makeRes();

  try {
    await getDiagnosisHistory(req, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: "Diagnostic not found" });
    assert.deepEqual(findByIdCalls, ["diagnosis-id"]);
  } finally {
    restoreModelMethods();
  }
});

test("getDiagnosisHistory rejects doctor when doctor did not create the diagnosis with 403", async () => {
  restoreModelMethods();

  mockDiagnosisFindById(makeDiagnosis({ createdBy: "other-doctor-id" }));
  guardPatientExists();
  guardDiagnosisHistoryLookup();

  const req = makeReq();
  const res = makeRes();

  try {
    await getDiagnosisHistory(req, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Not authorized" });
  } finally {
    restoreModelMethods();
  }
});

test("getDiagnosisHistory rejects doctor when doctor created the diagnosis but no longer owns the patient with 403", async () => {
  restoreModelMethods();

  mockDiagnosisFindById(makeDiagnosis());
  const existsCalls = mockPatientExists(null);
  guardDiagnosisHistoryLookup();

  const req = makeReq();
  const res = makeRes();

  try {
    await getDiagnosisHistory(req, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Not authorized" });
    assert.deepEqual(existsCalls, [
      {
        _id: "patient-id",
        $or: [{ owners: "doctor-id" }, { createdBy: "doctor-id" }],
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("getDiagnosisHistory rejects patient when diagnosis patient does not match req.user.email with 403", async () => {
  restoreModelMethods();

  mockDiagnosisFindById(makeDiagnosis({ createdBy: "doctor-id" }));
  const existsCalls = mockPatientExists(null);
  guardDiagnosisHistoryLookup();

  const req = makeReq({
    user: {
      _id: "patient-user-id",
      role: "patient",
      email: "Patient@Example.com ",
    },
  });
  const res = makeRes();

  try {
    await getDiagnosisHistory(req, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Not authorized" });
    assert.deepEqual(existsCalls, [
      { _id: "patient-id", email: "patient@example.com" },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("getDiagnosisHistory rejects unsupported role with 403", async () => {
  restoreModelMethods();

  mockDiagnosisFindById(makeDiagnosis());
  guardPatientExists();
  guardDiagnosisHistoryLookup();

  const req = makeReq({
    user: { _id: "admin-id", role: "admin", email: "admin@example.com" },
  });
  const res = makeRes();

  try {
    await getDiagnosisHistory(req, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Insufficient role" });
  } finally {
    restoreModelMethods();
  }
});

test("getDiagnosisHistoryOne returns 404 when history version does not exist", async () => {
  restoreModelMethods();

  mockDiagnosisFindById(makeDiagnosis());
  const existsCalls = mockPatientExists({ _id: "patient-id" });
  const findOneCalls = mockDiagnosisHistoryFindOne(null);

  const req = makeReq();
  const res = makeRes();

  try {
    await getDiagnosisHistoryOne(req, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: "History version not found" });
    assert.deepEqual(existsCalls, [
      {
        _id: "patient-id",
        $or: [{ owners: "doctor-id" }, { createdBy: "doctor-id" }],
      },
    ]);
    assert.deepEqual(findOneCalls, [
      {
        query: { _id: "history-id", diagnosisId: "diagnosis-id" },
        populate: { path: "editedBy", select: "name email" },
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("getDiagnosisHistoryOne rejects unauthorized doctor before history lookup", async () => {
  restoreModelMethods();

  mockDiagnosisFindById(makeDiagnosis());
  const existsCalls = mockPatientExists(null);
  guardDiagnosisHistoryLookup();

  const req = makeReq();
  const res = makeRes();

  try {
    await getDiagnosisHistoryOne(req, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Not authorized" });
    assert.deepEqual(existsCalls, [
      {
        _id: "patient-id",
        $or: [{ owners: "doctor-id" }, { createdBy: "doctor-id" }],
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("getDiagnosisHistoryOne rejects unauthorized patient before history lookup", async () => {
  restoreModelMethods();

  mockDiagnosisFindById(makeDiagnosis());
  const existsCalls = mockPatientExists(null);
  guardDiagnosisHistoryLookup();

  const req = makeReq({
    user: {
      _id: "patient-user-id",
      role: "patient",
      email: "Patient@Example.com ",
    },
  });
  const res = makeRes();

  try {
    await getDiagnosisHistoryOne(req, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Not authorized" });
    assert.deepEqual(existsCalls, [
      { _id: "patient-id", email: "patient@example.com" },
    ]);
  } finally {
    restoreModelMethods();
  }
});
