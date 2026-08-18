import assert from "node:assert/strict";
import { test } from "node:test";

import express from "express";

import Appointment from "../../../models/Appointment.js";
import Notification from "../../../models/Notification.js";
import User from "../../../models/User.js";
import { deleteAppointment } from "../../appointmentController.js";
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

const PATIENT_POPULATE_SELECT =
  "email parentEmail minorKey birthDate age dateOfDeath fullname name isDeceased";

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

function mockDeleteAppointmentLookup(t, appointment) {
  const populateCalls = [];
  t.mock.method(Appointment, "findById", (id) => {
    const chain = {
      populate(path, select) {
        populateCalls.push({ id, path, select });
        return populateCalls.length === 1 ? chain : appointment;
      },
    };
    return chain;
  });

  return populateCalls;
}

test("deleteAppointment preserves the exact not-found response without calling next", async (t) => {
  mockDeleteAppointmentLookup(t, null);
  const consoleError = t.mock.method(console, "error", () => {});
  const { res, state } = createResponse();
  const nextErrors = [];

  await deleteAppointment(
    {
      params: { id: "missing-appointment-id" },
      user: { _id: "patient-user-id", email: "patient@example.test" },
    },
    res,
    (error) => nextErrors.push(error),
  );

  assert.deepEqual(state.statuses, [404]);
  assert.deepEqual(state.bodies, [{ error: "Not found" }]);
  assert.deepEqual(nextErrors, []);
  assert.equal(consoleError.mock.callCount(), 0);
});

test("deleteAppointment forwards the same populate error without responding or logging", async (t) => {
  const expectedError = new Error("PRIVATE_DELETE_FIND_ERROR");
  const populateCalls = [];
  t.mock.method(Appointment, "findById", (id) => {
    const chain = {
      populate(path, select) {
        populateCalls.push({ id, path, select });
        return populateCalls.length === 1
          ? chain
          : Promise.reject(expectedError);
      },
    };
    return chain;
  });
  const consoleError = t.mock.method(console, "error", () => {});
  const { res, state } = createResponse();
  const nextErrors = [];

  await deleteAppointment(
    {
      params: { id: "appointment-find-error" },
      user: { _id: "doctor-id", email: "doctor@example.test" },
    },
    res,
    (error) => nextErrors.push(error),
  );

  assert.deepEqual(populateCalls, [
    {
      id: "appointment-find-error",
      path: "patient",
      select: PATIENT_POPULATE_SELECT,
    },
    {
      id: "appointment-find-error",
      path: "doctor",
      select: "name  email",
    },
  ]);
  assertNoLocalResponse(state);
  assert.deepEqual(nextErrors, [expectedError]);
  assert.equal(consoleError.mock.callCount(), 0);
});

test("deleteAppointment forwards the same User.findOne error before notification or deletion", async (t) => {
  const expectedError = new Error("PRIVATE_DELETE_USER_ERROR");
  let deleteCalls = 0;
  const appointment = {
    _id: "appointment-user-error",
    doctor: { _id: "doctor-id", name: "Doctor Test" },
    patient: { email: "patient@example.test", fullname: "Patient Test" },
    status: "accepted",
    start: new Date("2026-08-10T10:00:00.000Z"),
    async deleteOne() {
      deleteCalls += 1;
    },
  };
  mockDeleteAppointmentLookup(t, appointment);
  t.mock.method(User, "findOne", () => ({
    select() {
      return {
        lean() {
          return Promise.reject(expectedError);
        },
      };
    },
  }));
  const notificationCreate = t.mock.method(Notification, "create", async () => {
    assert.fail("Notification.create should not run after User.findOne fails");
  });
  const consoleError = t.mock.method(console, "error", () => {});
  const { res, state } = createResponse();
  const nextErrors = [];

  await deleteAppointment(
    {
      params: { id: appointment._id },
      user: { _id: "doctor-id", email: "doctor@example.test" },
    },
    res,
    (error) => nextErrors.push(error),
  );

  assertNoLocalResponse(state);
  assert.deepEqual(nextErrors, [expectedError]);
  assert.equal(notificationCreate.mock.callCount(), 0);
  assert.equal(deleteCalls, 0);
  assert.equal(consoleError.mock.callCount(), 0);
});

