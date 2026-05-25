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
const { createPatientService, updatePatientService } = await import(
  "../../../services/patients/patientWriteService.js"
);

const originalPatientMethods = {
  create: Patient.create,
  find: Patient.find,
  findOne: Patient.findOne,
  findOneAndUpdate: Patient.findOneAndUpdate,
};

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
      projection: "_id age children approvedAt approvedSnapshot",
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
    assert.deepEqual(updateCalls[0].options, {
      new: true,
      runValidators: true,
      context: "query",
    });
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
      projection: "_id age children approvedAt approvedSnapshot",
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
