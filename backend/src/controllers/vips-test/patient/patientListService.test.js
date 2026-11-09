import assert from "node:assert/strict";
import { after, test } from "node:test";

import Patient from "../../../models/Patient.js";
import { getMyPatientsService } from "../../../services/patients/patientListService.js";

const originalPatientMethods = {
  countDocuments: Patient.countDocuments,
  find: Patient.find,
};

after(() => {
  restorePatientMethods();
});

function restorePatientMethods() {
  Patient.countDocuments = originalPatientMethods.countDocuments;
  Patient.find = originalPatientMethods.find;
}

function makePatient(overrides = {}) {
  return {
    _id: "synthetic-patient-id",
    fullname: "Synthetic Patient",
    email: "synthetic@example.test",
    phone: "+16195550101",
    phoneDigits: "16195550101",
    country: "United States",
    state: "California",
    city: "San Diego",
    age: 36,
    ageCategory: "18-59",
    diseases: ["synthetic condition"],
    allergies: [],
    medications: [],
    approvedAt: new Date("2026-01-01T12:00:00.000Z"),
    updatedAt: new Date("2026-01-02T12:00:00.000Z"),
    ...overrides,
  };
}

function mockPatientFind(sourceItems) {
  const calls = [];

  Patient.find = (query) => {
    const call = {
      query,
      chain: [],
      sort: undefined,
      skip: undefined,
      limit: undefined,
      select: undefined,
      leanOptions: undefined,
    };
    calls.push(call);

    const chain = {
      sort(sort) {
        call.chain.push("sort");
        call.sort = sort;
        return chain;
      },
      skip(skip) {
        call.chain.push("skip");
        call.skip = skip;
        return chain;
      },
      limit(limit) {
        call.chain.push("limit");
        call.limit = limit;
        return chain;
      },
      select(projection) {
        call.chain.push("select");
        call.select = projection;
        return chain;
      },
      async lean(options) {
        call.chain.push("lean");
        call.leanOptions = options;

        const start = call.skip ?? 0;
        const end = call.limit === undefined ? undefined : start + call.limit;

        return sourceItems.slice(start, end).map((patient) => {
          const leanPatient = { ...patient };

          // Simulate Mongo's negative projection in the query mock so this
          // test checks both the requested projection and the returned shape.
          if (call.select === "-approvedSnapshot") {
            delete leanPatient.approvedSnapshot;
          }

          // Patient.isPendingApproval is a schema virtual. This mirrors the
          // existing virtual's lean output without changing model internals.
          if (options?.virtuals) {
            leanPatient.isPendingApproval =
              !leanPatient.approvedAt ||
              new Date(leanPatient.updatedAt).getTime() >
                new Date(leanPatient.approvedAt).getTime();
          }

          return leanPatient;
        });
      },
    };

    return chain;
  };

  return calls;
}

test("getMyPatientsService excludes approvedSnapshot from the doctor list only", async () => {
  restorePatientMethods();

  const sourceItems = [
    makePatient({
      _id: "synthetic-first-patient-id",
      fullname: "Synthetic First Patient",
      updatedAt: new Date("2026-01-01T12:00:00.000Z"),
      approvedAt: new Date("2026-01-01T12:00:00.000Z"),
    }),
    makePatient({
      approvedSnapshot: {
        set: {
          privateSentinel: "approved-snapshot-sentinel-".repeat(512),
        },
        unset: {},
      },
    }),
  ];
  const findCalls = mockPatientFind(sourceItems);
  const countCalls = [];
  Patient.countDocuments = async (query) => {
    countCalls.push(query);
    return 3;
  };

  try {
    const result = await getMyPatientsService({
      user: { _id: "doctor-id" },
      queryParams: { page: "2", limit: "1" },
    });

    assert.equal(findCalls.length, 1);
    assert.deepEqual(findCalls[0].query, {
      $or: [{ owners: "doctor-id" }, { createdBy: "doctor-id" }],
    });
    assert.deepEqual(findCalls[0].sort, { createdAt: -1 });
    assert.equal(findCalls[0].skip, 1);
    assert.equal(findCalls[0].limit, 1);
    assert.equal(findCalls[0].select, "-approvedSnapshot");
    assert.deepEqual(findCalls[0].leanOptions, { virtuals: true });
    assert.deepEqual(findCalls[0].chain, ["sort", "skip", "limit", "select", "lean"]);

    assert.equal(countCalls.length, 1);
    assert.deepEqual(countCalls[0], findCalls[0].query);

    const expectedListedPatient = { ...sourceItems[1], isPendingApproval: true };
    delete expectedListedPatient.approvedSnapshot;

    assert.deepEqual(result, {
      items: [expectedListedPatient],
      total: 3,
      page: 2,
      pages: 3,
    });

    const listedPatient = result.items[0];
    assert.equal(Object.hasOwn(listedPatient, "approvedSnapshot"), false);
    assert.equal(JSON.stringify(listedPatient).includes("approved-snapshot-sentinel"), false);
    assert.equal(Object.hasOwn(listedPatient, "isPendingApproval"), true);
    assert.equal(listedPatient.isPendingApproval, true);
    assert.deepEqual(
      {
        _id: listedPatient._id,
        fullname: listedPatient.fullname,
        email: listedPatient.email,
        phone: listedPatient.phone,
        country: listedPatient.country,
        diseases: listedPatient.diseases,
        approvedAt: listedPatient.approvedAt,
        updatedAt: listedPatient.updatedAt,
      },
      {
        _id: "synthetic-patient-id",
        fullname: "Synthetic Patient",
        email: "synthetic@example.test",
        phone: "+16195550101",
        country: "United States",
        diseases: ["synthetic condition"],
        approvedAt: new Date("2026-01-01T12:00:00.000Z"),
        updatedAt: new Date("2026-01-02T12:00:00.000Z"),
      }
    );
  } finally {
    restorePatientMethods();
  }
});
