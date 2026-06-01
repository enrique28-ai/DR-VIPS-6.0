import assert from "node:assert/strict";
import dnsPromises from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { after, test } from "node:test";

const originalResolveMx = dnsPromises.resolveMx;
const originalResolve4 = dnsPromises.resolve4;
const originalResolve6 = dnsPromises.resolve6;

dnsPromises.resolveMx = async () => [{ exchange: "mail.example.com", priority: 10 }];
dnsPromises.resolve4 = async () => [];
dnsPromises.resolve6 = async () => [];
syncBuiltinESMExports();

const { default: Patient } = await import("../../../models/Patient.js");
const { default: PatientHistory } = await import("../../../models/PatientHistory.js");
const { default: User } = await import("../../../models/User.js");
const { default: Appointment } = await import("../../../models/Appointment.js");
const { createPatientService, updatePatientService } = await import(
  "../../../services/patients/patientWriteService.js"
);

const originalPatientMethods = {
  create: Patient.create,
  find: Patient.find,
  findOne: Patient.findOne,
  findOneAndUpdate: Patient.findOneAndUpdate,
};

const originalPatientHistoryMethods = {
  create: PatientHistory.create,
};

const originalUserMethods = {
  findOne: User.findOne,
  findOneAndUpdate: User.findOneAndUpdate,
};

const originalAppointmentMethods = {
  updateMany: Appointment.updateMany,
};

after(() => {
  dnsPromises.resolveMx = originalResolveMx;
  dnsPromises.resolve4 = originalResolve4;
  dnsPromises.resolve6 = originalResolve6;
  syncBuiltinESMExports();
  restorePatientMethods();
});

function makeAdultPatient(overrides = {}) {
  return {
    _id: "current-patient-id",
    fullname: "Current Patient",
    email: "current@example.com",
    phone: "+16195550101",
    phoneDigits: "16195550101",
    country: "United States",
    state: "California",
    city: "San Diego",
    birthDate: new Date("1990-01-01T12:00:00.000Z"),
    age: 35,
    ageCategory: "18-59",
    bloodtype: "O+",
    gender: "female",
    organDonor: true,
    bloodDonor: false,
    measurementSystem: "metric",
    heightM: 1.7,
    weightKg: 70,
    diseases: [],
    allergies: [],
    medications: [],
    children: [],
    childrenCount: 0,
    isDeceased: false,
    dateOfDeath: null,
    owners: ["doctor-id"],
    createdBy: "doctor-id",
    lastEditedBy: "doctor-id",
    ...overrides,
  };
}

function makeValidCreateBody(overrides = {}) {
  return {
    fullname: "New Patient",
    email: "new@example.com",
    phone: "6195550102",
    birthDate: "1990-01-01",
    bloodtype: "O+",
    gender: "male",
    organDonor: true,
    bloodDonor: false,
    measurementSystem: "metric",
    height: 1.75,
    weight: 72,
    country: "United States",
    state: "California",
    city: "San Diego",
    ...overrides,
  };
}

function restorePatientMethods() {
  Patient.create = originalPatientMethods.create;
  Patient.find = originalPatientMethods.find;
  Patient.findOne = originalPatientMethods.findOne;
  Patient.findOneAndUpdate = originalPatientMethods.findOneAndUpdate;
  PatientHistory.create = originalPatientHistoryMethods.create;
  User.findOne = originalUserMethods.findOne;
  User.findOneAndUpdate = originalUserMethods.findOneAndUpdate;
  Appointment.updateMany = originalAppointmentMethods.updateMany;
}

function mockPatientFindOneSequence(responses) {
  const calls = [];

  Patient.findOne = (query) => {
    calls.push(query);
    const response = responses[calls.length - 1];

    if (!response || response.kind === "lean") {
      return {
        lean: async () => response?.value,
      };
    }

    if (response.kind === "selectLean") {
      return {
        select: (projection) => {
          if (response.projection) assert.equal(projection, response.projection);
          else assert.match(projection, /_id/);
          return {
            lean: async () => response.value,
          };
        },
      };
    }

    throw new Error(`Unsupported Patient.findOne mock response: ${response.kind}`);
  };

  return calls;
}

function applyUpdateForTest(current, updateDoc) {
  const next = { ...current, ...(updateDoc.$set || {}) };
  for (const field of Object.keys(updateDoc.$unset || {})) {
    delete next[field];
  }
  return next;
}

