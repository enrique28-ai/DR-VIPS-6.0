import assert from "node:assert/strict";
import { test } from "node:test";
import Diagnosis from "../../../models/Diagnosis.js";
import Patient from "../../../models/Patient.js";
import {
  getDiagnosesByPatient,
  getMyChildDiagnosesPortal,
  getMyDiagnosesPortal,
} from "../../diagnosisController.js";

const patientId = "synthetic-profile";
const profile = { _id: patientId, fullname: "Synthetic child", age: 10 };
const endpoints = [
  ["doctor", getDiagnosesByPatient, { _id: "doctor", role: "doctor" }, { patientId }],
  ["patient", getMyDiagnosesPortal, { role: "patient", email: "patient@example.test" }, {}],
  ["guardian", getMyChildDiagnosesPortal, { role: "patient", email: "guardian@example.test" }, { childId: patientId }],
];
const tijuana = { dateStart: "2026-11-08T08:00:00.000Z", dateEnd: "2026-11-09T08:00:00.000Z" };
const matchDay = ({ dateStart, dateEnd }) => {
  const bounds = { $gte: new Date(dateStart), $lt: new Date(dateEnd) };
  return [{ $or: [{ createdAt: bounds }, { updatedAt: bounds }] }];
};

function mockPatients(t) {
  t.mock.method(Patient, "findOne", () => ({ select: () => ({ lean: async () => profile }) }));
  t.mock.method(Patient, "find", () => ({
    then: (resolve) => resolve([profile]),
    select: () => ({ lean: async () => [profile] }),
  }));
}

async function list([, controller, user, params], query) {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return controller({ user, params, query }, res, (err) => { throw err; });
}

for (const endpoint of endpoints) {
  const [role] = endpoint;
  test(`${role} list combines the local day with search, medicine filter and pagination`, async (t) => {
    mockPatients(t);
    const matches = [{ title: "Synthetic flu one" }, { title: "Synthetic flu two" }];
    const checkFilter = (filter) => {
      assert.deepEqual(filter.$and, matchDay(tijuana));
      assert.deepEqual(filter["medicine.0"], { $exists: true });
      if (role === "doctor") {
        assert.equal(filter.createdBy, "doctor");
        assert.equal(filter.patient, patientId);
        assert.deepEqual(filter.$or[0], { title: { $regex: "flu", $options: "i" } });
      } else {
        assert.deepEqual(filter.patient, { $in: [patientId] });
      }
    };
    const find = t.mock.method(Diagnosis, "find", (filter) => {
      checkFilter(filter);
      return {
        sort() { return this; },
        skip(skip) { assert.equal(skip, 1); return this; },
        limit(limit) { assert.equal(limit, role === "doctor" ? 1 : 5000); return this; },
        populate() { return this; },
        lean: async () => role === "doctor" ? matches.slice(1) : [...matches, { title: "Other" }],
      };
    });
    const count = t.mock.method(Diagnosis, "countDocuments", async (filter) => {
      checkFilter(filter);
      return matches.length;
    });

    const response = await list(endpoint, { ...tijuana, q: "flu", hasMedicines: "true", page: "2", limit: "1" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.items, matches.slice(1));
    assert.deepEqual([response.body.total, response.body.page, response.body.pages], [2, 2, 2]);
    assert.equal(find.mock.callCount(), 1);
    assert.equal(count.mock.callCount(), role === "doctor" ? 1 : 0);
  });

  test(`${role} list rejects malformed or ambiguous date parameters`, async (t) => {
    mockPatients(t);
    t.mock.method(Diagnosis, "find", () => assert.fail("Invalid dates must not query diagnoses"));
    for (const query of [
      { date: "2026-02-29" },
      { date: ["2026-11-08", "2026-11-09"] },
      { dateStart: tijuana.dateStart },
      { dateEnd: tijuana.dateEnd },
      { ...tijuana, dateStart: [tijuana.dateStart] },
      { ...tijuana, dateStart: "2026-11-08T08:00:00" },
      { ...tijuana, dateStart: "2026-11-08T08:00:00.000+00:00" },
      { ...tijuana, dateStart: "2026-11-08T24:00:00.000Z" },
      { ...tijuana, dateEnd: "2026-11-31T08:00:00.000Z" },
      { ...tijuana, dateEnd: "2026-11-07T08:00:00.000Z" },
      { ...tijuana, dateEnd: tijuana.dateStart },
      { ...tijuana, dateEnd: "2026-11-11T08:00:00.000Z" },
      { ...tijuana, date: "2026-11-08" },
    ]) {
      const response = await list(endpoint, query);
      assert.equal(response.statusCode, 400, JSON.stringify(query));
      assert.equal(response.body.errorCode, "INVALID_DIAGNOSIS_DATE_FILTER");
    }
  });
}

test("date ranges cover local midnight, updates, DST, and the last instant of a legacy UTC leap day", async (t) => {
  mockPatients(t);
  let filter;
  t.mock.method(Diagnosis, "find", (query) => {
    filter = query;
    return { sort() { return this; }, skip() { return this; }, limit() { return this; }, lean: async () => [] };
  });
  t.mock.method(Diagnosis, "countDocuments", async (query) => {
    assert.equal(query, filter);
    return 0;
  });
  const matches = (createdAt, updatedAt = createdAt) => filter.$and[0].$or.some((branch) =>
    Object.entries(branch).some(([field, { $gte, $lt }]) => {
      const value = new Date(field === "createdAt" ? createdAt : updatedAt);
      return value >= $gte && value < $lt;
    }));

  assert.equal((await list(endpoints[0], tijuana)).statusCode, 200);
  const evening = "2026-11-09T04:20:00.000Z";
  const beforeMidnight = "2026-11-09T07:59:59.999Z";
  const midnight = "2026-11-09T08:00:00.000Z";
  assert.equal(matches(evening), true);
  assert.equal(matches(beforeMidnight), true);
  assert.equal(matches(midnight), false);
  assert.equal(matches("2026-11-08T07:59:59.999Z", evening), true);
  await list(endpoints[0], { dateStart: midnight, dateEnd: "2026-11-10T08:00:00.000Z" });
  assert.equal(matches(evening), false);
  assert.equal(matches(evening, "2026-11-09T08:00:00.001Z"), true);

  const spring = { dateStart: "2026-03-08T08:00:00.000Z", dateEnd: "2026-03-09T07:00:00.000Z" };
  const autumn = { dateStart: "2026-11-01T07:00:00.000Z", dateEnd: "2026-11-02T08:00:00.000Z" };
  for (const interval of [spring, autumn]) {
    assert.equal((await list(endpoints[0], interval)).statusCode, 200);
    assert.deepEqual(filter.$and, matchDay(interval));
  }

  assert.equal((await list(endpoints[0], { date: "2024-02-29" })).statusCode, 200);
  assert.equal(matches("2024-02-29T23:59:59.999Z"), true);
  assert.equal(matches("2024-03-01T00:00:00.000Z"), false);
});
