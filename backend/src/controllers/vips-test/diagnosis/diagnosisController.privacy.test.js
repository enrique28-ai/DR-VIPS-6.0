import assert from "node:assert/strict";
import { after, test } from "node:test";
import mongoose from "mongoose";

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

const GENERIC_ERROR_BODY = { error: "Internal server error" };
const PRIVACY_SENTINELS = [
  "MEDICAL_SENTINEL",
  "patient@example.test",
  "TOKEN_SENTINEL",
  "COOKIE_SENTINEL",
  "SECRET_SENTINEL",
  "mongodb://user:password@private-host/records",
  "MongoServerError: private collection detail",
];

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

const originalTransaction = mongoose.connection.transaction;

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
  mongoose.connection.transaction = originalTransaction;
}

function mockTransaction() {
  const session = { id: "diagnosis-transaction-session" };
  const state = {
    aborts: 0,
    commits: 0,
    calls: 0,
    session,
  };

  mongoose.connection.transaction = async (work) => {
    state.calls += 1;
    try {
      const result = await work(session);
      state.commits += 1;
      return result;
    } catch (error) {
      state.aborts += 1;
      throw error;
    }
  };

  return state;
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

async function captureConsoleErrors(work) {
  const originalConsoleError = console.error;
  const calls = [];
  console.error = (...args) => calls.push(args);
  try {
    await work();
  } finally {
    console.error = originalConsoleError;
  }
  return calls;
}

function assertPrivateSentinelsAbsent(value) {
  const serialized = JSON.stringify(value);
  for (const sentinel of PRIVACY_SENTINELS) {
    assert.equal(serialized.includes(sentinel), false);
  }
}

function makeDiagnosisDocument(overrides = {}) {
  const doc = {
    _id: "diagnosis-id",
    title: "Existing Diagnosis",
    description: "Private details",
    medicine: [],
    treatment: [],
    operation: [],
    patient: "patient-id",
    createdBy: "doctor-id",
    async save() {
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

  return Object.assign(doc, overrides);
}

function rejectPatientOwnership() {
  const calls = [];
  Object.defineProperty(calls, "sessions", { value: [] });

  Patient.exists = (query) => {
    calls.push(query);
    return {
      session(session) {
        calls.sessions.push(session);
        return Promise.resolve(null);
      },
      then(resolve, reject) {
        return Promise.resolve(null).then(resolve, reject);
      },
    };
  };

  return calls;
}

function acceptPatientOwnership(response = { _id: "patient-id" }) {
  const calls = [];
  Object.defineProperty(calls, "sessions", { value: [] });

  Patient.exists = (query) => {
    calls.push(query);
    return {
      session(session) {
        calls.sessions.push(session);
        return Promise.resolve(response);
      },
      then(resolve, reject) {
        return Promise.resolve(response).then(resolve, reject);
      },
    };
  };

  return calls;
}

function mockPatientDeathStatus(response) {
  const calls = [];
  Object.defineProperty(calls, "sessions", { value: [] });

  Patient.findOne = (query) => {
    const call = { query, select: undefined };
    calls.push(call);

    const queryResult = {
      select(select) {
        call.select = select;
        return queryResult;
      },
      session(session) {
        calls.sessions.push(session);
        return queryResult;
      },
      lean: async () => response,
    };

    return queryResult;
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
  Object.defineProperty(calls, "options", { value: [] });
  Object.defineProperty(calls, "payloads", { value: [] });

  Diagnosis.create = async (payload, options) => {
    calls.payloads.push(payload);
    calls.options.push(options);
    calls.push(Array.isArray(payload) ? payload[0] : payload);
    return Array.isArray(payload) ? [response] : response;
  };

  return calls;
}

function mockDiagnosisFindOne(response) {
  const calls = [];
  Object.defineProperty(calls, "sessions", { value: [] });

  Diagnosis.findOne = (query) => {
    calls.push(query);
    const queryResult = {
      session(session) {
        calls.sessions.push(session);
        return queryResult;
      },
      lean: async () => response,
      then: (resolve, reject) => Promise.resolve(response).then(resolve, reject),
    };
    return queryResult;
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
  Object.defineProperty(calls, "options", { value: [] });
  Object.defineProperty(calls, "payloads", { value: [] });

  DiagnosisHistory.create = async (payload, options) => {
    calls.payloads.push(payload);
    calls.options.push(options);
    calls.push(Array.isArray(payload) ? payload[0] : payload);
    return [{ _id: "diagnosis-history-id" }];
  };

  return calls;
}

test("createDiagnosis rejects when doctor does not own the patient", async () => {
  restoreModelMethods();
  mockTransaction();

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
  mockTransaction();

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
  const transaction = mockTransaction();

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
    assert.equal(transaction.calls, 1);
    assert.equal(transaction.commits, 1);
    assert.equal(transaction.aborts, 0);
    assert.equal(diagnosisCreateCalls.payloads[0].length, 1);
    assert.equal(diagnosisCreateCalls.options[0].session, transaction.session);
    assert.equal(historyCreateCalls.payloads[0].length, 1);
    assert.equal(historyCreateCalls.options[0].session, transaction.session);
    assert.deepEqual(existsCalls.sessions, [transaction.session]);
    assert.deepEqual(patientFindCalls.sessions, [transaction.session]);
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

test("createDiagnosis returns 500 and aborts when Diagnosis.create fails", async () => {
  restoreModelMethods();
  const transaction = mockTransaction();
  acceptPatientOwnership();
  mockPatientDeathStatus({ isDeceased: false });
  const historyCreateCalls = mockDiagnosisHistoryCreate();
  const diagnosisCreateCalls = [];
  Diagnosis.create = async (payload, options) => {
    diagnosisCreateCalls.push({ payload, options });
    throw new Error(PRIVACY_SENTINELS.join(" | "));
  };

  const req = makeReq({
    body: { title: "Private diagnosis", patient: "patient-id" },
  });
  const res = makeRes();

  try {
    const logs = await captureConsoleErrors(() => createDiagnosis(req, res));

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, GENERIC_ERROR_BODY);
    assert.equal(transaction.calls, 1);
    assert.equal(transaction.commits, 0);
    assert.equal(transaction.aborts, 1);
    assert.equal(diagnosisCreateCalls.length, 1);
    assert.equal(diagnosisCreateCalls[0].options.session, transaction.session);
    assert.deepEqual(historyCreateCalls, []);
    assert.deepEqual(logs, [["[diagnosis-write] atomic_write_failed"]]);
    assertPrivateSentinelsAbsent({ response: res.body, logs });
  } finally {
    restoreModelMethods();
  }
});

test("createDiagnosis returns 500 and aborts when DiagnosisHistory.create fails", async () => {
  restoreModelMethods();
  const transaction = mockTransaction();
  acceptPatientOwnership();
  mockPatientDeathStatus({ isDeceased: false });
  const snapshot = {
    _id: "diagnosis-id",
    title: "Private diagnosis",
    patient: "patient-id",
    createdBy: "doctor-id",
  };
  const createdDoc = { ...snapshot, toObject: () => snapshot };
  const diagnosisCreateCalls = mockDiagnosisCreate(createdDoc);
  const historyCreateCalls = [];
  DiagnosisHistory.create = async (payload, options) => {
    historyCreateCalls.push({ payload, options });
    throw new Error(PRIVACY_SENTINELS.join(" | "));
  };

  const req = makeReq({
    body: { title: "Private diagnosis", patient: "patient-id" },
  });
  const res = makeRes();

  try {
    const logs = await captureConsoleErrors(() => createDiagnosis(req, res));

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, GENERIC_ERROR_BODY);
    assert.equal(transaction.calls, 1);
    assert.equal(transaction.commits, 0);
    assert.equal(transaction.aborts, 1);
    assert.equal(diagnosisCreateCalls.options[0].session, transaction.session);
    assert.equal(historyCreateCalls.length, 1);
    assert.equal(historyCreateCalls[0].options.session, transaction.session);
    assert.deepEqual(logs, [["[diagnosis-write] atomic_write_failed"]]);
    assertPrivateSentinelsAbsent({ response: res.body, logs });
  } finally {
    restoreModelMethods();
  }
});

test("createDiagnosis preserves the required-fields 400 contract", async () => {
  restoreModelMethods();
  const transaction = mockTransaction();
  const diagnosisCreateCalls = mockDiagnosisCreate({ _id: "diagnosis-id" });
  const historyCreateCalls = mockDiagnosisHistoryCreate();
  const req = makeReq({ body: { title: "", patient: "patient-id" } });
  const res = makeRes();

  try {
    await createDiagnosis(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: "title and patient are required" });
    assert.equal(transaction.calls, 1);
    assert.equal(transaction.commits, 1);
    assert.equal(transaction.aborts, 0);
    assert.deepEqual(diagnosisCreateCalls, []);
    assert.deepEqual(historyCreateCalls, []);
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
  mockTransaction();

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
  mockTransaction();

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
  const transaction = mockTransaction();

  const existsCalls = acceptPatientOwnership();
  const patientFindCalls = mockPatientDeathStatus({
    _id: "patient-id",
    isDeceased: false,
  });
  const saveCalls = [];
  const diagnosisDoc = {
    _id: "diagnosis-id",
    title: "Existing Diagnosis",
    description: "Private details",
    medicine: [],
    treatment: [],
    operation: [],
    patient: "patient-id",
    createdBy: "doctor-id",
    save: async function save(options) {
      saveCalls.push(options);
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
    assert.equal(transaction.calls, 1);
    assert.equal(transaction.commits, 1);
    assert.equal(transaction.aborts, 0);
    assert.equal(saveCalls.length, 1);
    assert.equal(saveCalls[0].session, transaction.session);
    assert.equal(historyCreateCalls.payloads[0].length, 1);
    assert.equal(historyCreateCalls.options[0].session, transaction.session);
    assert.deepEqual(findOneCalls.sessions, [transaction.session]);
    assert.deepEqual(existsCalls.sessions, [transaction.session]);
    assert.deepEqual(patientFindCalls.sessions, [transaction.session]);
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

test("updateDiagnosis returns 500 and aborts when d.save fails", async () => {
  restoreModelMethods();
  const transaction = mockTransaction();
  acceptPatientOwnership();
  mockPatientDeathStatus({ isDeceased: false });
  const saveCalls = [];
  const diagnosisDoc = makeDiagnosisDocument({
    async save(options) {
      saveCalls.push(options);
      throw new Error(PRIVACY_SENTINELS.join(" | "));
    },
  });
  mockDiagnosisFindOne(diagnosisDoc);
  const historyCreateCalls = mockDiagnosisHistoryCreate();
  const req = makeReq({
    params: { id: "diagnosis-id" },
    body: { title: "Changed Diagnosis" },
  });
  const res = makeRes();

  try {
    const logs = await captureConsoleErrors(() => updateDiagnosis(req, res));

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, GENERIC_ERROR_BODY);
    assert.equal(transaction.calls, 1);
    assert.equal(transaction.commits, 0);
    assert.equal(transaction.aborts, 1);
    assert.equal(saveCalls.length, 1);
    assert.equal(saveCalls[0].session, transaction.session);
    assert.deepEqual(historyCreateCalls, []);
    assert.deepEqual(logs, [["[diagnosis-write] atomic_write_failed"]]);
    assertPrivateSentinelsAbsent({ response: res.body, logs });
  } finally {
    restoreModelMethods();
  }
});

test("updateDiagnosis returns 500 and aborts when DiagnosisHistory.create fails", async () => {
  restoreModelMethods();
  const transaction = mockTransaction();
  acceptPatientOwnership();
  mockPatientDeathStatus({ isDeceased: false });
  const saveCalls = [];
  const diagnosisDoc = makeDiagnosisDocument({
    async save(options) {
      saveCalls.push(options);
      return this;
    },
  });
  mockDiagnosisFindOne(diagnosisDoc);
  const historyCreateCalls = [];
  DiagnosisHistory.create = async (payload, options) => {
    historyCreateCalls.push({ payload, options });
    throw new Error(PRIVACY_SENTINELS.join(" | "));
  };
  const req = makeReq({
    params: { id: "diagnosis-id" },
    body: { title: "Changed Diagnosis" },
  });
  const res = makeRes();

  try {
    const logs = await captureConsoleErrors(() => updateDiagnosis(req, res));

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, GENERIC_ERROR_BODY);
    assert.equal(transaction.calls, 1);
    assert.equal(transaction.commits, 0);
    assert.equal(transaction.aborts, 1);
    assert.equal(saveCalls.length, 1);
    assert.equal(saveCalls[0].session, transaction.session);
    assert.equal(historyCreateCalls.length, 1);
    assert.equal(historyCreateCalls[0].options.session, transaction.session);
    assert.deepEqual(logs, [["[diagnosis-write] atomic_write_failed"]]);
    assertPrivateSentinelsAbsent({ response: res.body, logs });
  } finally {
    restoreModelMethods();
  }
});

test("updateDiagnosis preserves the not-found 404 contract", async () => {
  restoreModelMethods();
  const transaction = mockTransaction();
  const findOneCalls = mockDiagnosisFindOne(null);
  const historyCreateCalls = mockDiagnosisHistoryCreate();
  const req = makeReq({
    params: { id: "missing-diagnosis-id" },
    body: { title: "Changed Diagnosis" },
  });
  const res = makeRes();

  try {
    await updateDiagnosis(req, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: "Diagnostic not found" });
    assert.equal(transaction.calls, 1);
    assert.equal(transaction.commits, 1);
    assert.equal(transaction.aborts, 0);
    assert.deepEqual(findOneCalls.sessions, [transaction.session]);
    assert.deepEqual(historyCreateCalls, []);
  } finally {
    restoreModelMethods();
  }
});

test("updateDiagnosis preserves the NO_CHANGES 400 contract", async () => {
  restoreModelMethods();
  const transaction = mockTransaction();
  acceptPatientOwnership();
  mockPatientDeathStatus({ isDeceased: false });
  const saveCalls = [];
  const diagnosisDoc = makeDiagnosisDocument({
    async save(options) {
      saveCalls.push(options);
      return this;
    },
  });
  mockDiagnosisFindOne(diagnosisDoc);
  const historyCreateCalls = mockDiagnosisHistoryCreate();
  const req = makeReq({
    params: { id: "diagnosis-id" },
    body: {},
  });
  const res = makeRes();

  try {
    await updateDiagnosis(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      errorCode: "NO_CHANGES",
      error: "No changes detected. Update cancelled.",
    });
    assert.equal(transaction.calls, 1);
    assert.equal(transaction.commits, 1);
    assert.equal(transaction.aborts, 0);
    assert.deepEqual(saveCalls, []);
    assert.deepEqual(historyCreateCalls, []);
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
