import assert from "node:assert/strict";
import { after, test } from "node:test";

import Patient from "../../../models/Patient.js";
import User from "../../../models/User.js";
import {
  getGlobalPatientPreviewService,
  getPatientByIdService,
} from "../../../services/patients/patientReadService.js";
import { updatePatientService } from "../../../services/patients/patientWriteService.js";

const originalPatientMethods = {
  create: Patient.create,
  find: Patient.find,
  findById: Patient.findById,
  findByIdAndUpdate: Patient.findByIdAndUpdate,
  findOne: Patient.findOne,
  findOneAndUpdate: Patient.findOneAndUpdate,
};
const originalUserMethods = {
  findOne: User.findOne,
};
const GLOBAL_PATIENT_PREVIEW_FIELDS =
  "_id fullname email phone age gender country state city approvedAt updatedAt createdBy owners";
const GLOBAL_PATIENT_PREVIEW_KEYS = [
  "_id",
  "fullname",
  "email",
  "phone",
  "age",
  "gender",
  "country",
  "state",
  "city",
  "approvedAt",
  "updatedAt",
  "amIOwner",
];

after(() => {
  restorePatientMethods();
});

function restorePatientMethods() {
  Patient.create = originalPatientMethods.create;
  Patient.find = originalPatientMethods.find;
  Patient.findById = originalPatientMethods.findById;
  Patient.findByIdAndUpdate = originalPatientMethods.findByIdAndUpdate;
  Patient.findOne = originalPatientMethods.findOne;
  Patient.findOneAndUpdate = originalPatientMethods.findOneAndUpdate;
  User.findOne = originalUserMethods.findOne;
}

function makeDoctorA(overrides = {}) {
  return {
    _id: "doctor-a",
    role: "doctor",
    email: "doctor-a@example.com",
    ...overrides,
  };
}

function makePatient(overrides = {}) {
  return {
    _id: "patient-id",
    fullname: "Owned Patient",
    email: "patient@example.com",
    phone: "+16195550101",
    phoneDigits: "16195550101",
    birthDate: new Date("1990-01-01T12:00:00.000Z"),
    age: 36,
    bloodtype: "O+",
    gender: "female",
    organDonor: true,
    bloodDonor: false,
    measurementSystem: "metric",
    heightM: 1.7,
    weightKg: 70,
    country: "United States",
    state: "California",
    city: "San Diego",
    diseases: [],
    allergies: [],
    medications: [],
    children: [],
    owners: ["doctor-b"],
    createdBy: "doctor-b",
    ...overrides,
  };
}

function mockPatientFindOneLean(response) {
  const calls = [];

  Patient.findOne = (query) => {
    const call = { query, leanOptions: undefined };
    calls.push(call);
    return {
      lean: async (options) => {
        call.leanOptions = options;
        return response;
      },
    };
  };

  return calls;
}

function mockPendingHealthDecisionFind() {
  const calls = [];

  Patient.find = (query) => {
    const call = { query, sort: undefined, select: undefined };
    calls.push(call);
    return {
      sort: (sort) => {
        call.sort = sort;
        return {
          select: (projection) => {
            call.select = projection;
            return {
              lean: async () => [],
            };
          },
        };
      },
    };
  };

  return calls;
}

function mockPatientFindById(response) {
  const calls = [];

  Patient.findById = (id) => {
    const call = { id, select: undefined, leanOptions: undefined };
    calls.push(call);
    return {
      select: (projection) => {
        call.select = projection;
        return {
          lean: async (options) => {
            call.leanOptions = options;
            return response;
          },
        };
      },
      lean: async (options) => {
        call.leanOptions = options;
        return response;
      },
    };
  };

  return calls;
}

