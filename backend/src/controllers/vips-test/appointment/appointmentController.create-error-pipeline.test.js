import assert from "node:assert/strict";
import { test } from "node:test";

import express from "express";
import mongoose from "mongoose";

import Appointment from "../../../models/Appointment.js";
import Notification from "../../../models/Notification.js";
import Patient from "../../../models/Patient.js";
import User from "../../../models/User.js";
import { createAppointment } from "../../appointmentController.js";
import { errorHandler } from "../../../middleware/errorHandler.js";
import {
  apiNoStore,
  createSecurityHeaders,
} from "../../../middleware/securityHeaders.js";

const API_NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  "surrogate-control": "no-store",
  pragma: "no-cache",
  expires: "0",
};

const CREATE_BODY = {
  patientId: "PRIVATE_APPOINTMENT_ID",
  start: "2026-08-10T10:00:00.000Z",
  end: "2026-08-10T10:30:00.000Z",
  reason: "Private follow up",
};

function createResponse() {
  const state = {
    statuses: [],
    bodies: [],
  };
  const res = {
    status(statusCode) {
      state.statuses.push(statusCode);
      return this;
    },
    json(body) {
      state.bodies.push(body);
      return this;
    },
  };

  return { res, state };
}

function assertNoLocalResponse(state) {
  assert.deepEqual(state.statuses, []);
  assert.deepEqual(state.bodies, []);
}

function assertApiNoStoreHeaders(response) {
  for (const [header, value] of Object.entries(API_NO_STORE_HEADERS)) {
    assert.equal(response.headers.get(header), value, header);
  }
}

function makeQuery({ value, error, session, onSelect, onLean }) {
  const query = {
    lean() {
      onLean?.();
      return query;
    },
    select(projection) {
      onSelect?.(projection);
      return query;
    },
    session(receivedSession) {
      assert.equal(receivedSession, session);
      return query;
    },
    then(resolve, reject) {
      const result = error ? Promise.reject(error) : Promise.resolve(value);
      return result.then(resolve, reject);
    },
  };

  return query;
}

function mockCreateTransaction(t, {
  patientError,
  appointmentError,
  userError,
  notificationError,
} = {}) {
  const session = Object.freeze({ id: "appointment-create-error-session" });
  const appointment = {
    _id: "PRIVATE_APPOINTMENT_ID",
    doctor: "doctor-id",
    patient: "patient-id",
    start: new Date(CREATE_BODY.start),
    end: new Date(CREATE_BODY.end),
    reason: "Private follow up",
    status: "pending",
  };

  const transaction = t.mock.method(
    mongoose.connection,
    "transaction",
    async (callback) => callback(session),
  );

  const patientFind = t.mock.method(Patient, "findOne", () => makeQuery({
    value: {
      _id: "patient-id",
      email: "PRIVATE_PATIENT_EMAIL",
      fullname: "Private Patient",
    },
    error: patientError,
    session,
  }));

  const overlapFind = t.mock.method(Appointment, "findOne", () => makeQuery({
    value: null,
    session,
  }));

  const appointmentCreate = t.mock.method(
    Appointment,
    "create",
    async (documents, options) => {
      assert.equal(Array.isArray(documents), true);
      assert.equal(documents.length, 1);
      assert.deepEqual(options, { session });
      if (appointmentError) throw appointmentError;
      return [appointment];
    },
  );

  const userFind = t.mock.method(User, "findOne", () => makeQuery({
    value: { _id: "patient-user-id" },
    error: userError,
    session,
  }));

  const notificationCreate = t.mock.method(
    Notification,
    "create",
    async (documents, options) => {
      assert.equal(Array.isArray(documents), true);
      assert.equal(documents.length, 1);
      assert.deepEqual(options, { session });
      if (notificationError) throw notificationError;
      return documents;
    },
  );

  return {
    appointmentCreate,
    notificationCreate,
    overlapFind,
    patientFind,
    transaction,
    userFind,
  };
}

