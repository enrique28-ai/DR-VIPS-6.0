import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import jwt from "jsonwebtoken";

import Patient from "../../../models/Patient.js";
import ProfessionalAllowlist from "../../../models/ProfessionalAllowlist.js";
import User from "../../../models/User.js";
import { transporter } from "../../../utils/emailTransport.js";

const USER_ID = "64b000000000000000000001";

const originalMethods = {
  patientFindOne: Patient.findOne,
  professionalAllowlistFind: ProfessionalAllowlist.find,
  userCreate: User.create,
  userFindOne: User.findOne,
  sendMail: transporter.sendMail,
};

let auth;

before(async () => {
  process.env.PENDING_SECRET ||= "doctor-email-reservation-pending-secret";
  process.env.JWT_SECRET ||= "doctor-email-reservation-jwt-secret";
  auth = await import("../../authController.js");
});

after(() => {
  restoreMethods();
});

function restoreMethods() {
  Patient.findOne = originalMethods.patientFindOne;
  ProfessionalAllowlist.find = originalMethods.professionalAllowlistFind;
  User.create = originalMethods.userCreate;
  User.findOne = originalMethods.userFindOne;
  transporter.sendMail = originalMethods.sendMail;
}

function makeReq(overrides = {}) {
  return {
    body: {},
    cookies: {},
    headers: {},
    ...overrides,
  };
}

function makeRes() {
  return {
    body: undefined,
    statusCode: 200,
    cookies: [],
    clearedCookies: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = JSON.parse(JSON.stringify(payload));
      return this;
    },
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name, options) {
      this.clearedCookies.push({ name, options });
      return this;
    },
  };
}

function makeUser(overrides = {}) {
  return new User({
    _id: USER_ID,
    name: "Test User",
    email: "test@example.com",
    role: "patient",
    isVerified: false,
    isProfessionalVerified: false,
    sessionVersion: 0,
    ...overrides,
  });
}

function allowProfessionalDomain(domain = "clinic.example") {
  ProfessionalAllowlist.find = (query) => {
    assert.deepEqual(query, {});
    return {
      lean: async () => [{ domain }],
    };
  };
}

function mockPatientEmailLookup({ expectedEmail, patient }) {
  const calls = [];
  Patient.findOne = (query) => {
    calls.push(query);
    assert.deepEqual(query, { email: expectedEmail });
    return {
      select(projection) {
        assert.equal(projection, "_id");
        return { lean: async () => patient };
      },
    };
  };
  return calls;
}

function guardPatientLookup() {
  Patient.findOne = () => {
    throw new Error("Patient.findOne must not be called for patient-role registration");
  };
}

function mockUserCreation() {
  const createCalls = [];
  const mailCalls = [];
  User.findOne = async () => null;
  User.create = async (payload) => {
    createCalls.push(payload);
    return makeUser(payload);
  };
  transporter.sendMail = async (message) => {
    mailCalls.push(message);
    return { accepted: [message.to] };
  };
  return { createCalls, mailCalls };
}

function makePendingToken(email) {
  return jwt.sign(
    {
      email,
      name: "Google User",
      googleId: "google-subject",
      hd: "clinic.example",
    },
    process.env.PENDING_SECRET,
    { expiresIn: "10m" },
  );
}

function assertReservedResponse(res) {
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    errorCode: "DOCTOR_EMAIL_RESERVED",
    error: "This email cannot be used for a doctor account.",
  });
  assert.equal(JSON.stringify(res.body).includes("patient-record-id"), false);
  assert.equal(JSON.stringify(res.body).includes("Existing Patient"), false);
  assert.equal(JSON.stringify(res.body).includes("reserved@clinic.example"), false);
  assert.equal(res.cookies.length, 0);
  assert.equal(res.clearedCookies.length, 0);
}

test("password doctor registration rejects a normalized email already used by a Patient", async () => {
  restoreMethods();
  allowProfessionalDomain();
  const patientCalls = mockPatientEmailLookup({
    expectedEmail: "reserved@clinic.example",
    patient: {
      _id: "patient-record-id",
      fullname: "Existing Patient",
      email: "reserved@clinic.example",
    },
  });
  const { createCalls, mailCalls } = mockUserCreation();

  const res = makeRes();
  await auth.register(
    makeReq({
      body: {
        name: "Doctor User",
        email: "  Reserved@Clinic.Example  ",
        password: "Valid1!",
        role: "doctor",
      },
    }),
    res,
  );

  assertReservedResponse(res);
  assert.deepEqual(patientCalls, [{ email: "reserved@clinic.example" }]);
  assert.equal(createCalls.length, 0);
  assert.equal(mailCalls.length, 0);
});

