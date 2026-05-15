import assert from "node:assert/strict";
import { after, test } from "node:test";

import Patient from "../../../models/Patient.js";
import {
  getGlobalPatientPreviewService,
  getPatientByIdService,
  importPatientService,
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

test("importPatientService adds doctor to owners without cloning", async () => {
  restorePatientMethods();

  const findByIdCalls = mockPatientFindById({ _id: "patient-id", createdBy: "doctor-b" });
  const updateCalls = [];

  Patient.create = async () => {
    throw new Error("Patient.create should not be called for global import");
  };
  Patient.findByIdAndUpdate = (id, updateDoc, options) => {
    updateCalls.push({ id, updateDoc, options });
    return {
      lean: async (leanOptions) => {
        updateCalls[updateCalls.length - 1].leanOptions = leanOptions;
        return makePatient({ owners: ["doctor-b", "doctor-a"] });
      },
    };
  };

  try {
    const result = await importPatientService({
      user: makeDoctorA(),
      patientId: "patient-id",
    });

    assert.equal(result.message, "Patient imported successfully");
    assert.deepEqual(result.patient.owners, ["doctor-b", "doctor-a"]);
    assert.deepEqual(findByIdCalls, [
      {
        id: "patient-id",
        select: "_id createdBy",
        leanOptions: undefined,
      },
    ]);
    assert.deepEqual(updateCalls, [
      {
        id: "patient-id",
        updateDoc: {
          $addToSet: { owners: { $each: ["doctor-a", "doctor-b"] } },
        },
        options: { new: true, timestamps: false },
        leanOptions: { virtuals: true },
      },
    ]);
  } finally {
    restorePatientMethods();
  }
});

test("getGlobalPatientPreviewService does not import automatically", async () => {
  restorePatientMethods();

  const findByIdCalls = mockPatientFindById(makePatient());

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
    assert.deepEqual(findByIdCalls, [
      {
        id: "patient-id",
        select: undefined,
        leanOptions: { virtuals: true },
      },
    ]);
  } finally {
    restorePatientMethods();
  }
});