test("getPatientByIdService rejects patient owned only by another doctor", async () => {
  restorePatientMethods();

  const findOneCalls = mockPatientFindOneLean(null);

  try {
    await assert.rejects(
      () =>
        getPatientByIdService({
          user: makeDoctorA(),
          patientId: "patient-id",
          lang: "",
        }),
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.message, "Paciente no encontrado");
        return true;
      }
    );

    assert.deepEqual(findOneCalls, [
      {
        query: {
          _id: "patient-id",
          $or: [{ owners: "doctor-a" }, { createdBy: "doctor-a" }],
        },
        leanOptions: { virtuals: true },
      },
    ]);
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService rejects patient owned only by another doctor", async () => {
  restorePatientMethods();

  const findOneCalls = mockPatientFindOneLean(null);
  Patient.findOneAndUpdate = async () => {
    throw new Error("Patient.findOneAndUpdate should not be called without ownership");
  };

  try {
    await assert.rejects(
      () =>
        updatePatientService({
          user: makeDoctorA(),
          patientId: "patient-id",
          body: { city: "Los Angeles" },
        }),
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.message, "Patient not found");
        return true;
      }
    );

    assert.deepEqual(findOneCalls, [
      {
        query: {
          _id: "patient-id",
          $or: [{ owners: "doctor-a" }, { createdBy: "doctor-a" }],
        },
        leanOptions: undefined,
      },
    ]);
  } finally {
    restorePatientMethods();
  }
});

