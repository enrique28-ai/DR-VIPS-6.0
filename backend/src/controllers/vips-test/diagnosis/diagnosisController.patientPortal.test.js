import assert from "node:assert/strict";
import { after, test } from "node:test";

import Diagnosis from "../../../models/Diagnosis.js";
import Patient from "../../../models/Patient.js";
import {
  getMyDiagnosesPortal,
  getMyDiagnosisPortalById,
} from "../../diagnosisController.js";

const originalPatientMethods = {
  exists: Patient.exists,
  find: Patient.find,
};

const originalDiagnosisMethods = {
  countDocuments: Diagnosis.countDocuments,
  find: Diagnosis.find,
  findById: Diagnosis.findById,
};

after(() => {
  restoreModelMethods();
});

function restoreModelMethods() {
  Patient.exists = originalPatientMethods.exists;
  Patient.find = originalPatientMethods.find;
  Diagnosis.countDocuments = originalDiagnosisMethods.countDocuments;
  Diagnosis.find = originalDiagnosisMethods.find;
  Diagnosis.findById = originalDiagnosisMethods.findById;
}

function makeReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    user: { _id: "patient-user-id", role: "patient", email: "Patient@Example.com" },
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

function mockPatientFind(response) {
  const calls = [];

  Patient.find = async (query, projection) => {
    calls.push({ query, projection });
    return response;
  };

  return calls;
}

function mockDiagnosisFindById(response) {
  const calls = [];

  Diagnosis.findById = (id) => {
    calls.push(id);
    return {
      populate: (path, select) => {
        assert.equal(path, "createdBy");
        assert.equal(select, "name email");
        return {
          lean: async () => response,
        };
      },
    };
  };

  return calls;
}

test("getMyDiagnosesPortal rejects non-patient role with 403", async () => {
  restoreModelMethods();

  const req = makeReq({
    user: { _id: "doctor-id", role: "doctor", email: "doctor@example.com" },
  });
  const res = makeRes();

  await getMyDiagnosesPortal(req, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Insufficient role" });
});

test("getMyDiagnosesPortal returns empty list when email has no Patient docs", async () => {
  restoreModelMethods();

  const findCalls = mockPatientFind([]);
  Diagnosis.find = () => {
    throw new Error("Diagnosis.find should not be called without matching patients");
  };
  Diagnosis.countDocuments = () => {
    throw new Error(
      "Diagnosis.countDocuments should not be called without matching patients"
    );
  };

  const req = makeReq();
  const res = makeRes();

  try {
    await getMyDiagnosesPortal(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { items: [], total: 0, page: 1, pages: 0 });
    assert.deepEqual(findCalls, [
      {
        query: { email: "patient@example.com" },
        projection: { _id: 1 },
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("getMyDiagnosisPortalById rejects non-patient role with 403", async () => {
  restoreModelMethods();

  const req = makeReq({
    params: { id: "diagnosis-id" },
    user: { _id: "doctor-id", role: "doctor", email: "doctor@example.com" },
  });
  const res = makeRes();

  await getMyDiagnosisPortalById(req, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Insufficient role" });
});

test("getMyDiagnosisPortalById returns 404 when diagnosis does not exist", async () => {
  restoreModelMethods();

  const findByIdCalls = mockDiagnosisFindById(null);

  const req = makeReq({
    params: { id: "missing-diagnosis-id" },
  });
  const res = makeRes();

  try {
    await getMyDiagnosisPortalById(req, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: "Diagnostic not found" });
    assert.deepEqual(findByIdCalls, ["missing-diagnosis-id"]);
  } finally {
    restoreModelMethods();
  }
});

test("getMyDiagnosisPortalById returns 403 when diagnosis patient does not match user email", async () => {
  restoreModelMethods();

  const findByIdCalls = mockDiagnosisFindById({
    _id: "diagnosis-id",
    patient: "other-patient-id",
  });
  const existsCalls = [];
  Patient.exists = async (query) => {
    existsCalls.push(query);
    return null;
  };

  const req = makeReq({
    params: { id: "diagnosis-id" },
  });
  const res = makeRes();

  try {
    await getMyDiagnosisPortalById(req, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Not authorized" });
    assert.deepEqual(findByIdCalls, ["diagnosis-id"]);
    assert.deepEqual(existsCalls, [
      { _id: "other-patient-id", email: "patient@example.com" },
    ]);
  } finally {
    restoreModelMethods();
  }
});
