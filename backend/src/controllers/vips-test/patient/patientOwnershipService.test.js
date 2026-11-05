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

for (const patientId of ["patient-id", "missing-id", "not-an-object-id"]) {
  test(`legacy global preview cannot confirm ${patientId} or query patient data`, async () => {
    restorePatientMethods();
    Patient.findById = () => { throw new Error("Legacy preview must not query patients"); };
    Patient.findOne = () => { throw new Error("Legacy preview must not query patients"); };
    try {
      await assert.rejects(() => getGlobalPatientPreviewService({ user: makeDoctorA(), patientId }), (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.message, "Patient identification is required");
        return true;
      });
    } finally { restorePatientMethods(); }
  });
}
