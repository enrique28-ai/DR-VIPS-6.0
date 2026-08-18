import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Diagnosis from "../../../models/Diagnosis.js";
import DiagnosisHistory from "../../../models/DiagnosisHistory.js";
import Patient from "../../../models/Patient.js";
import {
  getMyChildDiagnosesPortal,
  getMyChildDiagnosisHistoryOne,
  getMyChildDiagnosisHistory,
  getMyChildDiagnosisPortalById,
} from "../../diagnosisController.js";

const originals = {
  diagnosisCountDocuments: Diagnosis.countDocuments,
  diagnosisFind: Diagnosis.find,
  diagnosisFindById: Diagnosis.findById,
  diagnosisHistoryFind: DiagnosisHistory.find,
  patientFind: Patient.find,
  patientFindOne: Patient.findOne,
};

afterEach(() => {
  Diagnosis.countDocuments = originals.diagnosisCountDocuments;
  Diagnosis.find = originals.diagnosisFind;
  Diagnosis.findById = originals.diagnosisFindById;
  DiagnosisHistory.find = originals.diagnosisHistoryFind;
  Patient.find = originals.patientFind;
  Patient.findOne = originals.patientFindOne;
});

function birthDateAtBoundary(dayOffset = 0) {
  const today = new Date();
  const targetYear = today.getFullYear() - 18;
  const targetMonth = today.getMonth();
  const targetDay = Math.min(
    today.getDate(),
    new Date(targetYear, targetMonth + 1, 0).getDate()
  );
  const birthDate = new Date(targetYear, targetMonth, targetDay, 12, 0, 0, 0);
  birthDate.setDate(birthDate.getDate() + dayOffset);
  return birthDate;
}

function makeReq(overrides = {}) {
  return {
    params: { childId: "child-patient-id" },
    query: {},
    user: {
      _id: "guardian-user-id",
      role: "patient",
      email: "guardian@example.com",
    },
    ...overrides,
  };
}

function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function mockBasePatient(patient) {
  Patient.findOne = () => ({
    select() {
      return { lean: async () => patient };
    },
  });
}

async function withoutConsoleError(work) {
  const original = console.error;
  console.error = () => {};
  try {
    return await work();
  } finally {
    console.error = original;
  }
}

test("child diagnosis list denies a former guardian when cached age is stale", async () => {
  mockBasePatient({
    _id: "adult-patient-id",
    fullname: "Adult Patient",
    parentEmail: "guardian@example.com",
    minorKey: "guardian@example.com::adult-patient",
    birthDate: birthDateAtBoundary(0),
    age: 17,
    isDeceased: false,
  });
  let groupLookupCalls = 0;
  Patient.find = () => {
    groupLookupCalls += 1;
    throw new Error("group lookup must not run after adult denial");
  };
  const res = makeRes();

  await withoutConsoleError(() => getMyChildDiagnosesPortal(makeReq(), res));

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { errorCode: "CHILD_NOT_MINOR" });
  assert.equal(groupLookupCalls, 0);
});

test("child diagnosis history denies a former guardian when cached age is stale", async () => {
  mockBasePatient({
    _id: "adult-patient-id",
    fullname: "Adult Patient",
    parentEmail: "guardian@example.com",
    minorKey: "guardian@example.com::adult-patient",
    birthDate: birthDateAtBoundary(0),
    age: 17,
    isDeceased: false,
  });
  let groupLookupCalls = 0;
  Patient.find = () => {
    groupLookupCalls += 1;
    throw new Error("group lookup must not run after adult denial");
  };
  Diagnosis.findById = () => {
    throw new Error("diagnosis lookup must not run after adult denial");
  };
  DiagnosisHistory.find = () => {
    throw new Error("history lookup must not run after adult denial");
  };
  const res = makeRes();

  await withoutConsoleError(() =>
    getMyChildDiagnosisHistory(
      makeReq({ params: { childId: "adult-patient-id", id: "diagnosis-id" } }),
      res
    )
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { errorCode: "CHILD_NOT_MINOR" });
  assert.equal(groupLookupCalls, 0);
});

test("child diagnosis detail denies a former guardian when cached age is stale", async () => {
  mockBasePatient({
    _id: "adult-patient-id",
    fullname: "Adult Patient",
    parentEmail: "guardian@example.com",
    minorKey: "guardian@example.com::adult-patient",
    birthDate: birthDateAtBoundary(0),
    age: 17,
    isDeceased: false,
  });
  Patient.find = () => {
    throw new Error("group lookup must not run after adult denial");
  };
  Diagnosis.findById = () => {
    throw new Error("diagnosis lookup must not run after adult denial");
  };
  const res = makeRes();

  await withoutConsoleError(() =>
    getMyChildDiagnosisPortalById(
      makeReq({ params: { childId: "adult-patient-id", id: "diagnosis-id" } }),
      res
    )
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { errorCode: "CHILD_NOT_MINOR" });
});

test("single child diagnosis history version denies a former guardian when cached age is stale", async () => {
  mockBasePatient({
    _id: "adult-patient-id",
    fullname: "Adult Patient",
    parentEmail: "guardian@example.com",
    minorKey: "guardian@example.com::adult-patient",
    birthDate: birthDateAtBoundary(0),
    age: 17,
    isDeceased: false,
  });
  Patient.find = () => {
    throw new Error("group lookup must not run after adult denial");
  };
  Diagnosis.findById = () => {
    throw new Error("diagnosis lookup must not run after adult denial");
  };
  DiagnosisHistory.find = () => {
    throw new Error("history lookup must not run after adult denial");
  };
  const res = makeRes();

  await withoutConsoleError(() =>
    getMyChildDiagnosisHistoryOne(
      makeReq({
        params: {
          childId: "adult-patient-id",
          id: "diagnosis-id",
          historyId: "history-id",
        },
      }),
      res
    )
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { errorCode: "CHILD_NOT_MINOR" });
});

test("current guardian retains child diagnosis list access just under age 18", async () => {
  mockBasePatient({
    _id: "minor-patient-id",
    fullname: "Minor Patient",
    parentEmail: "guardian@example.com",
    minorKey: "guardian@example.com::minor-patient",
    birthDate: birthDateAtBoundary(1),
    age: 17,
    isDeceased: false,
  });
  let groupQuery;
  Patient.find = (query) => ({
    select() {
      groupQuery = query;
      return { lean: async () => [{ _id: "minor-patient-id" }] };
    },
  });
  Diagnosis.find = () => {
    const chain = {
      sort() {
        return chain;
      },
      skip() {
        return chain;
      },
      limit() {
        return chain;
      },
      populate() {
        return { lean: async () => [] };
      },
    };
    return chain;
  };
  Diagnosis.countDocuments = async () => 0;
  const res = makeRes();

  await getMyChildDiagnosesPortal(makeReq(), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { items: [], total: 0, page: 1, pages: 0 });
  assert.equal(groupQuery.parentEmail, "guardian@example.com");
  assert.equal(groupQuery.minorKey, "guardian@example.com::minor-patient");
  assert.equal(groupQuery.isDeceased, false);
  assert.ok(groupQuery.$or[0].birthDate.$gt instanceof Date);
});