function guardPendingPortalLookup() {
  Patient.find = () => {
    throw new Error("Patient.find should not be called for adult death-status auto-confirm");
  };
  User.findOne = () => {
    throw new Error("User.findOne should not be called for adult death-status auto-confirm");
  };
}

function guardPendingPortalUserLookup() {
  User.findOne = () => {
    throw new Error("User.findOne should not be called for adult death-status auto-confirm");
  };
}

function mockGuardianChildFind(children = []) {
  const calls = [];

  Patient.find = (query) => {
    const call = { query, select: undefined };
    calls.push(call);
    return {
      select: (projection) => {
        call.select = projection;
        return {
          lean: async () => children,
        };
      },
    };
  };

  return calls;
}

function mockAppointmentDeathArchive() {
  const calls = [];

  Appointment.updateMany = async (query, updateDoc) => {
    calls.push({ query, updateDoc });
    return { acknowledged: true, matchedCount: 2, modifiedCount: 2 };
  };

  return calls;
}

function guardAppointmentDeathArchive() {
  Appointment.updateMany = async () => {
    throw new Error("Appointment.updateMany should not be called");
  };
}

function mockNoPendingPortalDecision(current) {
  const patientFindCalls = [];
  const userFindCalls = [];

  Patient.find = (query) => {
    patientFindCalls.push(query);
    return {
      sort: (sort) => {
        assert.deepEqual(sort, { updatedAt: -1 });
        return {
          select: (projection) => {
            assert.equal(projection, "_id updatedAt");
            return {
              lean: async () => [{ _id: current._id, updatedAt: current.updatedAt }],
            };
          },
        };
      },
    };
  };

  User.findOne = (query) => {
    userFindCalls.push(query);
    return {
      select: (projection) => {
        assert.equal(projection, "lastHealthDecisionAt");
        return {
          lean: async () => ({
            lastHealthDecisionAt: new Date("2026-01-03T12:00:00.000Z"),
          }),
        };
      },
    };
  };

  return { patientFindCalls, userFindCalls };
}

test("createPatientService blocks duplicate email on create", async () => {
  restorePatientMethods();

  const user = { _id: "doctor-id" };
  const duplicate = { _id: "duplicate-patient-id" };
  const findOneCalls = mockPatientFindOneSequence([
    { kind: "selectLean", value: duplicate },
  ]);

  Patient.create = async () => {
    throw new Error("Patient.create should not be called for duplicate email");
  };

  try {
    await assert.rejects(
      () =>
        createPatientService({
          user,
          body: makeValidCreateBody({ email: "New@Example.com" }),
        }),
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.errorCode, "PATIENT_EMAIL_EXISTS");
        assert.equal(err.patientId, duplicate._id);
        return true;
      }
    );

    assert.equal(findOneCalls.length, 1);
    assert.deepEqual(findOneCalls[0], { email: "new@example.com" });
  } finally {
    restorePatientMethods();
  }
});