test("password patient registration remains allowed when Patient.email matches", async () => {
  restoreMethods();
  guardPatientLookup();
  const { createCalls, mailCalls } = mockUserCreation();

  const res = makeRes();
  await auth.register(
    makeReq({
      body: {
        name: "Patient User",
        email: "Patient@Example.COM",
        password: "Valid1!",
        role: "patient",
      },
    }),
    res,
  );

  assert.equal(res.statusCode, 201);
  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].email, "patient@example.com");
  assert.equal(createCalls[0].role, "patient");
  assert.equal(mailCalls.length, 1);
});

test("Google doctor finalization rejects a case-normalized email already used by a Patient", async () => {
  restoreMethods();
  allowProfessionalDomain();
  const patientCalls = mockPatientEmailLookup({
    expectedEmail: "reserved@clinic.example",
    patient: {
      _id: "patient-record-id",
      fullname: "Existing Patient",
      email: "reserved@clinic.example",
    },
  });
  const { createCalls, mailCalls } = mockUserCreation();

  const res = makeRes();
  await auth.googleFinalizeRole(
    makeReq({
      body: { role: "doctor" },
      cookies: { g_pending: makePendingToken("Reserved@Clinic.Example") },
    }),
    res,
  );

  assertReservedResponse(res);
  assert.deepEqual(patientCalls, [{ email: "reserved@clinic.example" }]);
  assert.equal(createCalls.length, 0);
  assert.equal(mailCalls.length, 0);
});

test("Google patient finalization remains allowed when Patient.email matches", async () => {
  restoreMethods();
  guardPatientLookup();
  const { createCalls, mailCalls } = mockUserCreation();

  const res = makeRes();
  await auth.googleFinalizeRole(
    makeReq({
      body: { role: "patient" },
      cookies: { g_pending: makePendingToken("Patient@Example.COM") },
    }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].email, "patient@example.com");
  assert.equal(createCalls[0].role, "patient");
  assert.equal(mailCalls.length, 0);
});

test("professional allowlist rejection keeps precedence and does not query Patient", async () => {
  restoreMethods();
  ProfessionalAllowlist.find = () => ({ lean: async () => [] });
  guardPatientLookup();
  const { createCalls, mailCalls } = mockUserCreation();

  const res = makeRes();
  await auth.register(
    makeReq({
      body: {
        name: "Doctor User",
        email: "doctor@unapproved.example",
        password: "Valid1!",
        role: "doctor",
      },
    }),
    res,
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    error: "Use your work email (allowed domain) or an approved email.",
  });
  assert.equal(createCalls.length, 0);
  assert.equal(mailCalls.length, 0);
  assert.equal(res.cookies.length, 0);
});

test("Google professional allowlist rejection keeps precedence and does not query Patient", async () => {
  restoreMethods();
  ProfessionalAllowlist.find = () => ({ lean: async () => [] });
  guardPatientLookup();
  const { createCalls, mailCalls } = mockUserCreation();

  const res = makeRes();
  await auth.googleFinalizeRole(
    makeReq({
      body: { role: "doctor" },
      cookies: { g_pending: makePendingToken("doctor@unapproved.example") },
    }),
    res,
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    error: "Doctor role requires an authorized domain/email",
  });
  assert.equal(createCalls.length, 0);
  assert.equal(mailCalls.length, 0);
  assert.equal(res.cookies.length, 0);
  assert.equal(res.clearedCookies.length, 0);
});

test("existing User duplicate response keeps precedence over Patient reservation", async () => {
  restoreMethods();
  allowProfessionalDomain();
  guardPatientLookup();
  const { createCalls, mailCalls } = mockUserCreation();
  User.findOne = async (query) => {
    assert.deepEqual(query, { email: "duplicate@clinic.example" });
    return makeUser({ email: "duplicate@clinic.example", role: "doctor" });
  };

  const res = makeRes();
  await auth.register(
    makeReq({
      body: {
        name: "Doctor User",
        email: "Duplicate@Clinic.Example",
        password: "Valid1!",
        role: "doctor",
      },
    }),
    res,
  );

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: "User already exists" });
  assert.equal(createCalls.length, 0);
  assert.equal(mailCalls.length, 0);
  assert.equal(res.cookies.length, 0);
});

test("Google-linked User keeps USE_GOOGLE precedence over Patient reservation", async () => {
  restoreMethods();
  allowProfessionalDomain();
  guardPatientLookup();
  const { createCalls, mailCalls } = mockUserCreation();
  User.findOne = async (query) => {
    assert.deepEqual(query, { email: "google-linked@clinic.example" });
    return makeUser({
      email: "google-linked@clinic.example",
      googleId: "google-subject",
      role: "doctor",
    });
  };

  const res = makeRes();
  await auth.register(
    makeReq({
      body: {
        name: "Doctor User",
        email: "Google-Linked@Clinic.Example",
        password: "Valid1!",
        role: "doctor",
      },
    }),
    res,
  );

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { errorCode: "USE_GOOGLE" });
  assert.equal(createCalls.length, 0);
  assert.equal(mailCalls.length, 0);
  assert.equal(res.cookies.length, 0);
});
