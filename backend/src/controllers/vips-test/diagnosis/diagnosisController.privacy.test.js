import assert from "node:assert/strict";
import { after, test } from "node:test";

import Diagnosis from "../../../models/Diagnosis.js";
import DiagnosisHistory from "../../../models/DiagnosisHistory.js";
import Patient from "../../../models/Patient.js";
import {
  createDiagnosis,
  getDiagnosesByPatient,
  getDiagnosisById,
  updateDiagnosis,
} from "../../diagnosisController.js";

const diagnosisController = await import("../../diagnosisController.js");

const DECEASED_ERROR_BODY = {
  errorCode: "DIAGNOSIS_PATIENT_DECEASED",
  error: "Cannot create or edit diagnoses for a deceased patient.",
};

const originalPatientMethods = {
  exists: Patient.exists,
  findOne: Patient.findOne,
};

const originalDiagnosisMethods = {
  countDocuments: Diagnosis.countDocuments,
  create: Diagnosis.create,
  deleteOne: Diagnosis.deleteOne,
  find: Diagnosis.find,
  findOne: Diagnosis.findOne,
};

const originalDiagnosisHistoryMethods = {
  create: DiagnosisHistory.create,
};

after(() => {
  restoreModelMethods();
});

function restoreModelMethods() {
  Patient.exists = originalPatientMethods.exists;
  Patient.findOne = originalPatientMethods.findOne;
  Diagnosis.countDocuments = originalDiagnosisMethods.countDocuments;
  Diagnosis.create = originalDiagnosisMethods.create;
  Diagnosis.deleteOne = originalDiagnosisMethods.deleteOne;
  Diagnosis.find = originalDiagnosisMethods.find;
  Diagnosis.findOne = originalDiagnosisMethods.findOne;
  DiagnosisHistory.create = originalDiagnosisHistoryMethods.create;
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

function acceptPatientOwnership(response = { _id: "patient-id" }) {
  const calls = [];

  Patient.exists = async (query) => {
    calls.push(query);
    return response;
  };

  return calls;
}

function mockPatientDeathStatus(response) {
  const calls = [];

  Patient.findOne = (query) => {
    const call = { query, select: undefined };
    calls.push(call);

    return {
      select(select) {
        call.select = select;
        return {
          lean: async () => response,
        };
      },
    };
  };

  return calls;
}

function guardPatientDeathStatusLookup() {
  Patient.findOne = () => {
    throw new Error("Patient.findOne should not be called while reading diagnoses");
  };
}

function rejectDiagnosisCreate() {
  Diagnosis.create = async () => {
    throw new Error("Diagnosis.create should not be called without patient ownership");
  };
}

function mockDiagnosisCreate(response) {
  const calls = [];

  Diagnosis.create = async (payload) => {
    calls.push(payload);
    return response;
  };

  return calls;
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

function mockDiagnosisFind(response) {
  const calls = [];

  Diagnosis.find = (query) => {
    const call = {
      query,
      sort: undefined,
      skip: undefined,
      limit: undefined,
    };
    calls.push(call);

    return {
      sort(sort) {
        call.sort = sort;
        return {
          skip(skip) {
            call.skip = skip;
            return {
              limit(limit) {
                call.limit = limit;
                return {
                  lean: async () => response,
                };
              },
            };
          },
        };
      },
    };
  };

  return calls;
}

function mockDiagnosisHistoryCreate() {
  const calls = [];

  DiagnosisHistory.create = async (payload) => {
    calls.push(payload);
    return { _id: "diagnosis-history-id" };
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

test("createDiagnosis rejects deceased patient with 409 and does not write diagnosis or history", async () => {
  restoreModelMethods();

  const existsCalls = acceptPatientOwnership();
  const patientFindCalls = mockPatientDeathStatus({
    _id: "patient-id",
    isDeceased: true,
  });
  const diagnosisCreateCalls = mockDiagnosisCreate({
    _id: "diagnosis-id",
  });
  const historyCreateCalls = mockDiagnosisHistoryCreate();

  const req = makeReq({
    body: {
      title: "Historical Diagnosis",
      description: "Private details",
      patient: "patient-id",
    },
  });
  const res = makeRes();

  try {
    await createDiagnosis(req, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, DECEASED_ERROR_BODY);
    assert.deepEqual(existsCalls, [
      {
        _id: "patient-id",
        $or: [{ owners: "doctor-id" }, { createdBy: "doctor-id" }],
      },
    ]);
    assert.deepEqual(patientFindCalls, [
      {
        query: { _id: "patient-id" },
        select: "isDeceased",
      },
    ]);
    assert.deepEqual(diagnosisCreateCalls, []);
    assert.deepEqual(historyCreateCalls, []);
  } finally {
    restoreModelMethods();
  }
});

test("createDiagnosis still works for alive patients", async () => {
  restoreModelMethods();

  const existsCalls = acceptPatientOwnership();
  const patientFindCalls = mockPatientDeathStatus({
    _id: "patient-id",
    isDeceased: false,
  });
  const snapshot = {
    _id: "diagnosis-id",
    title: "Alive Diagnosis",
    description: "Private details",
    medicine: ["Aspirin"],
    treatment: [],
    operation: [],
    patient: "patient-id",
    createdBy: "doctor-id",
  };
  const createdDoc = {
    ...snapshot,
    toObject: () => snapshot,
  };
  const diagnosisCreateCalls = mockDiagnosisCreate(createdDoc);
  const historyCreateCalls = mockDiagnosisHistoryCreate();

  const req = makeReq({
    body: {
      title: " Alive Diagnosis ",
      description: " Private details ",
      medicine: "Aspirin",
      treatment: "",
      operation: [],
      patient: "patient-id",
    },
  });
  const res = makeRes();

  try {
    await createDiagnosis(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body, createdDoc);
    assert.deepEqual(existsCalls, [
      {
        _id: "patient-id",
        $or: [{ owners: "doctor-id" }, { createdBy: "doctor-id" }],
      },
    ]);
    assert.deepEqual(patientFindCalls, [
      {
        query: { _id: "patient-id" },
        select: "isDeceased",
      },
    ]);
    assert.deepEqual(diagnosisCreateCalls, [
      {
        title: "Alive Diagnosis",
        description: "Private details",
        medicine: ["Aspirin"],
        treatment: [],
        operation: [],
        patient: "patient-id",
        createdBy: "doctor-id",
      },
    ]);
    assert.deepEqual(historyCreateCalls, [
      {
        diagnosisId: "diagnosis-id",
        editedBy: "doctor-id",
        snapshot,
        changeType: "created",
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

test("getDiagnosesByPatient still lists historical diagnoses for deceased patients", async () => {
  restoreModelMethods();

  const existsCalls = acceptPatientOwnership({
    _id: "patient-id",
    isDeceased: true,
  });
  guardPatientDeathStatusLookup();
  const items = [
    {
      _id: "diagnosis-id",
      patient: "patient-id",
      title: "Historical diagnosis",
    },
  ];
  const findCalls = mockDiagnosisFind(items);
  const countCalls = [];
  Diagnosis.countDocuments = async (query) => {
    countCalls.push(query);
    return 1;
  };

  const req = makeReq({
    params: { patientId: "patient-id" },
  });
  const res = makeRes();

  try {
    await getDiagnosesByPatient(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { items, total: 1, page: 1, pages: 1 });
    assert.deepEqual(existsCalls, [
      {
        _id: "patient-id",
        $or: [{ owners: "doctor-id" }, { createdBy: "doctor-id" }],
      },
    ]);
    assert.deepEqual(findCalls, [
      {
        query: { createdBy: "doctor-id", patient: "patient-id" },
        sort: { createdAt: -1 },
        skip: 0,
        limit: 20,
      },
    ]);
    assert.deepEqual(countCalls, [
      { createdBy: "doctor-id", patient: "patient-id" },
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

test("getDiagnosisById still returns historical diagnosis detail for deceased patients", async () => {
  restoreModelMethods();

  const diagnosis = {
    _id: "diagnosis-id",
    patient: "patient-id",
    createdBy: "doctor-id",
    title: "Historical diagnosis",
  };
  const existsCalls = acceptPatientOwnership({
    _id: "patient-id",
    isDeceased: true,
  });
  guardPatientDeathStatusLookup();
  const findOneCalls = mockDiagnosisFindOne(diagnosis);

  const req = makeReq({
    params: { id: "diagnosis-id" },
  });
  const res = makeRes();

  try {
    await getDiagnosisById(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, diagnosis);
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

test("updateDiagnosis rejects when associated patient is deceased and does not save or create history", async () => {
  restoreModelMethods();

  const existsCalls = acceptPatientOwnership();
  const patientFindCalls = mockPatientDeathStatus({
    _id: "patient-id",
    isDeceased: true,
  });
  let saveCalls = 0;
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
      saveCalls += 1;
      throw new Error("diagnosis.save should not be called for deceased patients");
    },
    toObject: () => ({}),
  };
  const findOneCalls = mockDiagnosisFindOne(diagnosisDoc);
  const historyCreateCalls = mockDiagnosisHistoryCreate();

  const req = makeReq({
    params: { id: "diagnosis-id" },
    body: { title: "Changed Diagnosis" },
  });
  const res = makeRes();

  try {
    await updateDiagnosis(req, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, DECEASED_ERROR_BODY);
    assert.equal(saveCalls, 0);
    assert.equal(diagnosisDoc.title, "Existing Diagnosis");
    assert.deepEqual(historyCreateCalls, []);
    assert.deepEqual(findOneCalls, [
      { _id: "diagnosis-id", createdBy: "doctor-id" },
    ]);
    assert.deepEqual(existsCalls, [
      {
        _id: "patient-id",
        $or: [{ owners: "doctor-id" }, { createdBy: "doctor-id" }],
      },
    ]);
    assert.deepEqual(patientFindCalls, [
      {
        query: { _id: "patient-id" },
        select: "isDeceased",
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("updateDiagnosis still works for alive patients", async () => {
  restoreModelMethods();

  const existsCalls = acceptPatientOwnership();
  const patientFindCalls = mockPatientDeathStatus({
    _id: "patient-id",
    isDeceased: false,
  });
  let saveCalls = 0;
  const diagnosisDoc = {
    _id: "diagnosis-id",
    title: "Existing Diagnosis",
    description: "Private details",
    medicine: [],
    treatment: [],
    operation: [],
    patient: "patient-id",
    createdBy: "doctor-id",
    save: async function save() {
      saveCalls += 1;
      return this;
    },
    toObject() {
      return {
        _id: this._id,
        title: this.title,
        description: this.description,
        medicine: this.medicine,
        treatment: this.treatment,
        operation: this.operation,
        patient: this.patient,
        createdBy: this.createdBy,
      };
    },
  };
  const findOneCalls = mockDiagnosisFindOne(diagnosisDoc);
  const historyCreateCalls = mockDiagnosisHistoryCreate();

  const req = makeReq({
    params: { id: "diagnosis-id" },
    body: {
      title: "Changed Diagnosis",
      description: "Updated details",
      medicine: "Aspirin",
      treatment: ["Rest"],
      operation: "",
    },
  });
  const res = makeRes();

  try {
    await updateDiagnosis(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(saveCalls, 1);
    assert.equal(res.body, diagnosisDoc);
    assert.equal(diagnosisDoc.title, "Changed Diagnosis");
    assert.equal(diagnosisDoc.description, "Updated details");
    assert.deepEqual(diagnosisDoc.medicine, ["Aspirin"]);
    assert.deepEqual(diagnosisDoc.treatment, ["Rest"]);
    assert.deepEqual(diagnosisDoc.operation, []);
    assert.deepEqual(findOneCalls, [
      { _id: "diagnosis-id", createdBy: "doctor-id" },
    ]);
    assert.deepEqual(existsCalls, [
      {
        _id: "patient-id",
        $or: [{ owners: "doctor-id" }, { createdBy: "doctor-id" }],
      },
    ]);
    assert.deepEqual(patientFindCalls, [
      {
        query: { _id: "patient-id" },
        select: "isDeceased",
      },
    ]);
    assert.deepEqual(historyCreateCalls, [
      {
        diagnosisId: "diagnosis-id",
        editedBy: "doctor-id",
        snapshot: {
          _id: "diagnosis-id",
          title: "Changed Diagnosis",
          description: "Updated details",
          medicine: ["Aspirin"],
          treatment: ["Rest"],
          operation: [],
          patient: "patient-id",
          createdBy: "doctor-id",
        },
        changeType: "updated",
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