test("getPatientByIdService allows doctor in owners", async () => {
  restorePatientMethods();

  const patient = makePatient({ owners: ["doctor-b", "doctor-a"] });
  const findOneCalls = mockPatientFindOneLean(patient);

  try {
    const result = await getPatientByIdService({
      user: makeDoctorA(),
      patientId: "patient-id",
      lang: "",
    });

    assert.equal(result._id, "patient-id");
    assert.deepEqual(result.owners, ["doctor-b", "doctor-a"]);
    assert.deepEqual(findOneCalls[0].query, {
      _id: "patient-id",
      $or: [{ owners: "doctor-a" }, { createdBy: "doctor-a" }],
    });
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService allows doctor in owners", async () => {
  restorePatientMethods();

  const current = makePatient({ owners: ["doctor-b", "doctor-a"] });
  const updated = { ...current, city: "Los Angeles" };
  const findOneCalls = mockPatientFindOneLean(current);
  const pendingFindCalls = mockPendingHealthDecisionFind();
  const updateCalls = [];

  User.findOne = (query) => {
    assert.deepEqual(query, { email: current.email, role: "doctor" });
    return { select: () => ({ lean: async () => null }) };
  };

  Patient.findOneAndUpdate = (query, updateDoc, options) => {
    updateCalls.push({ query, updateDoc, options });
    return {
      lean: async (leanOptions) => {
        updateCalls[updateCalls.length - 1].leanOptions = leanOptions;
        return updated;
      },
    };
  };

  try {
    const result = await updatePatientService({
      user: makeDoctorA(),
      patientId: "patient-id",
      body: { city: "Los Angeles" },
    });

    assert.equal(result.city, "Los Angeles");
    assert.deepEqual(findOneCalls[0].query, {
      _id: "patient-id",
      $or: [{ owners: "doctor-a" }, { createdBy: "doctor-a" }],
    });
    assert.deepEqual(pendingFindCalls[0].query, { email: "patient@example.com" });
    assert.equal(updateCalls.length, 1);
    assert.deepEqual(updateCalls[0].query, {
      _id: "patient-id",
      $or: [{ owners: "doctor-a" }, { createdBy: "doctor-a" }],
    });
    assert.equal(updateCalls[0].updateDoc.$set.city, "Los Angeles");
    assert.equal(updateCalls[0].updateDoc.$set.lastEditedBy, "doctor-a");
    assert.deepEqual(updateCalls[0].options, {
      new: true,
      runValidators: true,
      context: "query",
    });
    assert.deepEqual(updateCalls[0].leanOptions, { virtuals: true });
  } finally {
    restorePatientMethods();
  }
});

test("getGlobalPatientPreviewService does not import automatically", async () => {
  restorePatientMethods();

  const approvedAt = new Date("2026-01-01T00:00:00.000Z");
  const updatedAt = new Date("2026-01-02T00:00:00.000Z");
  const findByIdCalls = mockPatientFindById(
    makePatient({
      approvedAt,
      updatedAt,
      diagnosis: "private diagnosis",
      diagnoses: ["private diagnosis"],
      medicalHistory: ["private history"],
      healthInfo: { private: true },
      history: ["private version"],
      birthCountry: "Mexico",
      birthState: "Baja California",
      birthCity: "Tijuana",
      parentEmail: "parent@example.com",
      approvedSnapshot: { allergies: ["snapshot private"] },
      lastEditedBy: "doctor-b",
      privateNotes: "private fixture sentinel",
    })
  );

  Patient.create = async () => {
    throw new Error("Patient.create should not be called for global preview");
  };
  Patient.findByIdAndUpdate = async () => {
    throw new Error("Patient.findByIdAndUpdate should not be called for global preview");
  };

  try {
    const result = await getGlobalPatientPreviewService({
      user: makeDoctorA(),
      patientId: "patient-id",
    });

    assert.equal(result._id, "patient-id");
    assert.equal(result.amIOwner, false);
    assert.deepEqual(
      Object.keys(result).sort(),
      [...GLOBAL_PATIENT_PREVIEW_KEYS].sort()
    );
    assert.deepEqual(result, {
      _id: "patient-id",
      fullname: "Owned Patient",
      email: "patient@example.com",
      phone: "+16195550101",
      age: 36,
      gender: "female",
      country: "United States",
      state: "California",
      city: "San Diego",
      approvedAt,
      updatedAt,
      amIOwner: false,
    });
    for (const excludedField of [
      "owners",
      "createdBy",
      "diagnoses",
      "diagnosis",
      "medicalHistory",
      "healthInfo",
      "allergies",
      "medications",
      "history",
      "birthCountry",
      "birthState",
      "birthCity",
      "parentEmail",
      "approvedSnapshot",
      "phoneDigits",
      "lastEditedBy",
      "privateNotes",
    ]) {
      assert.equal(
        Object.hasOwn(result, excludedField),
        false,
        `${excludedField} should not be exposed in global preview`
      );
    }
    assert.deepEqual(findByIdCalls, [
      {
        id: "patient-id",
        select: GLOBAL_PATIENT_PREVIEW_FIELDS,
        leanOptions: { virtuals: true },
      },
    ]);
  } finally {
    restorePatientMethods();
  }
});

test("getGlobalPatientPreviewService keeps owner status without exposing ownership fields", async () => {
  restorePatientMethods();

  const findByIdCalls = mockPatientFindById(
    makePatient({ createdBy: "doctor-b", owners: ["doctor-b", "doctor-a"] })
  );

  try {
    const result = await getGlobalPatientPreviewService({
      user: makeDoctorA(),
      patientId: "patient-id",
    });

    assert.equal(result.amIOwner, true);
    assert.equal(Object.hasOwn(result, "owners"), false);
    assert.equal(Object.hasOwn(result, "createdBy"), false);
    assert.deepEqual(findByIdCalls, [
      {
        id: "patient-id",
        select: GLOBAL_PATIENT_PREVIEW_FIELDS,
        leanOptions: { virtuals: true },
      },
    ]);
  } finally {
    restorePatientMethods();
  }
});

test("getGlobalPatientPreviewService keeps missing patient as 404", async () => {
  restorePatientMethods();

  const findByIdCalls = mockPatientFindById(null);

  try {
    await assert.rejects(
      () =>
        getGlobalPatientPreviewService({
          user: makeDoctorA(),
          patientId: "missing-patient-id",
        }),
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.message, "Patient not found");
        return true;
      }
    );

    assert.deepEqual(findByIdCalls, [
      {
        id: "missing-patient-id",
        select: GLOBAL_PATIENT_PREVIEW_FIELDS,
        leanOptions: { virtuals: true },
      },
    ]);
  } finally {
    restorePatientMethods();
  }
});
