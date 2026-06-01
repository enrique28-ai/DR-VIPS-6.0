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
  findOneAndUpdate: User.findOneAndUpdate,
};

const originalAppointmentMethods = {
  updateMany: Appointment.updateMany,
};

const UPDATE_PARENT_PROJECTION = "_id age children approvedAt approvedSnapshot isDeceased";

after(() => {
  dnsPromises.resolveMx = originalResolveMx;
  dnsPromises.resolve4 = originalResolve4;
  dnsPromises.resolve6 = originalResolve6;
  syncBuiltinESMExports();
  restorePatientMethods();
});

function minorBirthDate() {
  const year = new Date().getFullYear() - 10;
  return `${year}-01-01`;
}

function makeMinorCreateBody(overrides = {}) {
  return {
    fullname: "Minor Patient",
    parentEmail: "Parent@Example.com",
    birthDate: minorBirthDate(),
    bloodtype: "O+",
    gender: "female",
    organDonor: false,
    bloodDonor: false,
    measurementSystem: "metric",
    height: 1.35,
    weight: 32,
    country: "United States",
    state: "California",
    city: "San Diego",
    ...overrides,
  };
}

function makeApprovedAdultParent(overrides = {}) {
  return {
    _id: "parent-patient-id",
    age: 38,
    approvedAt: new Date("2026-01-01T12:00:00.000Z"),
    approvedSnapshot: {
      children: [{ name: "Minor Patient" }],
    },
    children: [{ name: "Minor Patient" }],
    ...overrides,
  };
}

function makeMinorPatient(overrides = {}) {
  return {
    _id: "minor-patient-id",
    fullname: "Minor Patient",
    birthDate: new Date(`${minorBirthDate()}T12:00:00.000Z`),
    age: 10,
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
    parentEmail: "parent@example.com",
    minorKey: "parent@example.com::minor patient",
    owners: ["doctor-id"],
    createdBy: "doctor-id",
    lastEditedBy: "doctor-id",
    ...overrides,
  };
}

function restorePatientMethods() {
  Patient.create = originalPatientMethods.create;
  Patient.find = originalPatientMethods.find;
  Patient.findOne = originalPatientMethods.findOne;
  Patient.findOneAndUpdate = originalPatientMethods.findOneAndUpdate;
  PatientHistory.create = originalPatientHistoryMethods.create;
  User.findOneAndUpdate = originalUserMethods.findOneAndUpdate;
  Appointment.updateMany = originalAppointmentMethods.updateMany;
}

function mockParentFindOne(parentDoc) {
  const calls = [];

  Patient.findOne = (query) => {
    calls.push(query);
    return {
      select: (projection) => {
        assert.equal(projection, "_id age children approvedAt approvedSnapshot");
        return {
          lean: async () => parentDoc,
        };
      },
    };
  };

  return calls;
}

