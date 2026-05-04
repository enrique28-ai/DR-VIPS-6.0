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
const { createPatientService } = await import("../patientWriteService.js");

const originalPatientMethods = {
  create: Patient.create,
  find: Patient.find,
  findOne: Patient.findOne,
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

function restorePatientMethods() {
  Patient.create = originalPatientMethods.create;
  Patient.find = originalPatientMethods.find;
  Patient.findOne = originalPatientMethods.findOne;
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
