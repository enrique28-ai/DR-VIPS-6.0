import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Patient from "../../../models/Patient.js";
import User from "../../../models/User.js";
import PatientAccessRequest from "../../../models/PatientAccessRequest.js";
import patientRouter from "../../../routes/patientRoutes.js";
import { apiNoStore } from "../../../middleware/securityHeaders.js";
import { errorHandler } from "../../../middleware/errorHandler.js";

const DOCTOR_ID = "64b000000000000000000001";
const PATIENT_ID = "64b000000000000000000003";
const CHILD_ID = "64b000000000000000000004";
const REQUEST_ID = "64b000000000000000000006";
const USER_ID = "64b000000000000000000007";
const OTHER_DOCTOR_ID = "64b000000000000000000009";
const confirmation = { message: "If a matching patient is found, the access request will be available for the patient or authorized guardian to review." };
const adult = {
  _id: PATIENT_ID, fullname: "Private Middle Patient", email: "patient@example.com",
  phone: "+16195550101", birthDate: new Date("1990-01-01"), age: 36,
  owners: [OTHER_DOCTOR_ID], createdBy: OTHER_DOCTOR_ID,
  approvedSnapshot: { diagnoses: ["private diagnosis"] },
};
const child = { ...adult, _id: CHILD_ID, fullname: "Minor Patient", email: "minor@example.com",
  parentEmail: "guardian@example.com", birthDate: new Date("2015-01-01"), age: 11 };
const identity = { mode: "adult", fullname: adult.fullname, email: adult.email };
const queryResult = (value) => ({
  select() { return this; }, sort() { return this; }, populate() { return this; },
  session() { return this; }, limit() { return this; }, async lean() { return value; },
});

