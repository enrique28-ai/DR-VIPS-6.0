import assert from "node:assert/strict";
import { after, test } from "node:test";

import Patient from "../../../models/Patient.js";
import PatientHistory from "../../../models/PatientHistory.js";
import User from "../../../models/User.js";
import Appointment from "../../../models/Appointment.js";
import {
  approveChildProfileService,
  approvePatientProfileService,
  rejectChildProfileService,
  rejectPatientProfileService,
} from "../../../services/patients/patientApprovalService.js";

const originalPatientMethods = {
  find: Patient.find,
  findOne: Patient.findOne,
  updateMany: Patient.updateMany,
  updateOne: Patient.updateOne,
};

const originalPatientHistoryMethods = {
  create: PatientHistory.create,
};

const originalUserMethods = {
  findByIdAndUpdate: User.findByIdAndUpdate,
};

const originalAppointmentMethods = {
  updateMany: Appointment.updateMany,
};

after(() => {
  restoreModelMethods();
});

function restoreModelMethods() {
  Patient.find = originalPatientMethods.find;
  Patient.findOne = originalPatientMethods.findOne;
  Patient.updateMany = originalPatientMethods.updateMany;
  Patient.updateOne = originalPatientMethods.updateOne;
  PatientHistory.create = originalPatientHistoryMethods.create;
  User.findByIdAndUpdate = originalUserMethods.findByIdAndUpdate;
  Appointment.updateMany = originalAppointmentMethods.updateMany;
}

function makePatient(overrides = {}) {
  return {
    _id: "profile-id",
    fullname: "Patient Profile",
    email: "patient@example.com",
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
    createdBy: "doctor-id",
    lastEditedBy: "doctor-id",
    updatedAt: new Date("2026-01-02T12:00:00.000Z"),
    ...overrides,
  };
}

function makeChildPatient(overrides = {}) {
  return {
    _id: "child-profile-id",
    fullname: "Corrected Minor",
    parentEmail: "parent@example.com",
    minorKey: "parent@example.com::minor patient",
    birthDate: new Date("2016-01-01T12:00:00.000Z"),
    age: 10,
    ageCategory: "0-12",
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
    diseases: [],
    allergies: [],
    medications: [],
    children: [],
    approvedAt: new Date("2026-01-01T12:00:00.000Z"),
    approvedSnapshot: {
      set: {
        fullname: "Minor Patient",
        age: 10,
        ageCategory: "0-12",
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
        diseases: [],
        allergies: [],
        medications: [],
        children: [],
        birthDate: new Date("2016-01-01T12:00:00.000Z"),
      },
      unset: {},
    },
    createdBy: "doctor-id",
    lastEditedBy: "doctor-id",
    updatedAt: new Date("2026-01-02T12:00:00.000Z"),
    ...overrides,
  };
}

function makePatientUser(overrides = {}) {
  return {
    _id: "patient-user-id",
    role: "patient",
    email: "Patient@Example.com",
    ...overrides,
  };
}

function mockFlexiblePatientFindSequence(responses) {
  const calls = [];

  Patient.find = (query) => {
    const response = responses[calls.length];
    const call = { query, select: undefined, sort: undefined, populate: undefined };
    calls.push(call);

    if (response.kind === "selectLean") {
      return {
        select: (projection) => {
          call.select = projection;
          return {
            lean: async () => response.value,
          };
        },
      };
    }

    if (response.kind === "sortLean" || response.kind === "sortPopulateLean") {
      return {
        sort: (sort) => {
          call.sort = sort;
          return {
            lean: async () => response.value,
            populate(path, select) {
              call.populate = { path, select };
              return {
                lean: async () => response.value,
              };
            },
          };
        },
      };
    }

    throw new Error(`Unsupported Patient.find mock response: ${response.kind}`);
  };

  return calls;
}

function mockPatientFindOne(value) {
  const calls = [];

  Patient.findOne = (query) => {
    calls.push(query);
    return {
      lean: async () => value,
    };
  };

  return calls;
}