test("deleteAppointment forwards the same deleteOne error without responding or logging", async (t) => {
  const expectedError = new Error("PRIVATE_DELETE_ONE_ERROR");
  const appointment = {
    _id: "appointment-delete-error",
    doctor: { _id: "doctor-id", name: "Doctor Test" },
    patient: { email: "", fullname: "Patient Test" },
    status: "accepted",
    start: new Date("2026-08-10T10:00:00.000Z"),
    async deleteOne() {
      throw expectedError;
    },
  };
  mockDeleteAppointmentLookup(t, appointment);
  const userFindOne = t.mock.method(User, "findOne", () => {
    assert.fail("User.findOne should not run without a patient email");
  });
  const notificationCreate = t.mock.method(Notification, "create", async () => {
    assert.fail("Notification.create should not run without a recipient");
  });
  const consoleError = t.mock.method(console, "error", () => {});
  const { res, state } = createResponse();
  const nextErrors = [];

  await deleteAppointment(
    {
      params: { id: appointment._id },
      user: {
        _id: "doctor-id",
        email: "doctor@example.test",
      },
    },
    res,
    (error) => nextErrors.push(error),
  );

  assert.equal(userFindOne.mock.callCount(), 0);
  assert.equal(notificationCreate.mock.callCount(), 0);
  assertNoLocalResponse(state);
  assert.deepEqual(nextErrors, [expectedError]);
  assert.equal(consoleError.mock.callCount(), 0);
});

test("appointment deletion failures use one sanitized global 500 response and log", async (t) => {
  const sentinels = [
    "PRIVATE_DELETE_MESSAGE",
    "PRIVATE_DELETE_STACK",
    "PRIVATE_PATIENT_EMAIL",
    "PRIVATE_APPOINTMENT_ID",
  ];
  const expectedError = new Error(sentinels[0]);
  expectedError.stack = sentinels[1];
  let requestedAppointmentId;
  t.mock.method(Appointment, "findById", (id) => {
    requestedAppointmentId = id;
    const chain = {
      populate() {
        return requestedAppointmentId === id && chain.populateCalls++ === 0
          ? chain
          : Promise.reject(expectedError);
      },
      populateCalls: 0,
    };
    return chain;
  });
  const consoleError = t.mock.method(console, "error", () => {});

  const app = express();
  app.use(createSecurityHeaders({ isProduction: false }));
  app.use("/api", apiNoStore);
  app.delete(
    "/api/appointments/:id",
    (req, _res, next) => {
      req.user = {
        _id: "patient-user-id",
        role: "patient",
        email: "PRIVATE_PATIENT_EMAIL",
      };
      next();
    },
    deleteAppointment,
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

  const { port } = server.address();
  const response = await fetch(
    `http://127.0.0.1:${port}/api/appointments/PRIVATE_APPOINTMENT_ID`,
    { method: "DELETE" },
  );
  const body = await response.text();
  const logs = consoleError.mock.calls.map((call) => call.arguments);
  const exposed = JSON.stringify({
    body,
    headers: Object.fromEntries(response.headers),
    logs,
  });

  assert.equal(requestedAppointmentId, "PRIVATE_APPOINTMENT_ID");
  assert.equal(response.status, 500);
  assert.equal(body, '{"error":"Internal server error"}');
  assert.match(response.headers.get("content-type"), /^application\/json\b/);
  assertApiNoStoreHeaders(response);
  assert.deepEqual(logs, [[
    "[backend-error]",
    {
      level: "error",
      type: "internal_error",
      method: "DELETE",
      pathname: "api_request",
      status: 500,
      message: "unhandled_request_error",
    },
  ]]);
  for (const sentinel of sentinels) {
    assert.equal(exposed.includes(sentinel), false, sentinel);
  }
});
