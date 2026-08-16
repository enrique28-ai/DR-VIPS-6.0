import assert from "node:assert/strict";
import dnsPromises from "node:dns/promises";
import { readFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { after, test } from "node:test";

import express from "express";

const originalResolveMx = dnsPromises.resolveMx;
const originalResolve4 = dnsPromises.resolve4;
const originalResolve6 = dnsPromises.resolve6;

dnsPromises.resolveMx = async () => [{ exchange: "mail.example.com", priority: 10 }];
dnsPromises.resolve4 = async () => [];
dnsPromises.resolve6 = async () => [];
syncBuiltinESMExports();

const { default: Patient } = await import("../../../models/Patient.js");
const {
  createPatient,
  createPatientAccessRequest,
  getMyPatients,
} = await import("../../patientController.js");
const { errorHandler } = await import("../../../middleware/errorHandler.js");
const {
  apiNoStore,
  createSecurityHeaders,
} = await import("../../../middleware/securityHeaders.js");

after(() => {
  dnsPromises.resolveMx = originalResolveMx;
  dnsPromises.resolve4 = originalResolve4;
  dnsPromises.resolve6 = originalResolve6;
  syncBuiltinESMExports();
});

function createResponse() {
  const state = { statuses: [], bodies: [] };
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

function makeValidCreateBody() {
  return {
    fullname: "Duplicate Patient",
    email: "duplicate@example.com",
    phone: "6195550102",
    phoneCountry: "United States",
    phoneCountryIso: "US",
    birthDate: "1990-01-01",
    bloodtype: "O+",
    gender: "female",
    organDonor: false,
    bloodDonor: false,
    measurementSystem: "metric",
    height: 1.7,
    weight: 65,
    country: "United States",
    state: "California",
    city: "San Diego",
    birthCountry: "United States",
    birthState: "California",
    birthCity: "San Diego",
  };
}

test("known patient-service 4xx errors preserve status, message, and errorCode", async () => {
  const { res, state } = createResponse();
  const nextErrors = [];

  await createPatientAccessRequest(
    {
      params: { patientId: "64b000000000000000000001" },
      user: { _id: "patient-user", role: "patient" },
    },
    res,
    (error) => nextErrors.push(error),
  );

  assert.deepEqual(state.statuses, [403]);
  assert.deepEqual(state.bodies, [{
    errorCode: "INSUFFICIENT_ROLE",
    error: "Insufficient role",
  }]);
  assert.deepEqual(nextErrors, []);
});

test("unexpected patient errors are forwarded unchanged without a local response or raw logging", async (t) => {
  const expectedError = new Error("PRIVATE_PATIENT_DATABASE_MESSAGE");
  expectedError.stack = "PRIVATE_PATIENT_DATABASE_STACK";
  t.mock.method(Patient, "find", () => {
    throw expectedError;
  });
  const consoleError = t.mock.method(console, "error", () => {});
  const { res, state } = createResponse();
  const nextErrors = [];

  await getMyPatients(
    { query: {}, user: { _id: "PRIVATE_PATIENT_OWNER" } },
    res,
    (error) => nextErrors.push(error),
  );

  assertNoLocalResponse(state);
  assert.deepEqual(nextErrors, [expectedError]);
  assert.equal(consoleError.mock.callCount(), 0);
});

test("patient errors with status 500 are forwarded instead of exposing their message", async (t) => {
  const expectedError = Object.assign(new Error("PRIVATE_PATIENT_500_MESSAGE"), {
    status: 500,
  });
  t.mock.method(Patient, "find", () => {
    throw expectedError;
  });
  const consoleError = t.mock.method(console, "error", () => {});
  const { res, state } = createResponse();
  const nextErrors = [];

  await getMyPatients(
    { query: {}, user: { _id: "patient-owner" } },
    res,
    (error) => nextErrors.push(error),
  );

  assertNoLocalResponse(state);
  assert.deepEqual(nextErrors, [expectedError]);
  assert.equal(consoleError.mock.callCount(), 0);
});

for (const invalidStatus of ["400", 399, 499.5]) {
  test(`patient errors with invalid status ${JSON.stringify(invalidStatus)} are forwarded`, async (t) => {
    const expectedError = Object.assign(new Error("PRIVATE_INVALID_STATUS_MESSAGE"), {
      status: invalidStatus,
    });
    t.mock.method(Patient, "find", () => {
      throw expectedError;
    });
    const consoleError = t.mock.method(console, "error", () => {});
    const { res, state } = createResponse();
    const nextErrors = [];

    await getMyPatients(
      { query: {}, user: { _id: "patient-owner" } },
      res,
      (error) => nextErrors.push(error),
    );

    assertNoLocalResponse(state);
    assert.deepEqual(nextErrors, [expectedError]);
    assert.equal(consoleError.mock.callCount(), 0);
  });
}

test("createPatient preserves the explicit duplicate-email response", async (t) => {
  t.mock.method(Patient, "findOne", () => ({
    select() {
      return this;
    },
    lean: async () => null,
  }));
  t.mock.method(Patient, "find", () => ({
    sort() {
      return this;
    },
    select() {
      return this;
    },
    lean: async () => [],
  }));
  const duplicateError = Object.assign(new Error("raw duplicate detail"), {
    code: 11000,
    keyPattern: { email: 1 },
  });
  t.mock.method(Patient, "create", async () => {
    throw duplicateError;
  });
  const consoleError = t.mock.method(console, "error", () => {});
  const { res, state } = createResponse();
  const nextErrors = [];

  await createPatient(
    {
      body: makeValidCreateBody(),
      user: { _id: "doctor-id", role: "doctor" },
    },
    res,
    (error) => nextErrors.push(error),
  );

  assert.deepEqual(state.statuses, [409]);
  assert.deepEqual(state.bodies, [{
    errorCode: "PATIENT_EMAIL_EXISTS",
    error: "A patient with this email already exists.",
  }]);
  assert.deepEqual(nextErrors, []);
  assert.equal(consoleError.mock.callCount(), 0);
});

test("unexpected patient errors use the sanitized global 500 response and controlled log", async (t) => {
  const sentinels = [
    "PRIVATE_PATIENT_MESSAGE",
    "PRIVATE_PATIENT_STACK",
    "PRIVATE_PATIENT_OWNER_ID",
  ];
  const expectedError = new Error(sentinels[0]);
  expectedError.stack = sentinels[1];
  t.mock.method(Patient, "find", () => ({
    sort() {
      return this;
    },
    skip() {
      return this;
    },
    limit() {
      return this;
    },
    lean() {
      return Promise.reject(expectedError);
    },
  }));
  t.mock.method(Patient, "countDocuments", async () => 0);
  const consoleError = t.mock.method(console, "error", () => {});

  const app = express();
  app.use(createSecurityHeaders({ isProduction: false }));
  app.use("/api", apiNoStore);
  app.get(
    "/api/patients",
    (req, _res, next) => {
      req.user = { _id: sentinels[2] };
      next();
    },
    getMyPatients,
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
  const response = await fetch(`http://127.0.0.1:${port}/api/patients`);
  const body = await response.text();
  const logs = consoleError.mock.calls.map((call) => call.arguments);
  const exposed = JSON.stringify({
    body,
    headers: Object.fromEntries(response.headers),
    logs,
  });

  assert.equal(response.status, 500);
  assert.equal(body, '{"error":"Internal server error"}');
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

test("all patient controller catches use the shared pipeline and contain no local error logging", async () => {
  const controllerUrl = new URL("../../patientController.js", import.meta.url);
  const source = await readFile(controllerUrl, "utf8");
  const handlerCount = [...source.matchAll(/^export const \w+ = async \(req, res, next\) =>/gm)].length;
  const catchCount = [...source.matchAll(/} catch \(err\) {/g)].length;
  const pipelineCount = [...source.matchAll(/return handlePatientServiceError\(/g)].length;

  assert.equal(handlerCount, 25);
  assert.equal(catchCount, 25);
  assert.equal(pipelineCount, 25);
  assert.equal(source.includes("console.error"), false);
  assert.equal(source.includes("err.status || 500"), false);
  assert.equal(source.includes('err.message || "Server error"'), false);
  assert.equal(source.includes('err.message || "Internal server error"'), false);
});
