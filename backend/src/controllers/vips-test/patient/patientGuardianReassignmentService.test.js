import assert from "node:assert/strict";
import { after, test } from "node:test";

import Appointment from "../../../models/Appointment.js";
import Patient from "../../../models/Patient.js";
import PatientHistory from "../../../models/PatientHistory.js";
import { reassignMinorGuardianService } from "../../../services/patients/patientWriteService.js";

const OLD_PARENT_EMAIL = "oldparent@example.com";
const NEW_PARENT_EMAIL = "newparent@example.com";
const MINOR_NAME = "Minor Patient";
const OLD_MINOR_KEY = `${OLD_PARENT_EMAIL}::minor patient`;
const NEW_MINOR_KEY = `${NEW_PARENT_EMAIL}::minor patient`;

const originalPatientMethods = {
  findOne: Patient.findOne,
  updateMany: Patient.updateMany,
};

const originalPatientHistoryMethods = {
  create: PatientHistory.create,
  updateMany: PatientHistory.updateMany,
};

const originalAppointmentMethods = {
  updateMany: Appointment.updateMany,
};

after(() => {
  restoreModelMethods();
});

function restoreModelMethods() {
  Patient.findOne = originalPatientMethods.findOne;
  Patient.updateMany = originalPatientMethods.updateMany;
  PatientHistory.create = originalPatientHistoryMethods.create;
  PatientHistory.updateMany = originalPatientHistoryMethods.updateMany;
  Appointment.updateMany = originalAppointmentMethods.updateMany;
}

function makeDoctor(overrides = {}) {
  return {
    _id: "doctor-id",
    role: "doctor",
    email: "doctor@example.com",
    ...overrides,
  };
}

function makeMinor(overrides = {}) {
  return {
    _id: "minor-patient-id",
    fullname: MINOR_NAME,
    age: 10,
    birthDate: new Date("2016-01-01T12:00:00.000Z"),
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
    parentEmail: OLD_PARENT_EMAIL,
    minorKey: OLD_MINOR_KEY,
    isDeceased: false,
    owners: ["doctor-id"],
    createdBy: "doctor-id",
    lastEditedBy: "doctor-id",
    approvedAt: new Date("2026-01-01T12:00:00.000Z"),
    approvedSnapshot: {
      set: {
        fullname: MINOR_NAME,
        parentEmail: OLD_PARENT_EMAIL,
        minorKey: OLD_MINOR_KEY,
      },
      unset: {},
    },
    ...overrides,
  };
}

function makeCurrentGuardian(overrides = {}) {
  return {
    _id: "old-guardian-id",
    email: OLD_PARENT_EMAIL,
    isDeceased: true,
    ...overrides,
  };
}

function makeNewGuardian(overrides = {}) {
  return {
    _id: "new-guardian-id",
    email: NEW_PARENT_EMAIL,
    age: 38,
    isDeceased: false,
    approvedAt: new Date("2026-01-01T12:00:00.000Z"),
    approvedSnapshot: {
      set: {
        children: [{ name: MINOR_NAME }],
      },
    },
    children: [{ name: MINOR_NAME }],
    ...overrides,
  };
}

function mockPatientFindOneSequence(responses) {
  const calls = [];

  Patient.findOne = (query) => {
    const response = responses[calls.length];
    const call = { query };
    calls.push(call);

    return {
      select: (projection) => {
        call.select = projection;
        return {
          lean: async () => response,
        };
      },
      lean: async () => response,
    };
  };

  return calls;
}

function mockPatientUpdateMany(response = { acknowledged: true, matchedCount: 2, modifiedCount: 2 }) {
  const calls = [];

  Patient.updateMany = async (query, update, options) => {
    calls.push({ query, update, options });
    return response;
  };

  return calls;
}

function mockPatientHistoryCreate() {
  const calls = [];

  PatientHistory.create = async (doc) => {
    calls.push(doc);
    return doc;
  };

  return calls;
}

