import assert from "node:assert/strict";
import { after, test } from "node:test";

import Diagnosis from "../../models/Diagnosis.js";
import Patient from "../../models/Patient.js";
import {
  createDiagnosis,
  getDiagnosesByPatient,
  getDiagnosisById,
  updateDiagnosis,
} from "../diagnosisController.js";

const diagnosisController = await import("../diagnosisController.js");

const originalPatientMethods = {
  exists: Patient.exists,
  findOne: Patient.findOne,
};

const originalDiagnosisMethods = {
  create: Diagnosis.create,
  deleteOne: Diagnosis.deleteOne,
  findOne: Diagnosis.findOne,
};

after(() => {
  restoreModelMethods();
});

function restoreModelMethods() {
  Patient.exists = originalPatientMethods.exists;
  Patient.findOne = originalPatientMethods.findOne;
  Diagnosis.create = originalDiagnosisMethods.create;
  Diagnosis.deleteOne = originalDiagnosisMethods.deleteOne;
  Diagnosis.findOne = originalDiagnosisMethods.findOne;
}

function makeReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    user: { _id: "doctor-id", role: "doctor" },
    ...overrides,
  };
}

function makeRes() {
  return {
    body: undefined,
    ended: false,
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function rejectPatientOwnership() {
  const calls = [];

  Patient.exists = async (query) => {
    calls.push(query);
    return null;
  };

  return calls;
}

function rejectDiagnosisCreate() {
  Diagnosis.create = async () => {
    throw new Error("Diagnosis.create should not be called without patient ownership");
  };
}

function mockDiagnosisFindOne(response) {
  const calls = [];

  Diagnosis.findOne = (query) => {
    calls.push(query);
    return {
      lean: async () => response,
      then: (resolve, reject) => Promise.resolve(response).then(resolve, reject),
    };
  };

  return calls;
}

test("createDiagnosis rejects when doctor does not own the patient", async () => {
  restoreModelMethods();

  const existsCalls = rejectPatientOwnership();
  rejectDiagnosisCreate();

  const req = makeReq({
    body: {
      title: "Privacy Diagnosis",
      description: "Private details",
      patient: "patient-id",
    },
  });
  const res = makeRes();

  try {
    await createDiagnosis(req, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Not authorized for this patient" });
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

test("getDiagnosesByPatient rejects when doctor does not own the patient", async () => {
  restoreModelMethods();

  const existsCalls = rejectPatientOwnership();

  const req = makeReq({
    params: { patientId: "patient-id" },
  });
  const res = makeRes();

  try {
    await getDiagnosesByPatient(req, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Not authorized for this patient" });
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

test("getDiagnosisById returns 403 when diagnosis patient is not owned by doctor", async () => {
  restoreModelMethods();

  const existsCalls = rejectPatientOwnership();
  const findOneCalls = mockDiagnosisFindOne({
    _id: "diagnosis-id",
    patient: "patient-id",
    createdBy: "doctor-id",
  });

  const req = makeReq({
    params: { id: "diagnosis-id" },
  });
  const res = makeRes();

  try {
    await getDiagnosisById(req, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Not authorized" });
    assert.deepEqual(findOneCalls, [
      { _id: "diagnosis-id", createdBy: "doctor-id" },
    ]);
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

test("updateDiagnosis rejects when diagnosis patient is not owned by doctor", async () => {
  restoreModelMethods();

  const existsCalls = rejectPatientOwnership();
  const diagnosisDoc = {
    _id: "diagnosis-id",
    title: "Existing Diagnosis",
    description: "Private details",
    medicine: [],
    treatment: [],
    operation: [],
    patient: "patient-id",
    createdBy: "doctor-id",
    save: async () => {
      throw new Error("diagnosis.save should not be called without patient ownership");
    },
  };
  const findOneCalls = mockDiagnosisFindOne(diagnosisDoc);

  const req = makeReq({
    params: { id: "diagnosis-id" },
    body: { title: "Changed Diagnosis" },
  });
  const res = makeRes();

  try {
    await updateDiagnosis(req, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Not authorized" });
    assert.deepEqual(findOneCalls, [
      { _id: "diagnosis-id", createdBy: "doctor-id" },
    ]);
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

if (typeof diagnosisController.deleteDiagnosis === "function") {
  test("deleteDiagnosis rejects when diagnosis patient is not owned by doctor", async () => {
    restoreModelMethods();

    const existsCalls = rejectPatientOwnership();
    const diagnosisDoc = {
      _id: "diagnosis-id",
      patient: "patient-id",
      createdBy: "doctor-id",
      deleteOne: async () => {
        throw new Error("diagnosis.deleteOne should not be called without patient ownership");
      },
    };
    const findOneCalls = mockDiagnosisFindOne(diagnosisDoc);

    Diagnosis.deleteOne = async () => {
      throw new Error("Diagnosis.deleteOne should not be called without patient ownership");
    };

    const req = makeReq({
      params: { id: "diagnosis-id" },
    });
    const res = makeRes();

    try {
      await diagnosisController.deleteDiagnosis(req, res);

      assert.equal(res.statusCode, 403);
      assert.deepEqual(res.body, { error: "Not authorized" });
      assert.deepEqual(findOneCalls, [
        { _id: "diagnosis-id", createdBy: "doctor-id" },
      ]);
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
} else {
  test("deleteDiagnosis privacy coverage is pending because deleteDiagnosis is not exported", {
    skip: "diagnosisController.js has no active deleteDiagnosis export or DELETE route in this branch",
  });
}