function mockPatientFindOneSequence(responses) {
  const calls = [];

  Patient.findOne = (query) => {
    const response = responses[calls.length];
    const call = { query, sort: undefined, select: undefined };
    calls.push(call);

    if (!response || response.kind === "lean") {
      return {
        lean: async () => response?.value,
      };
    }

    if (response.kind === "selectLean") {
      return {
        select: (projection) => {
          call.select = projection;
          if (response.projection) assert.equal(projection, response.projection);
          return {
            lean: async () => response.value,
          };
        },
      };
    }

    if (response.kind === "sortSelectLean") {
      return {
        sort: (sort) => {
          call.sort = sort;
          return {
            select: (projection) => {
              call.select = projection;
              if (response.projection) assert.equal(projection, response.projection);
              return {
                lean: async () => response.value,
              };
            },
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

function mockAppointmentDeathArchive() {
  const calls = [];

  Appointment.updateMany = async (query, updateDoc) => {
    calls.push({ query, updateDoc });
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  };

  return calls;
}

function guardAppointmentDeathArchive() {
  Appointment.updateMany = async () => {
    throw new Error("Appointment.updateMany should not be called");
  };
}

function rejectCreate() {
  Patient.create = async () => {
    throw new Error("Patient.create should not be called for invalid minor data");
  };
}

test("createPatientService requires parentEmail for minors", async () => {
  restorePatientMethods();
  rejectCreate();

  Patient.findOne = () => {
    throw new Error("Patient.findOne should not be called without parentEmail");
  };

  try {
    await assert.rejects(
      () =>
        createPatientService({
          user: { _id: "doctor-id" },
          body: makeMinorCreateBody({ parentEmail: "" }),
        }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.errorCode, "PARENT_EMAIL_REQUIRED");
        return true;
      }
    );
  } finally {
    restorePatientMethods();
  }
});

test("createPatientService rejects minors when parent is not found", async () => {
  restorePatientMethods();
  rejectCreate();

  const findOneCalls = mockParentFindOne(null);

  try {
    await assert.rejects(
      () =>
        createPatientService({
          user: { _id: "doctor-id" },
          body: makeMinorCreateBody(),
        }),
      (err) => {
        assert.equal(err.status, 403);
        assert.equal(err.errorCode, "PARENT_NOT_FOUND");
        return true;
      }
    );

    assert.deepEqual(findOneCalls, [{ email: "parent@example.com" }]);
  } finally {
    restorePatientMethods();
  }
});

test("createPatientService rejects minors when parent is not adult", async () => {
  restorePatientMethods();
  rejectCreate();

  const findOneCalls = mockParentFindOne(makeApprovedAdultParent({ age: 17 }));

  try {
    await assert.rejects(
      () =>
        createPatientService({
          user: { _id: "doctor-id" },
          body: makeMinorCreateBody(),
        }),
      (err) => {
        assert.equal(err.status, 403);
        assert.equal(err.errorCode, "PARENT_NOT_ADULT");
        return true;
      }
    );

    assert.equal(findOneCalls.length, 1);
  } finally {
    restorePatientMethods();
  }
});

test("createPatientService rejects minors when parent is not approved", async () => {
  restorePatientMethods();
  rejectCreate();

  const findOneCalls = mockParentFindOne(
    makeApprovedAdultParent({ approvedAt: null })
  );

  try {
    await assert.rejects(
      () =>
        createPatientService({
          user: { _id: "doctor-id" },
          body: makeMinorCreateBody(),
        }),
      (err) => {
        assert.equal(err.status, 403);
        assert.equal(err.errorCode, "PARENT_NOT_APPROVED");
        return true;
      }
    );

    assert.equal(findOneCalls.length, 1);
  } finally {
    restorePatientMethods();
  }
});

test("createPatientService rejects minors not listed in parent's children", async () => {
  restorePatientMethods();
  rejectCreate();

  const findOneCalls = mockParentFindOne(
    makeApprovedAdultParent({
      approvedSnapshot: {
        children: [{ name: "Other Child" }],
      },
      children: [{ name: "Other Child" }],
    })
  );

  try {
    await assert.rejects(
      () =>
        createPatientService({
          user: { _id: "doctor-id" },
          body: makeMinorCreateBody(),
        }),
      (err) => {
        assert.equal(err.status, 403);
        assert.equal(err.errorCode, "MINOR_NOT_LISTED");
        return true;
      }
    );

    assert.equal(findOneCalls.length, 1);
  } finally {
    restorePatientMethods();
  }
});

test("createPatientService creates a minor with parentEmail without saving it as minor email", async () => {
  restorePatientMethods();

  const parentFindOneCalls = mockParentFindOne(makeApprovedAdultParent());
  const parentFindOne = Patient.findOne;
  const guardianDecisionCalls = [];
  const createCalls = [];

  Patient.findOne = (query) => {
    if (query.email) return parentFindOne(query);

    guardianDecisionCalls.push(query);
    return {
      sort: (sort) => {
        assert.deepEqual(sort, { updatedAt: -1 });
        return {
          select: (projection) => {
            assert.equal(projection, "updatedAt approvedAt");
            return {
              lean: async () => null,
            };
          },
        };
      },
    };
  };

  Patient.create = async (payload) => {
    createCalls.push(payload);
    return {
      toObject: () => ({ _id: "minor-patient-id", ...payload }),
    };
  };

  try {
    const body = makeMinorCreateBody();
    const result = await createPatientService({
      user: { _id: "doctor-id" },
      body,
    });

    assert.equal(parentFindOneCalls.length, 1);
    assert.deepEqual(parentFindOneCalls[0], { email: "parent@example.com" });
    assert.equal(guardianDecisionCalls.length, 1);
    assert.equal(createCalls.length, 1);

    const payload = createCalls[0];
    assert.equal(payload.parentEmail, "parent@example.com");
    assert.equal(payload.fullname, "Minor Patient");
    assert.equal(payload.minorKey, "parent@example.com::minor patient");
    assert(payload.birthDate instanceof Date);
    assert.equal(payload.birthDate.toISOString().slice(0, 10), body.birthDate);
    assert.equal(Object.hasOwn(payload, "email"), false);
    assert.equal(Object.hasOwn(payload, "phone"), false);
    assert.equal(Object.hasOwn(payload, "phoneDigits"), false);

    assert.equal(result.parentEmail, "parent@example.com");
    assert.equal(Object.hasOwn(result, "email"), false);
  } finally {
    restorePatientMethods();
  }
});

test("createPatientService rejects minors declaring children", async () => {
  restorePatientMethods();
  rejectCreate();

  Patient.findOne = () => {
    throw new Error("Patient.findOne should not be called for minor children data");
  };

  try {
    await assert.rejects(
      () =>
        createPatientService({
          user: { _id: "doctor-id" },
          body: makeMinorCreateBody({
            childrenCount: 1,
            children: [{ name: "Child Of Minor" }],
          }),
        }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.errorCode, "MINOR_CANNOT_DECLARE_CHILDREN");
        return true;
      }
    );
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService lets doctors propose minor fullname rename without changing minorKey", async () => {
  restorePatientMethods();

  const current = makeMinorPatient();
  const parent = makeApprovedAdultParent({
    approvedSnapshot: {
      set: {
        children: [{ name: "Minor Patient" }, { name: "Sibling Child" }],
      },
    },
    children: [{ name: "Minor Patient" }, { name: "Sibling Child" }],
  });

  const findOneCalls = mockPatientFindOneSequence([
    { kind: "lean", value: current },
    {
      kind: "selectLean",
      value: parent,
      projection: UPDATE_PARENT_PROJECTION,
    },
    { kind: "sortSelectLean", value: null, projection: "updatedAt approvedAt" },
  ]);
  const updateCalls = [];

  Patient.findOneAndUpdate = (query, updateDoc, options) => {
    updateCalls.push({ query, updateDoc, options });
    return {
      lean: async (leanOptions) => {
        updateCalls[updateCalls.length - 1].leanOptions = leanOptions;
        return {
          ...current,
          ...updateDoc.$set,
          minorKey: current.minorKey,
        };
      },
    };
  };

  try {
    const result = await updatePatientService({
      user: { _id: "doctor-id" },
      patientId: current._id,
      body: { fullname: "  Corrected Minor  " },
    });

    assert.equal(result.fullname, "Corrected Minor");
    assert.equal(result.minorKey, "parent@example.com::minor patient");
    assert.equal(findOneCalls.length, 3);
    assert.deepEqual(findOneCalls[1].query, { email: "parent@example.com" });
    assert.equal(findOneCalls[2].query.parentEmail, "parent@example.com");
    assert.equal(findOneCalls[2].query.minorKey, "parent@example.com::minor patient");
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].updateDoc.$set.fullname, "Corrected Minor");
    assert.equal(Object.hasOwn(updateCalls[0].updateDoc.$set, "minorKey"), false);
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

test("updatePatientService keeps minor death-status changes under guardian approval", async () => {
  restorePatientMethods();

  const current = makeMinorPatient({
    isDeceased: false,
    dateOfDeath: null,
    updatedAt: new Date("2026-01-02T12:00:00.000Z"),
    approvedAt: new Date("2026-01-02T12:00:00.000Z"),
  });
  const parent = makeApprovedAdultParent();

  const findOneCalls = mockPatientFindOneSequence([
    { kind: "lean", value: current },
    {
      kind: "selectLean",
      value: parent,
      projection: UPDATE_PARENT_PROJECTION,
    },
    { kind: "sortSelectLean", value: null, projection: "updatedAt approvedAt" },
  ]);
  const updateCalls = [];

  Patient.findOneAndUpdate = (query, updateDoc, options) => {
    updateCalls.push({ query, updateDoc, options });
    return {
      lean: async (leanOptions) => {
        updateCalls[updateCalls.length - 1].leanOptions = leanOptions;
        return applyUpdateForTest(current, updateDoc);
      },
    };
  };
  PatientHistory.create = async () => {
    throw new Error("PatientHistory.create should not be called for minor pending edits");
  };
  User.findOneAndUpdate = async () => {
    throw new Error("User.findOneAndUpdate should not be called for minor pending edits");
  };

  try {
    const result = await updatePatientService({
      user: { _id: "doctor-id" },
      patientId: current._id,
      body: {
        isDeceased: true,
        dateOfDeath: "2026-01-15",
        causeOfDeath: "Accident",
      },
    });

    assert.equal(result.isDeceased, true);
    assert.equal(result.causeOfDeath, "Accident");
    assert.equal(result.dateOfDeath.toISOString().slice(0, 10), "2026-01-15");
    assert.equal(findOneCalls.length, 3);
    assert.deepEqual(findOneCalls[1].query, { email: "parent@example.com" });
    assert.equal(findOneCalls[2].query.parentEmail, "parent@example.com");
    assert.equal(findOneCalls[2].query.minorKey, "parent@example.com::minor patient");
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].updateDoc.$set.isDeceased, true);
    assert.equal(updateCalls[0].updateDoc.$set.causeOfDeath, "Accident");
    assert.equal(updateCalls[0].updateDoc.$set.dateOfDeath.toISOString().slice(0, 10), "2026-01-15");
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

test("updatePatientService keeps missing guardian as parent not found", async () => {
  restorePatientMethods();

  const current = makeMinorPatient({
    isDeceased: false,
    dateOfDeath: null,
    updatedAt: new Date("2026-01-02T12:00:00.000Z"),
    approvedAt: new Date("2026-01-02T12:00:00.000Z"),
  });

  const findOneCalls = mockPatientFindOneSequence([
    { kind: "lean", value: current },
    {
      kind: "selectLean",
      value: null,
      projection: UPDATE_PARENT_PROJECTION,
    },
  ]);

  Patient.findOneAndUpdate = async () => {
    throw new Error("Patient.findOneAndUpdate should not be called when guardian is missing");
  };
  PatientHistory.create = async () => {
    throw new Error("PatientHistory.create should not be called when guardian is missing");
  };
  User.findOneAndUpdate = async () => {
    throw new Error("User.findOneAndUpdate should not be called when guardian is missing");
  };

  try {
    await assert.rejects(
      () =>
        updatePatientService({
          user: { _id: "doctor-id" },
          patientId: current._id,
          body: {
            isDeceased: true,
            dateOfDeath: "2026-01-15",
            causeOfDeath: "Accident",
          },
        }),
      (err) => {
        assert.equal(err.status, 403);
        assert.equal(err.errorCode, "PARENT_NOT_FOUND");
        return true;
      }
    );

    assert.equal(findOneCalls.length, 2);
    assert.deepEqual(findOneCalls[1].query, { email: "parent@example.com" });
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService blocks normal edits for already deceased minors", async () => {
  restorePatientMethods();

  const current = makeMinorPatient({
    isDeceased: true,
    dateOfDeath: new Date("2026-01-15T12:00:00.000Z"),
    causeOfDeath: "Accident",
    ageCategory: "0-12",
    updatedAt: new Date("2026-01-15T12:00:00.000Z"),
    approvedAt: new Date("2026-01-15T12:00:00.000Z"),
  });
  const parent = makeApprovedAdultParent();
  mockPatientFindOneSequence([
    { kind: "lean", value: current },
    {
      kind: "selectLean",
      value: parent,
      projection: UPDATE_PARENT_PROJECTION,
    },
  ]);

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
          user: { _id: "doctor-id" },
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

test("updatePatientService keeps minor deceased-to-alive corrections under guardian approval", async () => {
  restorePatientMethods();

  const current = makeMinorPatient({
    isDeceased: true,
    dateOfDeath: new Date("2026-01-15T12:00:00.000Z"),
    causeOfDeath: "Accident",
    ageCategory: "0-12",
    updatedAt: new Date("2026-01-15T12:00:00.000Z"),
    approvedAt: new Date("2026-01-15T12:00:00.000Z"),
  });
  const parent = makeApprovedAdultParent();

  const findOneCalls = mockPatientFindOneSequence([
    { kind: "lean", value: current },
    {
      kind: "selectLean",
      value: parent,
      projection: UPDATE_PARENT_PROJECTION,
    },
    { kind: "sortSelectLean", value: null, projection: "updatedAt approvedAt" },
  ]);
  const updateCalls = [];

  Patient.findOneAndUpdate = (query, updateDoc, options) => {
    updateCalls.push({ query, updateDoc, options });
    return {
      lean: async () => applyUpdateForTest(current, updateDoc),
    };
  };
  PatientHistory.create = async () => {
    throw new Error("PatientHistory.create should not be called for minor pending edits");
  };
  User.findOneAndUpdate = async () => {
    throw new Error("User.findOneAndUpdate should not be called for minor pending edits");
  };

  try {
    const result = await updatePatientService({
      user: { _id: "doctor-id" },
      patientId: current._id,
      body: { isDeceased: false },
    });

    assert.equal(result.isDeceased, false);
    assert.equal(Object.hasOwn(result, "dateOfDeath"), false);
    assert.equal(Object.hasOwn(result, "causeOfDeath"), false);
    assert.equal(findOneCalls.length, 3);
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].updateDoc.$set.isDeceased, false);
    assert.equal(updateCalls[0].updateDoc.$unset.dateOfDeath, 1);
    assert.equal(updateCalls[0].updateDoc.$unset.causeOfDeath, 1);
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

test("updatePatientService keeps minor deceased death-field corrections under guardian approval", async () => {
  restorePatientMethods();

  const current = makeMinorPatient({
    isDeceased: true,
    dateOfDeath: new Date("2026-01-15T12:00:00.000Z"),
    causeOfDeath: "Accident",
    updatedAt: new Date("2026-01-15T12:00:00.000Z"),
    approvedAt: new Date("2026-01-15T12:00:00.000Z"),
  });
  const parent = makeApprovedAdultParent();

  const findOneCalls = mockPatientFindOneSequence([
    { kind: "lean", value: current },
    {
      kind: "selectLean",
      value: parent,
      projection: UPDATE_PARENT_PROJECTION,
    },
    { kind: "sortSelectLean", value: null, projection: "updatedAt approvedAt" },
  ]);
  const updateCalls = [];

  Patient.findOneAndUpdate = (query, updateDoc, options) => {
    updateCalls.push({ query, updateDoc, options });
    return {
      lean: async () => applyUpdateForTest(current, updateDoc),
    };
  };
  PatientHistory.create = async () => {
    throw new Error("PatientHistory.create should not be called for minor pending edits");
  };
  User.findOneAndUpdate = async () => {
    throw new Error("User.findOneAndUpdate should not be called for minor pending edits");
  };

  try {
    const result = await updatePatientService({
      user: { _id: "doctor-id" },
      patientId: current._id,
      body: {
        dateOfDeath: "2026-01-20",
        causeOfDeath: "Corrected accident",
      },
    });

    assert.equal(result.isDeceased, true);
    assert.equal(result.causeOfDeath, "Corrected accident");
    assert.equal(result.dateOfDeath.toISOString().slice(0, 10), "2026-01-20");
    assert.equal(findOneCalls.length, 3);
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].updateDoc.$set.causeOfDeath, "Corrected accident");
    assert.equal(updateCalls[0].updateDoc.$set.dateOfDeath.toISOString().slice(0, 10), "2026-01-20");
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

test("updatePatientService does not treat unchanged full-form deceased minor payloads as normal edits", async () => {
  restorePatientMethods();

  const current = makeMinorPatient({
    isDeceased: true,
    dateOfDeath: new Date("2026-01-15T12:00:00.000Z"),
    causeOfDeath: "Accident",
    ageCategory: "0-12",
    updatedAt: new Date("2026-01-15T12:00:00.000Z"),
    approvedAt: new Date("2026-01-15T12:00:00.000Z"),
  });
  const parent = makeApprovedAdultParent();

  const findOneCalls = mockPatientFindOneSequence([
    { kind: "lean", value: current },
    {
      kind: "selectLean",
      value: parent,
      projection: UPDATE_PARENT_PROJECTION,
    },
    { kind: "sortSelectLean", value: null, projection: "updatedAt approvedAt" },
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
          user: { _id: "doctor-id" },
          patientId: current._id,
          body: {
            fullname: current.fullname,
            parentEmail: current.parentEmail,
            birthDate: minorBirthDate(),
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
            measurementSystem: current.measurementSystem,
            height: current.heightM,
            weight: current.weightKg,
            isDeceased: true,
            dateOfDeath: "2026-01-15",
            causeOfDeath: "Accident",
          },
        }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.errorCode, "NO_CHANGES");
        return true;
      }
    );

    assert.equal(findOneCalls.length, 2);
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService immediately approves minor alive-to-deceased when guardian is deceased and archives future active appointments", async () => {
  restorePatientMethods();

  const current = makeMinorPatient({
    isDeceased: false,
    dateOfDeath: null,
    ageCategory: "0-12",
    updatedAt: new Date("2026-01-02T12:00:00.000Z"),
    approvedAt: new Date("2026-01-02T12:00:00.000Z"),
  });
  const parent = makeApprovedAdultParent({ isDeceased: true });

  const findOneCalls = mockPatientFindOneSequence([
    { kind: "lean", value: current },
    {
      kind: "selectLean",
      value: parent,
      projection: UPDATE_PARENT_PROJECTION,
    },
  ]);
  const updateCalls = [];
  const historyCalls = [];
  const appointmentArchiveCalls = mockAppointmentDeathArchive();

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
  User.findOneAndUpdate = async () => {
    throw new Error("User.findOneAndUpdate should not be called for minor immediate edits");
  };

  try {
    const result = await updatePatientService({
      user: { _id: "doctor-id" },
      patientId: current._id,
      body: {
        isDeceased: true,
        dateOfDeath: "2026-01-15",
        causeOfDeath: "Accident",
      },
    });

    assert.equal(result.isDeceased, true);
    assert.equal(result.causeOfDeath, "Accident");
    assert.equal(result.dateOfDeath.toISOString().slice(0, 10), "2026-01-15");
    assert.equal(findOneCalls.length, 2);
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].updateDoc.$set.isDeceased, true);
    assert.equal(updateCalls[0].updateDoc.$set.causeOfDeath, "Accident");
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
    assert.deepEqual(updateCalls[0].options, {
      new: true,
      runValidators: true,
      context: "query",
      timestamps: false,
    });
    assert.equal(historyCalls.length, 1);
    assert.equal(historyCalls[0].patientKey, current.minorKey);
    assert.equal(historyCalls[0].approvedFromProfile, current._id);
    assert.equal(historyCalls[0].editedBy, "doctor-id");
    assert.equal(historyCalls[0].approvedAt, updateCalls[0].updateDoc.$set.approvedAt);
    assert.deepEqual(
      historyCalls[0].approvedSnapshot,
      updateCalls[0].updateDoc.$set.approvedSnapshot
    );
    assert.deepEqual(appointmentArchiveCalls, [
      {
        query: {
          patient: current._id,
          status: { $in: ["pending", "accepted"] },
          start: { $gte: updateCalls[0].updateDoc.$set.approvedAt },
        },
        updateDoc: { $set: { status: "cancelled_due_to_death" } },
      },
    ]);
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService immediately approves minor deceased-to-alive when guardian is deceased", async () => {
  restorePatientMethods();

  const current = makeMinorPatient({
    isDeceased: true,
    dateOfDeath: new Date("2026-01-15T12:00:00.000Z"),
    causeOfDeath: "Accident",
    ageCategory: "0-12",
    updatedAt: new Date("2026-01-15T12:00:00.000Z"),
    approvedAt: new Date("2026-01-15T12:00:00.000Z"),
  });
  const parent = makeApprovedAdultParent({ isDeceased: true });

  mockPatientFindOneSequence([
    { kind: "lean", value: current },
    {
      kind: "selectLean",
      value: parent,
      projection: UPDATE_PARENT_PROJECTION,
    },
  ]);
  const updateCalls = [];
  const historyCalls = [];

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
  User.findOneAndUpdate = async () => {
    throw new Error("User.findOneAndUpdate should not be called for minor immediate edits");
  };
  guardAppointmentDeathArchive();

  try {
    const result = await updatePatientService({
      user: { _id: "doctor-id" },
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
      updateCalls[0].updateDoc.$set.approvedSnapshot.unset.dateOfDeath,
      1
    );
    assert.equal(
      updateCalls[0].updateDoc.$set.approvedSnapshot.unset.causeOfDeath,
      1
    );
    assert.deepEqual(updateCalls[0].options, {
      new: true,
      runValidators: true,
      context: "query",
      timestamps: false,
    });
    assert.equal(historyCalls.length, 1);
    assert.equal(historyCalls[0].patientKey, current.minorKey);
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService immediately approves minor death-field corrections when guardian is deceased", async () => {
  restorePatientMethods();

  const current = makeMinorPatient({
    isDeceased: true,
    dateOfDeath: new Date("2026-01-15T12:00:00.000Z"),
    causeOfDeath: "Accident",
    ageCategory: "0-12",
    updatedAt: new Date("2026-01-15T12:00:00.000Z"),
    approvedAt: new Date("2026-01-15T12:00:00.000Z"),
  });
  const parent = makeApprovedAdultParent({ isDeceased: true });

  mockPatientFindOneSequence([
    { kind: "lean", value: current },
    {
      kind: "selectLean",
      value: parent,
      projection: UPDATE_PARENT_PROJECTION,
    },
  ]);
  const updateCalls = [];
  const historyCalls = [];

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
  User.findOneAndUpdate = async () => {
    throw new Error("User.findOneAndUpdate should not be called for minor immediate edits");
  };
  guardAppointmentDeathArchive();

  try {
    const result = await updatePatientService({
      user: { _id: "doctor-id" },
      patientId: current._id,
      body: {
        dateOfDeath: "2026-01-20",
        causeOfDeath: "Corrected accident",
      },
    });

    assert.equal(result.isDeceased, true);
    assert.equal(result.causeOfDeath, "Corrected accident");
    assert.equal(result.dateOfDeath.toISOString().slice(0, 10), "2026-01-20");
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].updateDoc.$set.causeOfDeath, "Corrected accident");
    assert.equal(updateCalls[0].updateDoc.$set.dateOfDeath.toISOString().slice(0, 10), "2026-01-20");
    assert(updateCalls[0].updateDoc.$set.approvedAt instanceof Date);
    assert.deepEqual(updateCalls[0].options, {
      new: true,
      runValidators: true,
      context: "query",
      timestamps: false,
    });
    assert.equal(historyCalls.length, 1);
    assert.equal(historyCalls[0].patientKey, current.minorKey);
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService blocks minor normal edits when guardian is deceased", async () => {
  restorePatientMethods();

  const current = makeMinorPatient({
    isDeceased: false,
    ageCategory: "0-12",
    updatedAt: new Date("2026-01-02T12:00:00.000Z"),
    approvedAt: new Date("2026-01-02T12:00:00.000Z"),
  });
  const parent = makeApprovedAdultParent({ isDeceased: true });

  mockPatientFindOneSequence([
    { kind: "lean", value: current },
    {
      kind: "selectLean",
      value: parent,
      projection: UPDATE_PARENT_PROJECTION,
    },
  ]);

  Patient.findOneAndUpdate = async () => {
    throw new Error("Patient.findOneAndUpdate should not be called for guardian unavailable rejection");
  };
  PatientHistory.create = async () => {
    throw new Error("PatientHistory.create should not be called for guardian unavailable rejection");
  };
  User.findOneAndUpdate = async () => {
    throw new Error("User.findOneAndUpdate should not be called for guardian unavailable rejection");
  };

  try {
    await assert.rejects(
      () =>
        updatePatientService({
          user: { _id: "doctor-id" },
          patientId: current._id,
          body: { city: "Los Angeles" },
        }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.errorCode, "GUARDIAN_UNAVAILABLE");
        assert.equal(
          err.message,
          "The guardian is unavailable. Assign a new guardian before editing this minor."
        );
        return true;
      }
    );
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService does not treat unchanged full-form payload as guardian unavailable", async () => {
  restorePatientMethods();

  const current = makeMinorPatient({
    isDeceased: false,
    dateOfDeath: null,
    causeOfDeath: undefined,
    ageCategory: "0-12",
    updatedAt: new Date("2026-01-02T12:00:00.000Z"),
    approvedAt: new Date("2026-01-02T12:00:00.000Z"),
  });
  const parent = makeApprovedAdultParent({ isDeceased: true });

  const findOneCalls = mockPatientFindOneSequence([
    { kind: "lean", value: current },
    {
      kind: "selectLean",
      value: parent,
      projection: UPDATE_PARENT_PROJECTION,
    },
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
          user: { _id: "doctor-id" },
          patientId: current._id,
          body: {
            fullname: current.fullname,
            parentEmail: current.parentEmail,
            birthDate: minorBirthDate(),
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
            measurementSystem: current.measurementSystem,
            height: current.heightM,
            weight: current.weightKg,
            isDeceased: false,
            dateOfDeath: null,
            causeOfDeath: "",
          },
        }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.errorCode, "NO_CHANGES");
        return true;
      }
    );

    assert.equal(findOneCalls.length, 2);
  } finally {
    restorePatientMethods();
  }
});

test("updatePatientService blocks duplicate proposed child names under the same parent", async () => {
  restorePatientMethods();

  const current = makeMinorPatient();
  const parent = makeApprovedAdultParent({
    approvedSnapshot: {
      set: {
        children: [{ name: "Minor Patient" }, { name: "Sibling Child" }],
      },
    },
    children: [{ name: "Minor Patient" }, { name: "Sibling Child" }],
  });

  const findOneCalls = mockPatientFindOneSequence([
    { kind: "lean", value: current },
    {
      kind: "selectLean",
      value: parent,
      projection: UPDATE_PARENT_PROJECTION,
    },
  ]);

  Patient.findOneAndUpdate = async () => {
    throw new Error("Patient.findOneAndUpdate should not be called for duplicate child names");
  };

  try {
    await assert.rejects(
      () =>
        updatePatientService({
          user: { _id: "doctor-id" },
          patientId: current._id,
          body: { fullname: "Sibling Child" },
        }),
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.errorCode, "CHILD_NAME_ALREADY_EXISTS");
        assert.equal(err.message, "A child with this name already exists for this parent.");
        return true;
      }
    );

    assert.equal(findOneCalls.length, 2);
  } finally {
    restorePatientMethods();
  }
});