function guardPatientUpdates() {
  Patient.updateMany = async () => {
    throw new Error("Patient.updateMany should not be called for rejected reassignment");
  };
}

function guardPatientHistoryWrites() {
  PatientHistory.create = async () => {
    throw new Error("PatientHistory.create should not be called for rejected reassignment");
  };
  PatientHistory.updateMany = async () => {
    throw new Error("PatientHistory.updateMany should never rewrite old history rows");
  };
}

function guardAppointmentUpdates() {
  Appointment.updateMany = async () => {
    throw new Error("Appointment.updateMany should not be called by guardian reassignment");
  };
}

async function expectReassignmentReject({ responses, body, expectedCode, expectedStatus }) {
  restoreModelMethods();
  mockPatientFindOneSequence(responses);
  guardPatientUpdates();
  guardPatientHistoryWrites();
  guardAppointmentUpdates();

  try {
    await assert.rejects(
      () =>
        reassignMinorGuardianService({
          user: makeDoctor(),
          patientId: "minor-patient-id",
          body: body ?? { newParentEmail: NEW_PARENT_EMAIL },
        }),
      (err) => {
        assert.equal(err.status, expectedStatus);
        assert.equal(err.errorCode, expectedCode);
        return true;
      }
    );
  } finally {
    restoreModelMethods();
  }
}

