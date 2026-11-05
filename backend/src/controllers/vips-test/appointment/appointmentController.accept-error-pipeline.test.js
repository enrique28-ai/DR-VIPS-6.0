import assert from "node:assert/strict";
import { test } from "node:test";

import express from "express";

import Appointment from "../../../models/Appointment.js";
import Notification from "../../../models/Notification.js";
import { acceptAppointment } from "../../appointmentController.js";
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

test("acceptAppointment forwards the same findById populate error without responding or logging", async (t) => {
  const expectedError = new Error("PRIVATE_ACCEPT_FIND_ERROR");
  let populateCall;
  t.mock.method(Appointment, "findById", (id) => ({
    populate(path, select) {
      populateCall = { id, path, select };
      return Promise.reject(expectedError);
    },
  }));
  const consoleError = t.mock.method(console, "error", () => {});
  const { res, state } = createResponse();
  const nextErrors = [];

  await acceptAppointment(
    {
      params: { id: "appointment-find-error" },
      user: { email: "patient@example.test", role: "patient" },
    },
    res,
    (error) => nextErrors.push(error),
  );

  assert.deepEqual(populateCall, {
    id: "appointment-find-error",
    path: "patient",
    select: "email parentEmail minorKey birthDate age dateOfDeath fullname name isDeceased",
  });
  assertNoLocalResponse(state);
  assert.deepEqual(nextErrors, [expectedError]);
  assert.equal(consoleError.mock.callCount(), 0);
});

test("acceptAppointment forwards the same save error without responding, logging, or notifying", async (t) => {
  const expectedError = new Error("PRIVATE_ACCEPT_SAVE_ERROR");
  const appointment = {
    _id: "appointment-save-error",
    doctor: "doctor-id",
    patient: {
      email: "patient@example.test",
      fullname: "Patient Test",
      isDeceased: false,
    },
    status: "pending",
    start: new Date("2026-08-10T10:00:00.000Z"),
    end: new Date("2026-08-10T10:30:00.000Z"),
    async save() {
      throw expectedError;
    },
  };
  t.mock.method(Appointment, "findById", () => ({
    populate() {
      return appointment;
    },
  }));
  t.mock.method(Appointment, "findOne", () => ({
    select() {
      return null;
    },
  }));
  const notificationCreate = t.mock.method(Notification, "create", async () => {
    assert.fail("Notification.create should not run after save fails");
  });
  const consoleError = t.mock.method(console, "error", () => {});
  const { res, state } = createResponse();
  const nextErrors = [];

  await acceptAppointment(
    {
      params: { id: appointment._id },
      user: { email: "patient@example.test", role: "patient" },
    },
    res,
    (error) => nextErrors.push(error),
  );

  assert.equal(appointment.status, "accepted");
  assertNoLocalResponse(state);
  assert.deepEqual(nextErrors, [expectedError]);
  assert.equal(notificationCreate.mock.callCount(), 0);
  assert.equal(consoleError.mock.callCount(), 0);
});

test("appointment acceptance failures use one sanitized global 500 response and log", async (t) => {
  const sentinels = [
    "PRIVATE_ACCEPT_MESSAGE",
    "PRIVATE_ACCEPT_STACK",
    "PRIVATE_PATIENT_EMAIL",
    "PRIVATE_APPOINTMENT_ID",
  ];
  const expectedError = new Error(sentinels[0]);
  expectedError.stack = sentinels[1];
  let requestedAppointmentId;
  t.mock.method(Appointment, "findById", (id) => {
    requestedAppointmentId = id;
    return {
      populate() {
        return Promise.reject(expectedError);
      },
    };
  });
  const consoleError = t.mock.method(console, "error", () => {});

  const app = express();
  app.use(createSecurityHeaders({ isProduction: false }));
  app.use("/api", apiNoStore);
  app.put(
    "/api/appointments/:id/accept",
    (req, _res, next) => {
      req.user = {
        _id: "patient-user-id",
        role: "patient",
        email: "PRIVATE_PATIENT_EMAIL",
      };
      next();
    },
    acceptAppointment,
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
    `http://127.0.0.1:${port}/api/appointments/PRIVATE_APPOINTMENT_ID/accept`,
    { method: "PUT" },
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
      method: "PUT",
      pathname: "api_request",
      status: 500,
      message: "unhandled_request_error",
    },
  ]]);
  for (const sentinel of sentinels) {
    assert.equal(exposed.includes(sentinel), false, sentinel);
  }
});