async function runCreateController(errorMocks) {
  const { res, state } = createResponse();
  const nextErrors = [];

  await createAppointment(
    {
      body: { ...CREATE_BODY, patientId: "patient-id" },
      user: { _id: "doctor-id", role: "doctor" },
    },
    res,
    (error) => nextErrors.push(error),
  );

  return { nextErrors, state };
}

test("createAppointment forwards the same patient lookup error before staging writes", async (t) => {
  const expectedError = new Error("PRIVATE_CREATE_MESSAGE");
  const mocks = mockCreateTransaction(t, { patientError: expectedError });
  const consoleError = t.mock.method(console, "error", () => {});

  const { nextErrors, state } = await runCreateController();

  assertNoLocalResponse(state);
  assert.deepEqual(nextErrors, [expectedError]);
  assert.equal(mocks.transaction.mock.callCount(), 1);
  assert.equal(
    typeof mocks.transaction.mock.calls[0].arguments[0],
    "function",
  );
  assert.equal(mocks.patientFind.mock.callCount(), 1);
  assert.equal(mocks.overlapFind.mock.callCount(), 0);
  assert.equal(mocks.appointmentCreate.mock.callCount(), 0);
  assert.equal(mocks.userFind.mock.callCount(), 0);
  assert.equal(mocks.notificationCreate.mock.callCount(), 0);
  assert.equal(consoleError.mock.callCount(), 0);
});

test("createAppointment forwards Appointment.create errors without looking up or notifying a recipient", async (t) => {
  const expectedError = new Error("PRIVATE_CREATE_MESSAGE");
  const mocks = mockCreateTransaction(t, { appointmentError: expectedError });
  const consoleError = t.mock.method(console, "error", () => {});

  const { nextErrors, state } = await runCreateController();

  assertNoLocalResponse(state);
  assert.deepEqual(nextErrors, [expectedError]);
  assert.equal(mocks.appointmentCreate.mock.callCount(), 1);
  assert.equal(mocks.userFind.mock.callCount(), 0);
  assert.equal(mocks.notificationCreate.mock.callCount(), 0);
  assert.equal(consoleError.mock.callCount(), 0);
});

test("createAppointment forwards the same User.findOne error after Appointment.create is staged", async (t) => {
  const expectedError = new Error("PRIVATE_CREATE_MESSAGE");
  const mocks = mockCreateTransaction(t, { userError: expectedError });
  const consoleError = t.mock.method(console, "error", () => {});

  const { nextErrors, state } = await runCreateController();

  assertNoLocalResponse(state);
  assert.deepEqual(nextErrors, [expectedError]);
  assert.equal(mocks.appointmentCreate.mock.callCount(), 1);
  assert.equal(mocks.userFind.mock.callCount(), 1);
  assert.equal(mocks.notificationCreate.mock.callCount(), 0);
  assert.equal(consoleError.mock.callCount(), 0);
});

test("createAppointment forwards Notification.create errors from the transaction callback", async (t) => {
  const expectedError = new Error("PRIVATE_CREATE_MESSAGE");
  const mocks = mockCreateTransaction(t, { notificationError: expectedError });
  const consoleError = t.mock.method(console, "error", () => {});

  const { nextErrors, state } = await runCreateController();

  assertNoLocalResponse(state);
  assert.deepEqual(nextErrors, [expectedError]);
  assert.equal(mocks.appointmentCreate.mock.callCount(), 1);
  assert.equal(mocks.userFind.mock.callCount(), 1);
  assert.equal(mocks.notificationCreate.mock.callCount(), 1);
  assert.equal(consoleError.mock.callCount(), 0);
});

test("createAppointment forwards an intact 11000 notification error from the transaction callback", async (t) => {
  const expectedError = Object.assign(new Error("PRIVATE_CREATE_MESSAGE"), {
    code: 11000,
    keyPattern: { recipient: 1, code: 1, relatedAppointment: 1 },
    keyValue: {
      recipient: "PRIVATE_PATIENT_EMAIL",
      code: "APPT_NEW_PRIVATE_APPOINTMENT_ID",
      relatedAppointment: "PRIVATE_APPOINTMENT_ID",
    },
  });
  const mocks = mockCreateTransaction(t, { notificationError: expectedError });
  const consoleError = t.mock.method(console, "error", () => {});

  const { nextErrors, state } = await runCreateController();

  assertNoLocalResponse(state);
  assert.deepEqual(nextErrors, [expectedError]);
  assert.equal(nextErrors[0], expectedError);
  assert.equal(mocks.notificationCreate.mock.callCount(), 1);
  assert.equal(consoleError.mock.callCount(), 0);
});

