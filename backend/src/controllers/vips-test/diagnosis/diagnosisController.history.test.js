import assert from "node:assert/strict";
import { after, test } from "node:test";

import Diagnosis from "../../../models/Diagnosis.js";
import DiagnosisHistory from "../../../models/DiagnosisHistory.js";
import Patient from "../../../models/Patient.js";
import {
  getDiagnosisHistory,
  getDiagnosisHistoryOne,
  getMyChildDiagnosisHistory,
  getMyChildDiagnosisHistoryOne,
} from "../../diagnosisController.js";

const originalDiagnosisMethods = {
  findById: Diagnosis.findById,
};

const originalPatientMethods = {
  exists: Patient.exists,
  find: Patient.find,
  findOne: Patient.findOne,
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
  Patient.find = originalPatientMethods.find;
  Patient.findOne = originalPatientMethods.findOne;
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

  Diagnosis.findById = (id) => {
    const call = { id, select: undefined, lean: false };
    calls.push(call);
    return {
      select(fields) {
        call.select = fields;
        return {
          async lean() {
            call.lean = true;
            return response == null
              ? response
              : Object.fromEntries(fields.split(" ").map((field) => [field, response[field]]));
          },
        };
      },
    };
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

function mockHistoryResponse(single, response) {
  const calls = single
    ? mockDiagnosisHistoryFindOne(response)
    : mockDiagnosisHistoryFind(response);
  return () => assert.deepEqual(calls, [single
    ? {
        query: { _id: "history-id", diagnosisId: "diagnosis-id" },
        populate: { path: "editedBy", select: "name email" },
      }
    : {
        query: { diagnosisId: "diagnosis-id" },
        sort: { createdAt: -1 },
        populate: { path: "editedBy", select: "name email" },
      }]);
}

const historyVersion = {
  _id: "history-id",
  diagnosisId: "diagnosis-id",
  editedBy: { _id: "doctor-id", name: "Synthetic Doctor", email: "doctor@example.com" },
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  snapshot: { diagnosis: "Synthetic diagnosis", medicines: [{ name: "Synthetic medicine" }] },
};

for (const [name, handler, single] of [
  ["getDiagnosisHistory", getDiagnosisHistory, false],
  ["getDiagnosisHistoryOne", getDiagnosisHistoryOne, true],
]) {
  for (const role of ["doctor", "patient"]) {
    test(`${name} authorizes ${role} using only projected lean fields and preserves history`, async () => {
      restoreModelMethods();
      const diagnosisCalls = mockDiagnosisFindById(makeDiagnosis({ diagnosis: "Excluded full record" }));
      const existsCalls = mockPatientExists({ _id: "patient-id" });
      const response = single ? historyVersion : [historyVersion];
      const assertHistory = mockHistoryResponse(single, response);
      const res = makeRes();
      try {
        await handler(makeReq({ user: {
          _id: role === "doctor" ? "doctor-id" : "patient-user-id",
          role,
          email: " Patient@Example.com ",
        } }), res);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, response);
        assert.deepEqual(diagnosisCalls, [
          { id: "diagnosis-id", select: "_id patient createdBy", lean: true },
        ]);
        assert.deepEqual(existsCalls, [role === "doctor"
          ? { _id: "patient-id", $or: [{ owners: "doctor-id" }, { createdBy: "doctor-id" }] }
          : { _id: "patient-id", email: "patient@example.com" }]);
        assertHistory();
      } finally {
        restoreModelMethods();
      }
    });
  }

  for (const scenario of [
    { label: "missing diagnosis", diagnosis: null, status: 404, error: "Diagnostic not found" },
    { label: "different creator", diagnosis: makeDiagnosis({ createdBy: "other-doctor-id" }), status: 403, error: "Not authorized" },
    { label: "missing patient email", user: { _id: "patient-user-id", role: "patient" }, status: 400, error: "User has no email on file" },
    { label: "unsupported role", user: { _id: "admin-id", role: "admin" }, status: 403, error: "Insufficient role" },
  ]) {
    test(`${name} preserves ${scenario.label} rejection before patient/history queries`, async () => {
      restoreModelMethods();
      const diagnosisCalls = mockDiagnosisFindById(
        Object.hasOwn(scenario, "diagnosis") ? scenario.diagnosis : makeDiagnosis()
      );
      guardPatientExists();
      guardDiagnosisHistoryLookup();
      const res = makeRes();
      try {
        await handler(makeReq(scenario.user ? { user: scenario.user } : {}), res);
        assert.equal(res.statusCode, scenario.status);
        assert.deepEqual(res.body, { error: scenario.error });
        assert.deepEqual(diagnosisCalls, [
          { id: "diagnosis-id", select: "_id patient createdBy", lean: true },
        ]);
      } finally {
        restoreModelMethods();
      }
    });
  }
}

function mockCurrentMinorGroup() {
  const calls = [];
  Patient.findOne = (query) => ({
    select(fields) {
      calls.push({ query, fields });
      return { lean: async () => ({
        _id: "child-id",
        fullname: "Synthetic Minor",
        parentEmail: "guardian@example.com",
        minorKey: "guardian@example.com::synthetic-minor",
        birthDate: new Date(new Date().getFullYear() - 10, 0, 1),
        age: 10,
        isDeceased: false,
      }) };
    },
  });
  Patient.find = (query) => ({
    select(fields) {
      calls.push({ query, fields });
      return { lean: async () => [{ _id: "child-id" }, { _id: "patient-id" }] };
    },
  });
  return calls;
}

for (const [name, handler, single] of [
  ["getMyChildDiagnosisHistory", getMyChildDiagnosisHistory, false],
  ["getMyChildDiagnosisHistoryOne", getMyChildDiagnosisHistoryOne, true],
]) {
  for (const scenario of ["allowed", "outside group", "missing diagnosis", ...(single ? ["missing history"] : [])]) {
    test(`${name} preserves ${scenario} with minimal lean authorization and current-minor group`, async () => {
      restoreModelMethods();
      const groupCalls = mockCurrentMinorGroup();
      const diagnosisCalls = mockDiagnosisFindById(scenario === "missing diagnosis"
        ? null
        : makeDiagnosis({ patient: scenario === "outside group" ? "unrelated-patient-id" : "patient-id" }));
      guardDiagnosisHistoryLookup();
      const response = single ? historyVersion : [historyVersion];
      const assertHistory = ["allowed", "missing history"].includes(scenario)
        ? mockHistoryResponse(single, scenario === "missing history" ? null : response)
        : null;
      const res = makeRes();
      try {
        await handler(makeReq({
          params: { childId: "child-id", id: "diagnosis-id", historyId: "history-id" },
          user: { _id: "guardian-id", role: "patient", email: " Guardian@Example.com " },
        }), res);
        assert.equal(res.statusCode, scenario === "allowed" ? 200 : scenario === "outside group" ? 403 : 404);
        assert.deepEqual(res.body, scenario === "allowed" ? response : { errorCode: {
          "outside group": "ACCESS_DENIED_CHILD_DIAGNOSIS",
          "missing diagnosis": "DIAGNOSIS_NOT_FOUND",
          "missing history": "HISTORY_VERSION_NOT_FOUND",
        }[scenario] });
        assert.deepEqual(diagnosisCalls, [{ id: "diagnosis-id", select: "_id patient", lean: true }]);
        assert.equal(groupCalls.length, 2);
        assert.deepEqual(groupCalls[0], {
          query: { _id: "child-id", parentEmail: "guardian@example.com" },
          fields: "_id fullname parentEmail minorKey birthDate age dateOfDeath isDeceased",
        });
        assert.equal(groupCalls[1].fields, "_id");
        assert.equal(groupCalls[1].query.parentEmail, "guardian@example.com");
        assert.equal(groupCalls[1].query.minorKey, "guardian@example.com::synthetic-minor");
        assert.equal(groupCalls[1].query.isDeceased, false);
        assert.ok(groupCalls[1].query.$or[0].birthDate.$gt instanceof Date);
        assertHistory?.();
      } finally {
        restoreModelMethods();
      }
    });
  }
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
    assert.deepEqual(findByIdCalls, [
      { id: "diagnosis-id", select: "_id patient createdBy", lean: true },
    ]);
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