function mockPatientFindSequence(values) {
  const calls = [];

  Patient.find = (query) => {
    const value = values[calls.length];
    const call = { query, sort: undefined, populate: undefined };
    calls.push(call);

    return {
      sort(sort) {
        call.sort = sort;
        return {
          lean: async () => value,
          populate(path, select) {
            call.populate = { path, select };
            return {
              lean: async () => value,
            };
          },
        };
      },
    };
  };

  return calls;
}

function mockPatientUpdateMany() {
  const calls = [];

  Patient.updateMany = async (query, updateDoc, options) => {
    calls.push({ query, updateDoc, options });
    return { acknowledged: true, modifiedCount: 1 };
  };

  return calls;
}

function mockPatientUpdateOne() {
  const calls = [];

  Patient.updateOne = async (query, updateDoc, options) => {
    calls.push({ query, updateDoc, options });
    return { acknowledged: true, modifiedCount: 1 };
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

function mockUserDecisionUpdate() {
  const calls = [];

  User.findByIdAndUpdate = async (id, updateDoc, options) => {
    calls.push({ id, updateDoc, options });
    return null;
  };

  return calls;
}

test("approvePatientProfileService rejects when patient doc is not found", async () => {
  restoreModelMethods();

  const findOneCalls = mockPatientFindOne(null);

  try {
    await assert.rejects(
      () =>
        approvePatientProfileService({
          user: makePatientUser(),
          profileId: "missing-profile-id",
        }),
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.message, "Patient profile not found for this user");
        return true;
      }
    );

    assert.deepEqual(findOneCalls, [
      { _id: "missing-profile-id", email: "patient@example.com" },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("approvePatientProfileService rejects when authenticated user email does not match patient email", async () => {
  restoreModelMethods();

  const findOneCalls = mockPatientFindOne(null);

  try {
    await assert.rejects(
      () =>
        approvePatientProfileService({
          user: makePatientUser({ email: "wrong@example.com" }),
          profileId: "profile-id",
        }),
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.message, "Patient profile not found for this user");
        return true;
      }
    );

    assert.deepEqual(findOneCalls, [
      { _id: "profile-id", email: "wrong@example.com" },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("rejectPatientProfileService rejects when patient doc is not found", async () => {
  restoreModelMethods();

  const findCalls = mockPatientFindSequence([[]]);

  try {
    await assert.rejects(
      () =>
        rejectPatientProfileService({
          user: makePatientUser(),
          profileId: "missing-profile-id",
        }),
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.message, "No patient profiles found for this user");
        return true;
      }
    );

    assert.deepEqual(findCalls, [
      {
        query: { email: "patient@example.com" },
        sort: { updatedAt: -1 },
        populate: undefined,
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("rejectPatientProfileService rejects when authenticated user email does not match patient email", async () => {
  restoreModelMethods();

  const findCalls = mockPatientFindSequence([
    [makePatient({ _id: "other-profile-id", email: "wrong@example.com" })],
  ]);

  try {
    await assert.rejects(
      () =>
        rejectPatientProfileService({
          user: makePatientUser({ email: "wrong@example.com" }),
          profileId: "profile-id",
        }),
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.message, "Patient profile not found for this user");
        return true;
      }
    );

    assert.deepEqual(findCalls, [
      {
        query: { email: "wrong@example.com" },
        sort: { updatedAt: -1 },
        populate: undefined,
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("rejectPatientProfileService restores approvedSnapshot when available", async () => {
  restoreModelMethods();

  const approvedAt = new Date("2026-01-01T12:00:00.000Z");
  const target = makePatient({
    approvedAt,
    approvedSnapshot: {
      set: {
        fullname: "Approved Patient",
        email: "patient@example.com",
        phoneDigits: "16195550101",
        diseases: ["asthma"],
        allergies: [],
        medications: [],
        children: [],
      },
      unset: { causeOfDeath: 1 },
    },
  });

  const findCalls = mockPatientFindSequence([
    [target],
    [makePatient({ fullname: "Approved Patient", diseases: ["asthma"] })],
  ]);
  const updateManyCalls = mockPatientUpdateMany();
  const userUpdateCalls = mockUserDecisionUpdate();

  try {
    const result = await rejectPatientProfileService({
      user: makePatientUser(),
      profileId: "profile-id",
    });

    assert.equal(result.ok, true);
    assert.equal(result.pendingDecision, false);
    assert.equal(result.hasRecords, true);
    assert.equal(updateManyCalls.length, 1);
    assert.deepEqual(updateManyCalls[0].query, { email: "patient@example.com" });
    assert.equal(updateManyCalls[0].updateDoc.$set.fullname, "Approved Patient");
    assert.deepEqual(updateManyCalls[0].updateDoc.$set.diseases, ["asthma"]);
    assert.equal(updateManyCalls[0].updateDoc.$set.updatedAt, approvedAt);
    assert.deepEqual(updateManyCalls[0].updateDoc.$unset, { causeOfDeath: 1 });
    assert.deepEqual(updateManyCalls[0].options, { timestamps: false });
    assert.equal(userUpdateCalls.length, 1);
    assert.deepEqual(findCalls[1].populate, { path: "createdBy", select: "name email" });
  } finally {
    restoreModelMethods();
  }
});

test("rejectPatientProfileService restores phone country from previous profile", async () => {
  restoreModelMethods();

  const target = makePatient({
    _id: "profile-id",
    phone: "+16195550101",
    phoneDigits: "16195550101",
    phoneCountry: "United States",
    phoneCountryIso: "US",
    country: "United States",
    state: "California",
    city: "San Diego",
    birthCountry: "United States",
    birthState: "California",
    birthCity: "Los Angeles",
    updatedAt: new Date("2026-01-03T12:00:00.000Z"),
  });
  const previous = makePatient({
    _id: "previous-profile-id",
    fullname: "Previous Patient",
    phone: "+442079460056",
    phoneDigits: "442079460056",
    phoneCountry: "United Kingdom",
    phoneCountryIso: "GB",
    country: "Mexico",
    state: "Ciudad de Mexico",
    city: "Mexico City",
    birthCountry: "Mexico",
    birthState: "Baja California",
    birthCity: "Mexicali",
    updatedAt: new Date("2026-01-01T12:00:00.000Z"),
  });

  mockPatientFindSequence([[target, previous], [previous]]);
  const updateManyCalls = mockPatientUpdateMany();
  const userUpdateCalls = mockUserDecisionUpdate();

  try {
    const result = await rejectPatientProfileService({
      user: makePatientUser(),
      profileId: "profile-id",
    });

    assert.equal(result.ok, true);
    assert.equal(updateManyCalls.length, 1);
    assert.equal(updateManyCalls[0].updateDoc.$set.country, "Mexico");
    assert.equal(updateManyCalls[0].updateDoc.$set.state, "Ciudad de Mexico");
    assert.equal(updateManyCalls[0].updateDoc.$set.city, "Mexico City");
    assert.equal(updateManyCalls[0].updateDoc.$set.birthCountry, "Mexico");
    assert.equal(updateManyCalls[0].updateDoc.$set.birthState, "Baja California");
    assert.equal(updateManyCalls[0].updateDoc.$set.birthCity, "Mexicali");
    assert.equal(updateManyCalls[0].updateDoc.$set.phone, "+442079460056");
    assert.equal(updateManyCalls[0].updateDoc.$set.phoneDigits, "442079460056");
    assert.equal(updateManyCalls[0].updateDoc.$set.phoneCountry, "United Kingdom");
    assert.equal(updateManyCalls[0].updateDoc.$set.phoneCountryIso, "GB");
    assert.equal(userUpdateCalls.length, 1);
  } finally {
    restoreModelMethods();
  }
});

test("approvePatientProfileService marks the target profile as approved", async () => {
  restoreModelMethods();

  const target = makePatient();
  const findOneCalls = mockPatientFindOne(target);
  const findCalls = mockPatientFindSequence([[target]]);
  const updateManyCalls = mockPatientUpdateMany();
  const historyCalls = mockPatientHistoryCreate();
  const userUpdateCalls = mockUserDecisionUpdate();

  try {
    const result = await approvePatientProfileService({
      user: makePatientUser(),
      profileId: "profile-id",
    });

    assert.equal(result.ok, true);
    assert.equal(result.pendingDecision, false);
    assert.deepEqual(findOneCalls, [
      { _id: "profile-id", email: "patient@example.com" },
    ]);
    assert.equal(updateManyCalls.length, 1);
    assert.deepEqual(updateManyCalls[0].query, { email: "patient@example.com" });
    assert(updateManyCalls[0].updateDoc.$set.approvedAt instanceof Date);
    assert.equal(
      updateManyCalls[0].updateDoc.$set.updatedAt,
      updateManyCalls[0].updateDoc.$set.approvedAt
    );
    assert.equal(
      updateManyCalls[0].updateDoc.$set.approvedSnapshot.set.fullname,
      "Patient Profile"
    );
    assert.equal(updateManyCalls[0].updateDoc.$set.approvedSnapshot.unset.birthCountry, 1);
    assert.equal(updateManyCalls[0].updateDoc.$set.approvedSnapshot.unset.birthState, 1);
    assert.equal(updateManyCalls[0].updateDoc.$set.approvedSnapshot.unset.birthCity, 1);
    assert.deepEqual(updateManyCalls[0].options, { timestamps: false });
    assert.equal(historyCalls.length, 1);
    assert.equal(historyCalls[0].approvedFromProfile, "profile-id");
    assert.equal(historyCalls[0].approvedAt, updateManyCalls[0].updateDoc.$set.approvedAt);
    assert.equal(userUpdateCalls.length, 1);
    assert.deepEqual(findCalls[0].populate, { path: "createdBy", select: "name email" });
  } finally {
    restoreModelMethods();
  }
});

test("approveChildProfileService updates minor fullname and minorKey on parent approval", async () => {
  restoreModelMethods();

  const target = makeChildPatient();
  const findOneCalls = mockPatientFindOne(target);
  const findCalls = mockFlexiblePatientFindSequence([
    { kind: "selectLean", value: [] },
    {
      kind: "sortPopulateLean",
      value: [
        makeChildPatient({
          fullname: "Corrected Minor",
          minorKey: "parent@example.com::corrected minor",
        }),
      ],
    },
  ]);
  const updateManyCalls = mockPatientUpdateMany();
  const updateOneCalls = mockPatientUpdateOne();
  const historyCalls = mockPatientHistoryCreate();
  guardAppointmentDeathArchive();

  try {
    const result = await approveChildProfileService({
      user: makePatientUser({ email: "Parent@Example.com" }),
      profileId: "child-profile-id",
    });

    assert.equal(result.ok, true);
    assert.equal(result.pendingDecision, false);
    assert.equal(findOneCalls[0]._id, "child-profile-id");
    assert.equal(findOneCalls[0].parentEmail, "parent@example.com");
    assert.equal(updateManyCalls.length, 1);
    assert.deepEqual(updateManyCalls[0].query, {
      parentEmail: "parent@example.com",
      age: { $lt: 18 },
      minorKey: "parent@example.com::minor patient",
    });
    assert.equal(updateManyCalls[0].updateDoc.$set.fullname, "Corrected Minor");
    assert.equal(updateManyCalls[0].updateDoc.$set.minorKey, "parent@example.com::corrected minor");
    assert.equal(
      updateManyCalls[0].updateDoc.$set.approvedSnapshot.set.fullname,
      "Corrected Minor"
    );
    assert.deepEqual(updateManyCalls[0].options, { timestamps: false });
    assert.equal(updateOneCalls.length, 0);
    assert.equal(historyCalls.length, 1);
    assert.equal(historyCalls[0].patientKey, "parent@example.com::corrected minor");
    assert.equal(findCalls[0].select, "_id children childrenCount approvedSnapshot");
    assert.deepEqual(findCalls[1].populate, { path: "createdBy", select: "name email role" });
  } finally {
    restoreModelMethods();
  }
});

test("approveChildProfileService archives future active appointments when guardian approves minor death", async () => {
  restoreModelMethods();

  const target = makeChildPatient({
    fullname: "Minor Patient",
    isDeceased: true,
    dateOfDeath: new Date("2026-01-15T12:00:00.000Z"),
    causeOfDeath: "Accident",
    approvedSnapshot: {
      set: {
        fullname: "Minor Patient",
        age: 10,
        ageCategory: "0-12",
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
        diseases: [],
        allergies: [],
        medications: [],
        children: [],
        birthDate: new Date("2016-01-01T12:00:00.000Z"),
        isDeceased: false,
      },
      unset: { dateOfDeath: 1, causeOfDeath: 1 },
    },
  });

  mockPatientFindOne(target);
  mockFlexiblePatientFindSequence([
    {
      kind: "sortPopulateLean",
      value: [target],
    },
  ]);
  const updateManyCalls = mockPatientUpdateMany();
  const updateOneCalls = mockPatientUpdateOne();
  const historyCalls = mockPatientHistoryCreate();
  const appointmentArchiveCalls = mockAppointmentDeathArchive();

  try {
    const result = await approveChildProfileService({
      user: makePatientUser({ email: "Parent@Example.com" }),
      profileId: "child-profile-id",
    });

    assert.equal(result.ok, true);
    assert.equal(result.pendingDecision, false);
    assert.equal(updateManyCalls.length, 1);
    assert.equal(updateManyCalls[0].updateDoc.$set.isDeceased, true);
    assert.equal(updateManyCalls[0].updateDoc.$set.causeOfDeath, "Accident");
    assert.equal(updateManyCalls[0].updateDoc.$set.dateOfDeath.toISOString().slice(0, 10), "2026-01-15");
    assert.equal(updateOneCalls.length, 0);
    assert.equal(historyCalls.length, 1);
    assert.equal(historyCalls[0].patientKey, "parent@example.com::minor patient");
    assert.deepEqual(appointmentArchiveCalls, [
      {
        query: {
          patient: target._id,
          status: { $in: ["pending", "accepted"] },
          start: { $gte: updateManyCalls[0].updateDoc.$set.approvedAt },
        },
        updateDoc: { $set: { status: "cancelled_due_to_death" } },
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("approveChildProfileService updates parent children and approved snapshot children on rename", async () => {
  restoreModelMethods();

  const target = makeChildPatient();
  const parentDoc = {
    _id: "parent-profile-id",
    children: [{ name: "Minor Patient" }, { name: "Sibling Child" }],
    childrenCount: 2,
    approvedSnapshot: {
      set: {
        fullname: "Parent Profile",
        children: [{ name: "Minor Patient" }, { name: "Sibling Child" }],
        childrenCount: 2,
      },
    },
  };

  mockPatientFindOne(target);
  mockFlexiblePatientFindSequence([
    { kind: "selectLean", value: [parentDoc] },
    {
      kind: "sortPopulateLean",
      value: [
        makeChildPatient({
          fullname: "Corrected Minor",
          minorKey: "parent@example.com::corrected minor",
        }),
      ],
    },
  ]);
  mockPatientUpdateMany();
  const updateOneCalls = mockPatientUpdateOne();
  mockPatientHistoryCreate();

  try {
    const result = await approveChildProfileService({
      user: makePatientUser({ email: "Parent@Example.com" }),
      profileId: "child-profile-id",
    });

    assert.equal(result.ok, true);
    assert.equal(updateOneCalls.length, 1);
    assert.deepEqual(updateOneCalls[0].query, { _id: "parent-profile-id" });
    assert.equal(updateOneCalls[0].updateDoc.$set.children[0].name, "Corrected Minor");
    assert.equal(updateOneCalls[0].updateDoc.$set.children[1].name, "Sibling Child");
    assert.equal(updateOneCalls[0].updateDoc.$set.childrenCount, 2);
    assert.equal(
      updateOneCalls[0].updateDoc.$set["approvedSnapshot.set.children"][0].name,
      "Corrected Minor"
    );
    assert.equal(updateOneCalls[0].updateDoc.$set["approvedSnapshot.set.childrenCount"], 2);
    assert.deepEqual(updateOneCalls[0].options, { timestamps: false });
  } finally {
    restoreModelMethods();
  }
});

test("rejectChildProfileService restores previous approved fullname and old minorKey for rename", async () => {
  restoreModelMethods();

  const target = makeChildPatient({
    fullname: "Corrected Minor",
    minorKey: "parent@example.com::minor patient",
  });

  mockPatientFindOne(target);
  mockFlexiblePatientFindSequence([
    { kind: "sortLean", value: [target] },
    {
      kind: "sortPopulateLean",
      value: [
        makeChildPatient({
          fullname: "Minor Patient",
          minorKey: "parent@example.com::minor patient",
        }),
      ],
    },
  ]);
  const updateManyCalls = mockPatientUpdateMany();

  Patient.updateOne = async () => {
    throw new Error("Parent children should not be updated when rejecting a child rename");
  };

  try {
    const result = await rejectChildProfileService({
      user: makePatientUser({ email: "Parent@Example.com" }),
      profileId: "child-profile-id",
    });

    assert.equal(result.ok, true);
    assert.equal(result.pendingDecision, false);
    assert.equal(updateManyCalls.length, 1);
    assert.deepEqual(updateManyCalls[0].query, {
      parentEmail: "parent@example.com",
      minorKey: "parent@example.com::minor patient",
      age: { $lt: 18 },
    });
    assert.equal(updateManyCalls[0].updateDoc.$set.fullname, "Minor Patient");
    assert.equal(updateManyCalls[0].updateDoc.$set.minorKey, "parent@example.com::minor patient");
    assert.deepEqual(updateManyCalls[0].options, { timestamps: false });
  } finally {
    restoreModelMethods();
  }
});

test("rejectChildProfileService restores optional minor phone country from previous profile", async () => {
  restoreModelMethods();

  const target = makeChildPatient({
    _id: "child-profile-id",
    fullname: "Pending Minor",
    phone: "+16195550101",
    phoneDigits: "16195550101",
    phoneCountry: "United States",
    phoneCountryIso: "US",
    country: "United States",
    state: "California",
    city: "San Diego",
    updatedAt: new Date("2026-01-03T12:00:00.000Z"),
  });
  const previous = makeChildPatient({
    _id: "previous-child-profile-id",
    fullname: "Minor Patient",
    phone: "+442079460056",
    phoneDigits: "442079460056",
    phoneCountry: "United Kingdom",
    phoneCountryIso: "GB",
    country: "Mexico",
    state: "Ciudad de Mexico",
    city: "Mexico City",
    updatedAt: new Date("2026-01-01T12:00:00.000Z"),
  });

  mockPatientFindOne(target);
  mockFlexiblePatientFindSequence([
    { kind: "sortLean", value: [target, previous] },
    { kind: "sortPopulateLean", value: [previous] },
  ]);
  const updateManyCalls = mockPatientUpdateMany();

  Patient.updateOne = async () => {
    throw new Error("Parent children should not be updated when rejecting a child phone change");
  };

  try {
    const result = await rejectChildProfileService({
      user: makePatientUser({ email: "Parent@Example.com" }),
      profileId: "child-profile-id",
    });

    assert.equal(result.ok, true);
    assert.equal(updateManyCalls.length, 1);
    assert.equal(updateManyCalls[0].updateDoc.$set.country, "Mexico");
    assert.equal(updateManyCalls[0].updateDoc.$set.state, "Ciudad de Mexico");
    assert.equal(updateManyCalls[0].updateDoc.$set.city, "Mexico City");
    assert.equal(updateManyCalls[0].updateDoc.$set.phone, "+442079460056");
    assert.equal(updateManyCalls[0].updateDoc.$set.phoneDigits, "442079460056");
    assert.equal(updateManyCalls[0].updateDoc.$set.phoneCountry, "United Kingdom");
    assert.equal(updateManyCalls[0].updateDoc.$set.phoneCountryIso, "GB");
  } finally {
    restoreModelMethods();
  }
});
