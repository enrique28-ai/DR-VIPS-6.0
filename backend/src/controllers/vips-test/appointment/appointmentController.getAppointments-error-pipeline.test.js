import assert from "node:assert/strict";
import { test } from "node:test";

import express from "express";

import Appointment from "../../../models/Appointment.js";
import Patient from "../../../models/Patient.js";
import { getAppointments } from "../../appointmentController.js";
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

test("getAppointments forwards the same Appointment.find error without responding or logging", async (t) => {
  const expectedError = new Error("PRIVATE_APPOINTMENT_FIND_ERROR");
  t.mock.method(Appointment, "find", () => {
    throw expectedError;
  });
  const consoleError = t.mock.method(console, "error", () => {});
  const { res, state } = createResponse();
  const nextErrors = [];

  await getAppointments(
    {
      user: {
        _id: "doctor-error-id",
        role: "doctor",
        email: "doctor-error@example.test",
      },
    },
    res,
    (error) => nextErrors.push(error),
  );

  assertNoLocalResponse(state);
  assert.deepEqual(nextErrors, [expectedError]);
  assert.equal(consoleError.mock.callCount(), 0);
});

test("getAppointments forwards the same Patient.findOne error without a local response or log", async (t) => {
  const expectedError = new Error("PRIVATE_PATIENT_FIND_ONE_ERROR");
  t.mock.method(Patient, "findOne", () => {
    throw expectedError;
  });
  t.mock.method(Patient, "find", () => {
    assert.fail("Patient.find should not run after Patient.findOne fails");
  });
  t.mock.method(Appointment, "find", () => {
    assert.fail("Appointment.find should not run after Patient.findOne fails");
  });
  const consoleError = t.mock.method(console, "error", () => {});
  const { res, state } = createResponse();
  const nextErrors = [];

  await getAppointments(
    {
      user: {
        _id: "patient-user-error-id",
        role: "patient",
        email: "patient-error@example.test",
      },
    },
    res,
    (error) => nextErrors.push(error),
  );

  assertNoLocalResponse(state);
  assert.deepEqual(nextErrors, [expectedError]);
  assert.equal(consoleError.mock.callCount(), 0);
});

test("getAppointments forwards the same Patient.find error without a local response or log", async (t) => {
  const expectedError = new Error("PRIVATE_PATIENT_FIND_ERROR");
  t.mock.method(Patient, "findOne", () => ({
    select() {
      return { _id: "patient-profile-id", isDeceased: false };
    },
  }));
  t.mock.method(Patient, "find", () => {
    throw expectedError;
  });
  t.mock.method(Appointment, "find", () => {
    assert.fail("Appointment.find should not run after Patient.find fails");
  });
  const consoleError = t.mock.method(console, "error", () => {});
  const { res, state } = createResponse();
  const nextErrors = [];

  await getAppointments(
    {
      user: {
        _id: "patient-user-error-id",
        role: "patient",
        email: "patient-error@example.test",
      },
    },
    res,
    (error) => nextErrors.push(error),
  );

  assertNoLocalResponse(state);
  assert.deepEqual(nextErrors, [expectedError]);
  assert.equal(consoleError.mock.callCount(), 0);
});

test("appointment read failures use one sanitized global 500 response and log", async (t) => {
  const sentinels = [
    "PRIVATE_APPOINTMENT_MESSAGE",
    "PRIVATE_APPOINTMENT_STACK",
    "PRIVATE_PATIENT_EMAIL",
    "private_patient_email",
    "PRIVATE_PATIENT_ID",
  ];
  const expectedError = new Error(sentinels[0]);
  expectedError.stack = sentinels[1];
  let appointmentQuery;

  t.mock.method(Patient, "findOne", () => ({
    select() {
      return { _id: "guardian-profile-id", isDeceased: false };
    },
  }));
  t.mock.method(Patient, "find", () => ({
    select() {
      return [{ _id: "PRIVATE_PATIENT_ID" }];
    },
  }));
  t.mock.method(Appointment, "find", (query) => {
    appointmentQuery = query;
    const chain = {
      populate() {
        return chain;
      },
      sort() {
        return Promise.reject(expectedError);
      },
    };
    return chain;
  });
  const consoleError = t.mock.method(console, "error", () => {});

  const app = express();
  app.use(createSecurityHeaders({ isProduction: false }));
  app.use("/api", apiNoStore);
  app.get(
    "/api/appointments",
    (req, _res, next) => {
      req.user = {
        _id: "patient-user-id",
        role: "patient",
        email: "PRIVATE_PATIENT_EMAIL",
      };
      next();
    },
    getAppointments,
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
  const response = await fetch(`http://127.0.0.1:${port}/api/appointments`);
  const body = await response.text();
  const logs = consoleError.mock.calls.map((call) => call.arguments);
  const exposed = JSON.stringify({
    body,
    headers: Object.fromEntries(response.headers),
    logs,
  });

  assert.deepEqual(appointmentQuery, {
    patient: { $in: ["PRIVATE_PATIENT_ID"] },
    status: { $in: ["pending", "accepted"] },
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
      method: "GET",
      pathname: "api_request",
      status: 500,
      message: "unhandled_request_error",
    },
  ]]);
  for (const sentinel of sentinels) {
    assert.equal(exposed.includes(sentinel), false, sentinel);
  }
});