async function harness(t, fixtures = [adult, child]) {
  const originalSecret = process.env.JWT_SECRET;
  const secret = "synthetic-patient-identification-test-secret";
  process.env.JWT_SECRET = secret;
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  const doctor = { _id: DOCTOR_ID, role: "doctor", isVerified: true, sessionVersion: 0, name: "Synthetic Doctor", email: "doctor@example.com" };
  const patientUser = { _id: USER_ID, role: "patient", email: adult.email, isVerified: true, sessionVersion: 0 };
  const guardian = { ...patientUser, _id: "64b000000000000000000008", email: child.parentEmail };
  const unverified = { ...doctor, _id: "64b000000000000000000010", isVerified: false };
  const actors = [doctor, patientUser, guardian, unverified];
  const patients = fixtures.map((patient) => ({ ...patient, owners: [...patient.owners] }));
  const requests = [];
  const state = { lookups: 0, grants: [], upserts: [] };
  t.mock.method(User, "findById", (id) => ({ select: async () => actors.find((actor) => actor._id === id) }));
  t.mock.method(Patient, "find", (filter) => {
    state.lookups += 1;
    const matches = patients.filter((patient) => filter.$or
      ? filter.$or.some((part) => Object.entries(part).every(([key, value]) => patient[key] === value))
      : patient[filter.parentEmail ? "parentEmail" : "email"] === (filter.parentEmail || filter.email));
    return queryResult(matches);
  });
  t.mock.method(Patient, "findById", (id) => {
    state.lookups += 1;
    return queryResult(patients.find((patient) => patient._id === id) || null);
  });
  t.mock.method(Patient, "findOne", (filter) => {
    state.lookups += 1;
    return queryResult(patients.find((patient) => patient._id === filter._id &&
      (patient.createdBy === DOCTOR_ID || patient.owners.includes(DOCTOR_ID))) || null);
  });
  t.mock.method(PatientAccessRequest, "findOneAndUpdate", (filter, update) => {
    if (update.$setOnInsert) {
      state.upserts.push(filter);
      let request = requests.find((entry) => entry.patient === filter.patient && entry.doctor === filter.doctor && entry.status === "pending");
      if (!request) {
        request = { _id: REQUEST_ID, ...update.$setOnInsert };
        requests.push(request);
      }
      return queryResult(request);
    }
    const request = requests.find((entry) => entry._id === filter._id && entry.status === filter.status);
    if (request) Object.assign(request, update.$set);
    return queryResult(request || null);
  });
  t.mock.method(PatientAccessRequest, "find", (filter) => queryResult(requests.filter((request) =>
    (!filter.doctor || request.doctor === filter.doctor) && (!filter.status || request.status === filter.status) &&
    (!filter.patient || filter.patient.$in.includes(request.patient)),
  ).map((request) => ({ ...request, ...(filter.doctor
    ? { patient: patients.find((patient) => patient._id === request.patient) } : { doctor }) }))));
  t.mock.method(PatientAccessRequest, "findById", (id) => queryResult(requests.find((request) => request._id === id) || null));
  t.mock.method(mongoose.connection, "transaction", async (callback) => callback({ synthetic: true }));
  t.mock.method(Patient, "updateOne", async (filter, update) => {
    state.grants.push({ filter, update });
    const patient = patients.find((entry) => entry._id === filter._id &&
      (filter.email ? entry.email === filter.email : entry.parentEmail === filter.parentEmail));
    if (patient) patient.owners.push(update.$addToSet.owners);
    return { matchedCount: patient ? 1 : 0, modifiedCount: patient ? 1 : 0 };
  });
  const app = express();
  app.use(express.json()); app.use(cookieParser()); app.use("/api", apiNoStore);
  app.use("/api/patients", patientRouter); app.use(errorHandler);
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.once("error", reject);
  });
  t.after(() => new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve())));
  const http = async (path, { actor = doctor, method = "GET", body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (actor) headers.Cookie = `token=${jwt.sign({ userId: actor._id, sessionVersion: 0 }, secret, { expiresIn: "5m" })}`;
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/patients${path}`, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.match(response.headers.get("cache-control"), /private, no-store/);
    return { status: response.status, body: await response.json() };
  };
  const submit = (body = identity, path = "/access-requests") => http(path, { method: "POST", body });
  return { http, submit, doctor, patientUser, guardian, unverified, patients, requests, state };
}

test("HTTP adult identification is neutral and idempotent; only consent grants the exact record", async (t) => {
  const h = await harness(t);
  assert.deepEqual(await h.submit({ ...identity, fullname: "  PRIVATE   middle patient  ", email: " PATIENT@EXAMPLE.COM " }), { status: 202, body: confirmation });
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].patient, PATIENT_ID);
  assert.equal(h.requests[0].doctor, DOCTOR_ID);
  assert.deepEqual(await h.submit(), { status: 202, body: confirmation });
  assert.equal(h.requests.length, 1);
  assert.equal(h.state.grants.length, 0);
  assert.deepEqual(await h.http("/access-requests/mine"), { status: 200, body: { accessRequests: [] } });
  assert.deepEqual(await h.http(`/${PATIENT_ID}`), { status: 404, body: { error: "Paciente no encontrado" } });
  const inbox = await h.http("/me/access-requests", { actor: h.patientUser });
  assert.deepEqual(inbox.body.accessRequests[0].patient, { _id: PATIENT_ID, fullname: adult.fullname });
  const approval = await h.http(`/me/access-requests/${REQUEST_ID}/approve`, { actor: h.patientUser, method: "POST" });
  assert.equal(approval.status, 200);
  assert.equal(approval.body.accessRequest.status, "approved");
  assert.deepEqual(h.state.grants, [{ filter: { _id: PATIENT_ID, email: adult.email }, update: { $addToSet: { owners: DOCTOR_ID } } }]);
  assert.equal(h.patients[1].owners.includes(DOCTOR_ID), false);
  const owned = await h.http(`/${PATIENT_ID}`);
  assert.equal(owned.status, 200);
  assert.equal(owned.body.email, adult.email);
  assert.equal(owned.body.phone, adult.phone);
  assert.equal((await h.http("/access-requests/mine")).body.accessRequests[0].patient._id, PATIENT_ID);
  assert.deepEqual(await h.submit(), { status: 202, body: confirmation });
});

test("HTTP minors use their current guardian; rejection grants no access or doctor history confirmation", async (t) => {
  const h = await harness(t);
  assert.deepEqual(await h.submit({ mode: "minor", fullname: child.fullname, email: child.parentEmail }), { status: 202, body: confirmation });
  assert.equal(h.requests[0].patient, CHILD_ID);
  const inbox = await h.http("/me/access-requests", { actor: h.guardian });
  assert.equal(inbox.body.accessRequests[0].patient.fullname, child.fullname);
  const rejection = await h.http(`/me/access-requests/${REQUEST_ID}/reject`, { actor: h.guardian, method: "POST" });
  assert.equal(rejection.status, 200);
  assert.equal(rejection.body.accessRequest.status, "rejected");
  assert.equal(h.state.grants.length, 0);
  assert.deepEqual(await h.http("/access-requests/mine"), { status: 200, body: { accessRequests: [] } });
  assert.equal((await h.http(`/${CHILD_ID}`)).status, 404);
});

test("missing, partial, incorrect, wrong-mode and ambiguous identities return the same response without writes", async (t) => {
  const h = await harness(t, [adult, child, { ...adult, _id: "64b000000000000000000011" }]);
  for (const body of [identity, { ...identity, fullname: "Missing Patient" }, { ...identity, fullname: "Private" },
    { ...identity, fullname: ".*" }, { ...identity, email: "wrong@example.com" }, { ...identity, mode: "minor" },
    { mode: "adult", fullname: child.fullname, email: child.email },
    { mode: "minor", fullname: child.fullname, email: "old-guardian@example.com" }]) {
    assert.deepEqual(await h.submit(body), { status: 202, body: confirmation });
  }
  assert.equal(h.requests.length, 0);
  assert.equal(h.state.grants.length, 0);
});

test("legacy discovery does no lookup; ID aliases require exact identity and ignore their path ID", async (t) => {
  const h = await harness(t);
  for (const path of ["/global-search?q=Private", `/global/${PATIENT_ID}`, "/global/not-an-id"]) {
    assert.deepEqual(await h.http(path), { status: 404, body: { error: "Patient identification is required" } });
  }
  assert.equal(h.state.lookups, 0);
  for (const path of [`/import/${PATIENT_ID}`, `/access-requests/${PATIENT_ID}`]) {
    assert.equal((await h.submit({}, path)).status, 400);
    assert.equal(h.state.lookups, 0);
    assert.deepEqual(await h.submit(identity, path.replace(PATIENT_ID, "unrelated-id")), { status: 202, body: confirmation });
    assert.equal(h.requests[0].patient, PATIENT_ID);
    h.state.lookups = 0;
  }
  assert.equal(h.requests.length, 1);
});

test("all identification entry points retain authentication, verification and doctor role checks", async (t) => {
  const h = await harness(t);
  for (const [path, method] of [["/access-requests", "POST"], [`/import/${PATIENT_ID}`, "POST"],
    [`/access-requests/${PATIENT_ID}`, "POST"], ["/access-requests/mine", "GET"],
    ["/global-search?q=Private", "GET"], [`/global/${PATIENT_ID}`, "GET"]]) {
    for (const [actor, status] of [[null, 401], [h.unverified, 403], [h.patientUser, 403]]) {
      assert.equal((await h.http(path, { actor, method, ...(method === "POST" ? { body: identity } : {}) })).status, status);
    }
  }
  assert.equal(h.state.lookups, 0);
  assert.equal(h.requests.length, 0);
});

test("malformed identity inputs return a constant validation error without patient lookups or input echo", async (t) => {
  const h = await harness(t);
  for (const body of [{}, { ...identity, mode: "guardian" }, { ...identity, fullname: "" },
    { ...identity, fullname: "x".repeat(201) }, { ...identity, fullname: "Private\u0000Name" },
    { ...identity, fullname: { $regex: ".*" } }, { ...identity, email: [adult.email] },
    { ...identity, email: "invalid email" }, { ...identity, email: "a\r\nb@example.com" }]) {
    assert.deepEqual(await h.submit(body), { status: 400, body: { errorCode: "INVALID_PATIENT_IDENTIFICATION", error: "Provide a valid patient type, full name and email address" } });
  }
  assert.equal(h.state.lookups, 0);
});

test("operational identification errors use sanitized responses and logs", async (t) => {
  const h = await harness(t);
  const sentinel = "private-patient@example.com +16195550101 Private Middle Patient";
  t.mock.method(Patient, "find", () => { throw new Error(sentinel); });
  const logs = t.mock.method(console, "error", () => {});
  assert.deepEqual(await h.submit(), { status: 500, body: { error: "Internal server error" } });
  assert.equal(JSON.stringify(logs.mock.calls).includes(sentinel), false);
});