async function startCreateErrorApp(t) {
  const app = express();
  app.use(createSecurityHeaders({ isProduction: false }));
  app.use("/api", apiNoStore);
  app.use(express.json());
  app.post(
    "/api/appointments",
    (req, _res, next) => {
      req.user = {
        _id: "doctor-id",
        role: "doctor",
        email: "PRIVATE_PATIENT_EMAIL",
      };
      next();
    },
    createAppointment,
  );
  app.use(errorHandler);

  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.once("error", reject);
  });
  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );

  return server;
}

test("appointment creation failures use one sanitized global 500 response and log", async (t) => {
  const sentinels = [
    "PRIVATE_CREATE_MESSAGE",
    "PRIVATE_CREATE_STACK",
    "PRIVATE_PATIENT_EMAIL",
    "PRIVATE_APPOINTMENT_ID",
  ];
  const expectedError = new Error(sentinels[0]);
  expectedError.stack = sentinels[1];
  expectedError.patientEmail = sentinels[2];
  expectedError.appointmentId = sentinels[3];
  mockCreateTransaction(t, { patientError: expectedError });
  const consoleError = t.mock.method(console, "error", () => {});
  const server = await startCreateErrorApp(t);

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/appointments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(CREATE_BODY),
  });
  const body = await response.text();
  const logs = consoleError.mock.calls.map((call) => call.arguments);
  const exposed = JSON.stringify({
    body,
    headers: Object.fromEntries(response.headers),
    logs,
  });

  assert.equal(response.status, 500);
  assert.equal(body, '{"error":"Internal server error"}');
  assert.match(response.headers.get("content-type"), /^application\/json\b/);
  assertApiNoStoreHeaders(response);
  assert.deepEqual(logs, [[
    "[backend-error]",
    {
      level: "error",
      type: "internal_error",
      method: "POST",
      pathname: "api_request",
      status: 500,
      message: "unhandled_request_error",
    },
  ]]);
  for (const sentinel of sentinels) {
    assert.equal(exposed.includes(sentinel), false, sentinel);
  }
});

test("duplicate notification errors use a safe global 409 response without MongoDB details", async (t) => {
  const sentinels = [
    "PRIVATE_CREATE_MESSAGE",
    "PRIVATE_CREATE_STACK",
    "PRIVATE_PATIENT_EMAIL",
    "PRIVATE_APPOINTMENT_ID",
  ];
  const expectedError = Object.assign(new Error(sentinels[0]), {
    code: 11000,
    keyPattern: { recipient: 1, code: 1, relatedAppointment: 1 },
    keyValue: {
      recipient: sentinels[2],
      code: `APPT_NEW_${sentinels[3]}`,
      relatedAppointment: sentinels[3],
    },
  });
  expectedError.stack = sentinels[1];
  mockCreateTransaction(t, { notificationError: expectedError });
  const consoleError = t.mock.method(console, "error", () => {});
  const server = await startCreateErrorApp(t);

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/appointments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...CREATE_BODY, patientId: "patient-id" }),
  });
  const body = await response.text();
  const logs = consoleError.mock.calls.map((call) => call.arguments);
  const exposed = JSON.stringify({
    body,
    headers: Object.fromEntries(response.headers),
    logs,
  });

  assert.equal(response.status, 409);
  assert.equal(body, '{"error":"Resource already exists"}');
  assert.match(response.headers.get("content-type"), /^application\/json\b/);
  assertApiNoStoreHeaders(response);
  assert.deepEqual(logs, []);
  for (const sentinel of sentinels) {
    assert.equal(exposed.includes(sentinel), false, sentinel);
  }
});