test("reassignMinorGuardianService reassigns a living minor from deceased guardian to valid living approved guardian", async () => {
  restoreModelMethods();

  const findOneCalls = mockPatientFindOneSequence([
    makeMinor(),
    makeCurrentGuardian(),
    makeNewGuardian(),
  ]);
  const updateCalls = mockPatientUpdateMany();
  const historyCreateCalls = mockPatientHistoryCreate();
  guardAppointmentUpdates();
  PatientHistory.updateMany = async () => {
    throw new Error("PatientHistory.updateMany should never rewrite old history rows");
  };

  try {
    const result = await reassignMinorGuardianService({
      user: makeDoctor(),
      patientId: "minor-patient-id",
      body: { newParentEmail: " NewParent@Example.com " },
    });

    assert.equal(result.updatedCount, 2);
    assert.equal(result.patient.parentEmail, NEW_PARENT_EMAIL);
    assert.equal(result.patient.minorKey, NEW_MINOR_KEY);
    assert.ok(result.patient.approvedAt instanceof Date);
    assert.ok(result.patient.updatedAt instanceof Date);

    assert.deepEqual(findOneCalls, [
      {
        query: {
          _id: "minor-patient-id",
          $or: [{ owners: "doctor-id" }, { createdBy: "doctor-id" }],
        },
      },
      {
        query: { email: OLD_PARENT_EMAIL },
        select: "_id isDeceased",
      },
      {
        query: { email: NEW_PARENT_EMAIL },
        select: "_id email age birthDate dateOfDeath isDeceased approvedAt approvedSnapshot children",
      },
    ]);

    assert.equal(updateCalls.length, 1);
    assert.deepEqual(updateCalls[0].query, {
      $or: [
        { minorKey: OLD_MINOR_KEY },
        { _id: "minor-patient-id" },
        { parentEmail: OLD_PARENT_EMAIL, fullname: MINOR_NAME },
      ],
    });
    assert.deepEqual(updateCalls[0].options, {
      runValidators: true,
      context: "query",
      timestamps: false,
    });

    const updateSet = updateCalls[0].update.$set;
    assert.equal(updateSet.parentEmail, NEW_PARENT_EMAIL);
    assert.equal(updateSet.minorKey, NEW_MINOR_KEY);
    assert.equal(updateSet.lastEditedBy, "doctor-id");
    assert.equal(updateSet.updatedAt, updateSet.approvedAt);
    assert.equal(updateSet.approvedSnapshot.set.fullname, MINOR_NAME);
    assert.equal(updateSet.approvedSnapshot.set.parentEmail, NEW_PARENT_EMAIL);
    assert.equal(updateSet.approvedSnapshot.set.minorKey, NEW_MINOR_KEY);
    assert.equal(updateSet.approvedSnapshot.unset.parentEmail, undefined);
    assert.equal(updateSet.approvedSnapshot.unset.minorKey, undefined);

    assert.deepEqual(historyCreateCalls, [
      {
        patientKey: NEW_MINOR_KEY,
        patientId: "minor-patient-id",
        approvedFromProfile: "minor-patient-id",
        editedBy: "doctor-id",
        approvedSnapshot: updateSet.approvedSnapshot,
        approvedAt: updateSet.approvedAt,
        oldParentEmail: OLD_PARENT_EMAIL,
        newParentEmail: NEW_PARENT_EMAIL,
        oldMinorKey: OLD_MINOR_KEY,
        newMinorKey: NEW_MINOR_KEY,
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("reassignMinorGuardianService rejects when the current guardian is alive", async () => {
  await expectReassignmentReject({
    responses: [makeMinor(), makeCurrentGuardian({ isDeceased: false })],
    expectedCode: "CURRENT_GUARDIAN_NOT_UNAVAILABLE",
    expectedStatus: 409,
  });
});

test("reassignMinorGuardianService rejects when the current guardian is missing", async () => {
  await expectReassignmentReject({
    responses: [makeMinor(), null],
    expectedCode: "CURRENT_GUARDIAN_NOT_UNAVAILABLE",
    expectedStatus: 409,
  });
});

test("reassignMinorGuardianService rejects when the new guardian is missing", async () => {
  await expectReassignmentReject({
    responses: [makeMinor(), makeCurrentGuardian(), null],
    expectedCode: "NEW_GUARDIAN_NOT_FOUND",
    expectedStatus: 404,
  });
});

test("reassignMinorGuardianService rejects when the new guardian is deceased", async () => {
  await expectReassignmentReject({
    responses: [makeMinor(), makeCurrentGuardian(), makeNewGuardian({ isDeceased: true })],
    expectedCode: "NEW_GUARDIAN_DECEASED",
    expectedStatus: 409,
  });
});

test("reassignMinorGuardianService rejects when the new guardian is not adult", async () => {
  await expectReassignmentReject({
    responses: [makeMinor(), makeCurrentGuardian(), makeNewGuardian({ age: 17 })],
    expectedCode: "NEW_GUARDIAN_NOT_ADULT",
    expectedStatus: 409,
  });
});

test("reassignMinorGuardianService rejects when the new guardian is not approved", async () => {
  await expectReassignmentReject({
    responses: [makeMinor(), makeCurrentGuardian(), makeNewGuardian({ approvedAt: null })],
    expectedCode: "NEW_GUARDIAN_NOT_APPROVED",
    expectedStatus: 409,
  });
});

test("reassignMinorGuardianService rejects when minor is not listed under the new guardian", async () => {
  await expectReassignmentReject({
    responses: [
      makeMinor(),
      makeCurrentGuardian(),
      makeNewGuardian({
        approvedSnapshot: { set: { children: [{ name: "Other Child" }] } },
        children: [{ name: "Other Child" }],
      }),
    ],
    expectedCode: "MINOR_NOT_LISTED_UNDER_NEW_GUARDIAN",
    expectedStatus: 409,
  });
});

test("reassignMinorGuardianService rejects unchanged normalized guardian email", async () => {
  await expectReassignmentReject({
    responses: [makeMinor()],
    body: { newParentEmail: " OldParent@Example.com " },
    expectedCode: "GUARDIAN_REASSIGNMENT_NO_CHANGES",
    expectedStatus: 400,
  });
});

test("reassignMinorGuardianService rejects patients that are not living minors or guardian-linked", async () => {
  await expectReassignmentReject({
    responses: [
      makeMinor({
        age: 38,
        birthDate: new Date("1988-01-01T12:00:00.000Z"),
        parentEmail: "",
        minorKey: "",
      }),
    ],
    expectedCode: "GUARDIAN_REASSIGNMENT_NOT_MINOR",
    expectedStatus: 400,
  });
});