test("createPatientService blocks duplicate phoneDigits on create", async () => {
  restorePatientMethods();

  const user = { _id: "doctor-id" };
  const duplicate = { _id: "duplicate-patient-id" };
  const findOneCalls = mockPatientFindOneSequence([
    { kind: "selectLean", value: null },
    { kind: "selectLean", value: duplicate, projection: "_id" },
  ]);

  Patient.find = (query) => ({
    sort: (sort) => {
      assert.deepEqual(query, { email: "new@example.com" });
      assert.deepEqual(sort, { updatedAt: -1 });
      return {
        select: (projection) => {
          assert.equal(projection, "_id updatedAt");
          return {
            lean: async () => [],
          };
        },
      };
    },
  });
  Patient.create = async () => {
    throw new Error("Patient.create should not be called for duplicate phone");
  };

  try {
    await assert.rejects(
      () =>
        createPatientService({
          user,
          body: makeValidCreateBody(),
        }),
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.errorCode, "PATIENT_PHONE_EXISTS");
        assert.equal(err.patientId, duplicate._id);
        return true;
      }
    );

    assert.equal(findOneCalls.length, 2);
    assert.equal(findOneCalls[1].phoneDigits, "16195550102");
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService blocks duplicate phoneDigits on update", async () => {
  restorePatientMethods();

  const user = { _id: "doctor-id" };
  const current = makeAdultPatient({ owners: [user._id], createdBy: user._id });
  const duplicate = { _id: "duplicate-patient-id" };
  const findOneCalls = mockPatientFindOneSequence([
    { kind: "lean", value: current },
    { kind: "selectLean", value: duplicate, projection: "_id" },
  ]);

  try {
    await assert.rejects(
      () =>
        updatePatientService({
          user,
          patientId: current._id,
          body: {
            phone: "6195550102",
          },
        }),
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.errorCode, "PATIENT_PHONE_EXISTS");
        assert.equal(err.patientId, duplicate._id);
        return true;
      }
    );

    assert.equal(findOneCalls.length, 2);
    assert.equal(findOneCalls[1].phoneDigits, "16195550102");
    assert.deepEqual(findOneCalls[1]._id, { $ne: current._id });
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService blocks duplicate email on update when current patient has no email", async () => {
  restorePatientMethods();

  const user = { _id: "doctor-id" };
  const current = makeAdultPatient({
    email: undefined,
    owners: [user._id],
    createdBy: user._id,
  });
  const duplicate = { _id: "duplicate-patient-id" };
  const findOneCalls = mockPatientFindOneSequence([
    { kind: "lean", value: current },
    { kind: "selectLean", value: duplicate, projection: "_id" },
  ]);

  try {
    await assert.rejects(
      () =>
        updatePatientService({
          user,
          patientId: current._id,
          body: {
            email: "New@Example.com",
          },
        }),
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.errorCode, "PATIENT_EMAIL_EXISTS");
        assert.equal(err.patientId, duplicate._id);
        return true;
      }
    );

    assert.equal(findOneCalls.length, 2);
    assert.deepEqual(findOneCalls[1], {
      email: "new@example.com",
      _id: { $ne: current._id },
    });
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService rejects changing an existing email", async () => {
  restorePatientMethods();

  const user = { _id: "doctor-id" };
  const current = makeAdultPatient({ owners: [user._id], createdBy: user._id });
  const findOneCalls = mockPatientFindOneSequence([{ kind: "lean", value: current }]);

  try {
    await assert.rejects(
      () =>
        updatePatientService({
          user,
          patientId: current._id,
          body: {
            email: "new@example.com",
          },
        }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(
          err.message,
          "You can not modify the email once it is registered."
        );
        return true;
      }
    );

    assert.equal(findOneCalls.length, 1);
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService immediately approves adult alive-to-deceased changes and archives future active appointments", async () => {
  restorePatientMethods();

  const user = { _id: "doctor-id" };
  const current = makeAdultPatient({
    age: 36,
    updatedAt: new Date("2026-01-02T12:00:00.000Z"),
    approvedAt: new Date("2026-01-02T12:00:00.000Z"),
  });
  const findOneCalls = mockPatientFindOneSequence([
    { kind: "lean", value: current },
    { kind: "selectLean", value: null, projection: "_id" },
    { kind: "selectLean", value: null, projection: "_id" },
  ]);
  const updateCalls = [];
  const historyCalls = [];
  const userDecisionCalls = [];
  const appointmentArchiveCalls = mockAppointmentDeathArchive();
  const guardianChildFindCalls = mockGuardianChildFind([
    { _id: "minor-child-id" },
    { _id: "second-minor-child-id" },
  ]);

  guardPendingPortalUserLookup();

  Patient.findOneAndUpdate = (query, updateDoc, options) => {
    updateCalls.push({ query, updateDoc, options });
    return {
      lean: async (leanOptions) => {
        updateCalls[updateCalls.length - 1].leanOptions = leanOptions;
        return applyUpdateForTest(current, updateDoc);
      },
    };
  };
  PatientHistory.create = async (payload) => {
    historyCalls.push(payload);
    return payload;
  };
  User.findOneAndUpdate = async (query, updateDoc, options) => {
    userDecisionCalls.push({ query, updateDoc, options });
    return null;
  };

  try {
    const body = {
      fullname: current.fullname,
      email: current.email,
      phone: "6195550101",
      birthDate: "1990-01-01",
      diseases: [],
      allergies: [],
      medications: [],
      bloodtype: current.bloodtype,
      gender: current.gender,
      country: current.country,
      state: current.state,
      city: current.city,
      organDonor: current.organDonor,
      bloodDonor: current.bloodDonor,
      children: [],
      childrenCount: 0,
      measurementSystem: current.measurementSystem,
      height: current.heightM,
      weight: current.weightKg,
      isDeceased: true,
      dateOfDeath: "2026-01-15",
      causeOfDeath: "Natural causes",
    };

    const result = await updatePatientService({
      user,
      patientId: current._id,
      body,
    });

    assert.equal(result.isDeceased, true);
    assert.equal(result.causeOfDeath, "Natural causes");
    assert.equal(result.dateOfDeath.toISOString().slice(0, 10), "2026-01-15");
    assert.equal(findOneCalls.length, 3);
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].updateDoc.$set.isDeceased, true);
    assert.equal(updateCalls[0].updateDoc.$set.causeOfDeath, "Natural causes");
    assert.equal(updateCalls[0].updateDoc.$set.dateOfDeath.toISOString().slice(0, 10), "2026-01-15");
    assert(updateCalls[0].updateDoc.$set.approvedAt instanceof Date);
    assert.equal(
      updateCalls[0].updateDoc.$set.updatedAt,
      updateCalls[0].updateDoc.$set.approvedAt
    );
    assert.equal(
      updateCalls[0].updateDoc.$set.approvedSnapshot.set.isDeceased,
      true
    );
    assert.equal(
      updateCalls[0].updateDoc.$set.approvedSnapshot.set.causeOfDeath,
      "Natural causes"
    );
    assert.equal(
      updateCalls[0].updateDoc.$set.approvedSnapshot.set.dateOfDeath.toISOString().slice(0, 10),
      "2026-01-15"
    );
    assert.deepEqual(updateCalls[0].options, {
      new: true,
      runValidators: true,
      context: "query",
      timestamps: false,
    });
    assert.equal(historyCalls.length, 1);
    assert.equal(historyCalls[0].patientEmail, current.email);
    assert.equal(historyCalls[0].patientPhoneDigits, current.phoneDigits);
    assert.equal(historyCalls[0].approvedFromProfile, current._id);
    assert.equal(historyCalls[0].editedBy, user._id);
    assert.equal(historyCalls[0].approvedAt, updateCalls[0].updateDoc.$set.approvedAt);
    assert.deepEqual(
      historyCalls[0].approvedSnapshot,
      updateCalls[0].updateDoc.$set.approvedSnapshot
    );
    assert.deepEqual(userDecisionCalls, [
      {
        query: { email: current.email, role: "patient" },
        updateDoc: { $set: { lastHealthDecisionAt: updateCalls[0].updateDoc.$set.approvedAt } },
        options: { new: false },
      },
    ]);
    assert.deepEqual(guardianChildFindCalls, [
      {
        query: {
          parentEmail: current.email,
          isDeceased: { $ne: true },
        },
        select: "_id",
      },
    ]);
    assert.deepEqual(appointmentArchiveCalls, [
      {
        query: {
          patient: current._id,
          status: { $in: ["pending", "accepted"] },
          start: { $gte: updateCalls[0].updateDoc.$set.approvedAt },
        },
        updateDoc: { $set: { status: "cancelled_due_to_death" } },
      },
      {
        query: {
          patient: { $in: ["minor-child-id", "second-minor-child-id"] },
          status: { $in: ["pending", "accepted"] },
          start: { $gte: updateCalls[0].updateDoc.$set.approvedAt },
        },
        updateDoc: {
          $set: { status: "cancelled_due_to_guardian_unavailable" },
        },
      },
    ]);
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService requires dateOfDeath for adult alive-to-deceased changes", async () => {
  restorePatientMethods();

  const user = { _id: "doctor-id" };
  const current = makeAdultPatient({
    updatedAt: new Date("2026-01-02T12:00:00.000Z"),
    approvedAt: new Date("2026-01-02T12:00:00.000Z"),
  });
  mockPatientFindOneSequence([{ kind: "lean", value: current }]);

  Patient.findOneAndUpdate = async () => {
    throw new Error("Patient.findOneAndUpdate should not be called without dateOfDeath");
  };
  PatientHistory.create = async () => {
    throw new Error("PatientHistory.create should not be called without dateOfDeath");
  };
  User.findOneAndUpdate = async () => {
    throw new Error("User.findOneAndUpdate should not be called without dateOfDeath");
  };

  try {
    await assert.rejects(
      () =>
        updatePatientService({
          user,
          patientId: current._id,
          body: {
            isDeceased: true,
            causeOfDeath: "Natural causes",
          },
        }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.errorCode, "DATE_OF_DEATH_REQUIRED");
        assert.equal(
          err.message,
          "Date of death is required when marking patient as deceased"
        );
        return true;
      }
    );
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService immediately approves adult deceased-to-alive corrections and clears death fields", async () => {
  restorePatientMethods();

  const user = { _id: "doctor-id" };
  const current = makeAdultPatient({
    isDeceased: true,
    dateOfDeath: new Date("2026-01-15T12:00:00.000Z"),
    causeOfDeath: "Natural causes",
    age: 36,
    updatedAt: new Date("2026-01-15T12:00:00.000Z"),
    approvedAt: new Date("2026-01-15T12:00:00.000Z"),
  });
  mockPatientFindOneSequence([{ kind: "lean", value: current }]);
  const updateCalls = [];
  const historyCalls = [];
  const userDecisionCalls = [];

  guardPendingPortalLookup();

  Patient.findOneAndUpdate = (query, updateDoc, options) => {
    updateCalls.push({ query, updateDoc, options });
    return {
      lean: async () => applyUpdateForTest(current, updateDoc),
    };
  };
  PatientHistory.create = async (payload) => {
    historyCalls.push(payload);
    return payload;
  };
  User.findOneAndUpdate = async (query, updateDoc, options) => {
    userDecisionCalls.push({ query, updateDoc, options });
    return null;
  };
  guardAppointmentDeathArchive();

  try {
    const result = await updatePatientService({
      user,
      patientId: current._id,
      body: { isDeceased: false },
    });

    assert.equal(result.isDeceased, false);
    assert.equal(Object.hasOwn(result, "dateOfDeath"), false);
    assert.equal(Object.hasOwn(result, "causeOfDeath"), false);
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].updateDoc.$set.isDeceased, false);
    assert.equal(updateCalls[0].updateDoc.$unset.dateOfDeath, 1);
    assert.equal(updateCalls[0].updateDoc.$unset.causeOfDeath, 1);
    assert(updateCalls[0].updateDoc.$set.approvedAt instanceof Date);
    assert.equal(
      updateCalls[0].updateDoc.$set.approvedSnapshot.set.isDeceased,
      false
    );
    assert.equal(
      updateCalls[0].updateDoc.$set.approvedSnapshot.unset.dateOfDeath,
      1
    );
    assert.equal(
      updateCalls[0].updateDoc.$set.approvedSnapshot.unset.causeOfDeath,
      1
    );
    assert.equal(historyCalls.length, 1);
    assert.equal(userDecisionCalls.length, 1);
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService blocks normal edits for already deceased adults", async () => {
  restorePatientMethods();

  const user = { _id: "doctor-id" };
  const current = makeAdultPatient({
    isDeceased: true,
    dateOfDeath: new Date("2026-01-15T12:00:00.000Z"),
    causeOfDeath: "Natural causes",
    age: 36,
    updatedAt: new Date("2026-01-15T12:00:00.000Z"),
    approvedAt: new Date("2026-01-15T12:00:00.000Z"),
  });
  mockPatientFindOneSequence([{ kind: "lean", value: current }]);

  Patient.find = () => {
    throw new Error("Patient.find should not be called for deceased readonly rejection");
  };
  Patient.findOneAndUpdate = async () => {
    throw new Error("Patient.findOneAndUpdate should not be called for deceased readonly rejection");
  };
  PatientHistory.create = async () => {
    throw new Error("PatientHistory.create should not be called for deceased readonly rejection");
  };
  User.findOneAndUpdate = async () => {
    throw new Error("User.findOneAndUpdate should not be called for deceased readonly rejection");
  };

  try {
    await assert.rejects(
      () =>
        updatePatientService({
          user,
          patientId: current._id,
          body: { city: "Los Angeles" },
        }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.errorCode, "PATIENT_DECEASED_READONLY");
        assert.equal(
          err.message,
          "Deceased patients cannot be edited unless they are changed back to alive."
        );
        return true;
      }
    );
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService immediately approves adult deceased death-field corrections only", async () => {
  restorePatientMethods();

  const user = { _id: "doctor-id" };
  const current = makeAdultPatient({
    isDeceased: true,
    dateOfDeath: new Date("2026-01-15T12:00:00.000Z"),
    causeOfDeath: "Natural causes",
    age: 36,
    updatedAt: new Date("2026-01-15T12:00:00.000Z"),
    approvedAt: new Date("2026-01-15T12:00:00.000Z"),
  });
  mockPatientFindOneSequence([{ kind: "lean", value: current }]);
  const updateCalls = [];
  const historyCalls = [];
  const userDecisionCalls = [];

  guardPendingPortalLookup();

  Patient.findOneAndUpdate = (query, updateDoc, options) => {
    updateCalls.push({ query, updateDoc, options });
    return {
      lean: async () => applyUpdateForTest(current, updateDoc),
    };
  };
  PatientHistory.create = async (payload) => {
    historyCalls.push(payload);
    return payload;
  };
  User.findOneAndUpdate = async (query, updateDoc, options) => {
    userDecisionCalls.push({ query, updateDoc, options });
    return null;
  };
  guardAppointmentDeathArchive();

  try {
    const result = await updatePatientService({
      user,
      patientId: current._id,
      body: {
        dateOfDeath: "2026-01-20",
        causeOfDeath: "Corrected cause",
      },
    });

    assert.equal(result.isDeceased, true);
    assert.equal(result.causeOfDeath, "Corrected cause");
    assert.equal(result.dateOfDeath.toISOString().slice(0, 10), "2026-01-20");
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].updateDoc.$set.isDeceased, undefined);
    assert.equal(updateCalls[0].updateDoc.$set.causeOfDeath, "Corrected cause");
    assert.equal(updateCalls[0].updateDoc.$set.dateOfDeath.toISOString().slice(0, 10), "2026-01-20");
    assert(updateCalls[0].updateDoc.$set.approvedAt instanceof Date);
    assert.equal(
      updateCalls[0].updateDoc.$set.approvedSnapshot.set.causeOfDeath,
      "Corrected cause"
    );
    assert.equal(
      updateCalls[0].updateDoc.$set.approvedSnapshot.set.dateOfDeath.toISOString().slice(0, 10),
      "2026-01-20"
    );
    assert.equal(historyCalls.length, 1);
    assert.equal(userDecisionCalls.length, 1);
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService does not treat unchanged full-form deceased adult payloads as normal edits", async () => {
  restorePatientMethods();

  const user = { _id: "doctor-id" };
  const current = makeAdultPatient({
    isDeceased: true,
    dateOfDeath: new Date("2026-01-15T12:00:00.000Z"),
    causeOfDeath: "Natural causes",
    age: 36,
    updatedAt: new Date("2026-01-15T12:00:00.000Z"),
    approvedAt: new Date("2026-01-15T12:00:00.000Z"),
  });
  const findOneCalls = mockPatientFindOneSequence([
    { kind: "lean", value: current },
    { kind: "selectLean", value: null, projection: "_id" },
    { kind: "selectLean", value: null, projection: "_id" },
  ]);

  Patient.findOneAndUpdate = async () => {
    throw new Error("Patient.findOneAndUpdate should not be called when no changes are detected");
  };
  PatientHistory.create = async () => {
    throw new Error("PatientHistory.create should not be called when no changes are detected");
  };
  User.findOneAndUpdate = async () => {
    throw new Error("User.findOneAndUpdate should not be called when no changes are detected");
  };

  try {
    await assert.rejects(
      () =>
        updatePatientService({
          user,
          patientId: current._id,
          body: {
            fullname: current.fullname,
            email: current.email,
            phone: "6195550101",
            birthDate: "1990-01-01",
            diseases: [],
            allergies: [],
            medications: [],
            bloodtype: current.bloodtype,
            gender: current.gender,
            country: current.country,
            state: current.state,
            city: current.city,
            organDonor: current.organDonor,
            bloodDonor: current.bloodDonor,
            children: [],
            childrenCount: 0,
            measurementSystem: current.measurementSystem,
            height: current.heightM,
            weight: current.weightKg,
            isDeceased: true,
            dateOfDeath: "2026-01-15",
            causeOfDeath: "Natural causes",
          },
        }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.errorCode, "NO_CHANGES");
        return true;
      }
    );

    assert.equal(findOneCalls.length, 3);
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService blocks adult death-status changes mixed with actual normal edits", async () => {
  restorePatientMethods();

  const user = { _id: "doctor-id" };
  const current = makeAdultPatient({
    updatedAt: new Date("2026-01-02T12:00:00.000Z"),
    approvedAt: new Date("2026-01-02T12:00:00.000Z"),
  });
  mockPatientFindOneSequence([{ kind: "lean", value: current }]);

  Patient.find = () => {
    throw new Error("Patient.find should not be called for mixed death-status rejection");
  };
  Patient.findOneAndUpdate = async () => {
    throw new Error("Patient.findOneAndUpdate should not be called for mixed death-status rejection");
  };
  PatientHistory.create = async () => {
    throw new Error("PatientHistory.create should not be called for mixed death-status rejection");
  };
  User.findOneAndUpdate = async () => {
    throw new Error("User.findOneAndUpdate should not be called for mixed death-status rejection");
  };

  try {
    await assert.rejects(
      () =>
        updatePatientService({
          user,
          patientId: current._id,
          body: {
            isDeceased: true,
            dateOfDeath: "2026-01-15",
            causeOfDeath: "Natural causes",
            city: "Los Angeles",
          },
        }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.errorCode, "DEATH_STATUS_UPDATE_ONLY");
        assert.equal(err.message, "Death status must be updated separately.");
        return true;
      }
    );
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService returns mixed-edit error before normal adult field validators", async () => {
  restorePatientMethods();

  const user = { _id: "doctor-id" };
  const current = makeAdultPatient({
    updatedAt: new Date("2026-01-02T12:00:00.000Z"),
    approvedAt: new Date("2026-01-02T12:00:00.000Z"),
  });
  mockPatientFindOneSequence([{ kind: "lean", value: current }]);

  Patient.find = () => {
    throw new Error("Patient.find should not be called for mixed death-status rejection");
  };
  Patient.findOneAndUpdate = async () => {
    throw new Error("Patient.findOneAndUpdate should not be called for mixed death-status rejection");
  };
  PatientHistory.create = async () => {
    throw new Error("PatientHistory.create should not be called for mixed death-status rejection");
  };
  User.findOneAndUpdate = async () => {
    throw new Error("User.findOneAndUpdate should not be called for mixed death-status rejection");
  };

  try {
    await assert.rejects(
      () =>
        updatePatientService({
          user,
          patientId: current._id,
          body: {
            isDeceased: true,
            dateOfDeath: "2026-01-15",
            causeOfDeath: "Natural causes",
            email: "other@example.com",
          },
        }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.errorCode, "DEATH_STATUS_UPDATE_ONLY");
        assert.equal(err.message, "Death status must be updated separately.");
        return true;
      }
    );
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService keeps normal adult non-death edits pending for patient approval", async () => {
  restorePatientMethods();

  const user = { _id: "doctor-id" };
  const current = makeAdultPatient({
    updatedAt: new Date("2026-01-02T12:00:00.000Z"),
    approvedAt: new Date("2026-01-02T12:00:00.000Z"),
  });
  mockPatientFindOneSequence([{ kind: "lean", value: current }]);
  const { patientFindCalls, userFindCalls } = mockNoPendingPortalDecision(current);
  const updateCalls = [];

  Patient.findOneAndUpdate = (query, updateDoc, options) => {
    updateCalls.push({ query, updateDoc, options });
    return {
      lean: async () => applyUpdateForTest(current, updateDoc),
    };
  };
  PatientHistory.create = async () => {
    throw new Error("PatientHistory.create should not be called for normal adult edits");
  };
  User.findOneAndUpdate = async () => {
    throw new Error("User.findOneAndUpdate should not be called for normal adult edits");
  };

  try {
    const result = await updatePatientService({
      user,
      patientId: current._id,
      body: { city: "Los Angeles" },
    });

    assert.equal(result.city, "Los Angeles");
    assert.equal(patientFindCalls.length, 1);
    assert.equal(userFindCalls.length, 1);
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].updateDoc.$set.city, "Los Angeles");
    assert.equal(Object.hasOwn(updateCalls[0].updateDoc.$set, "approvedAt"), false);
    assert.equal(Object.hasOwn(updateCalls[0].updateDoc.$set, "approvedSnapshot"), false);
    assert.deepEqual(updateCalls[0].options, {
      new: true,
      runValidators: true,
      context: "query",
    });
  } finally {
    restorePatientMethods();
  }
});
