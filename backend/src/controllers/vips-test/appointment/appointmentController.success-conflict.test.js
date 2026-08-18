import assert from "node:assert/strict";
import { after, test } from "node:test";

import mongoose from "mongoose";

import Appointment from "../../../models/Appointment.js";
import Notification from "../../../models/Notification.js";
import Patient from "../../../models/Patient.js";
import User from "../../../models/User.js";
import {
  acceptAppointment,
  createAppointment,
} from "../../appointmentController.js";

const originalAppointmentMethods = {
  create: Appointment.create,
  findById: Appointment.findById,
  findOne: Appointment.findOne,
};

const originalNotificationMethods = {
  create: Notification.create,
};

const originalPatientMethods = {
  findOne: Patient.findOne,
};

const originalUserMethods = {
  findOne: User.findOne,
};

const originalTransaction = mongoose.connection.transaction;
const TEST_SESSION = Object.freeze({ id: "appointment-create-test-session" });

const APPOINTMENT_PATIENT_SELECT = "_id email parentEmail minorKey birthDate age dateOfDeath fullname name isDeceased";
const APPOINTMENT_PATIENT_POPULATE_SELECT = "email parentEmail minorKey birthDate age dateOfDeath fullname name isDeceased";
const APPOINTMENT_GUARDIAN_SELECT = "_id isDeceased";

after(() => {
  restoreModelMethods();
  mongoose.connection.transaction = originalTransaction;
});

mongoose.connection.transaction = async (callback) => callback(TEST_SESSION);

function restoreModelMethods() {
  Appointment.create = originalAppointmentMethods.create;
  Appointment.findById = originalAppointmentMethods.findById;
  Appointment.findOne = originalAppointmentMethods.findOne;
  Notification.create = originalNotificationMethods.create;
  Patient.findOne = originalPatientMethods.findOne;
  User.findOne = originalUserMethods.findOne;
}

function makeReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    user: {
      _id: "doctor-id",
      role: "doctor",
      email: "doctor@example.com",
      name: "Dr. Test",
    },
    ...overrides,
  };
}

function makeRes() {
  return {
    body: undefined,
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function makePatient(overrides = {}) {
  return {
    _id: "patient-id",
    email: "Patient@Example.com ",
    parentEmail: undefined,
    fullname: "Patient Owner",
    name: "Patient Owner",
    ...overrides,
  };
}

function makeAppointment(overrides = {}) {
  const appt = {
    _id: "appointment-id",
    doctor: "doctor-id",
    patient: {
      email: "patient@example.com",
      fullname: "Patient Owner",
      name: "Patient Owner",
    },
    start: new Date("2026-06-01T10:00:00.000Z"),
    end: new Date("2026-06-01T10:30:00.000Z"),
    status: "pending",
    save: async () => {},
    ...overrides,
  };

  return appt;
}

function makeQueryResult(response, { onSelect, onLean } = {}) {
  const query = {
    lean() {
      onLean?.();
      return query;
    },
    select(projection) {
      onSelect?.(projection);
      return query;
    },
    session(session) {
      assert.equal(session, TEST_SESSION);
      return query;
    },
    then(resolve, reject) {
      return Promise.resolve(response).then(resolve, reject);
    },
  };

  return query;
}

function mockPatientFindOne(response) {
  const calls = [];

  Patient.findOne = (query) => {
    const call = { query, select: undefined };
    calls.push(call);
    return makeQueryResult(response, {
      onSelect: (projection) => {
        call.select = projection;
      },
    });
  };

  return calls;
}

function mockPatientFindOneSequence(responses) {
  const calls = [];
  let index = 0;

  Patient.findOne = (query) => {
    const response = index < responses.length
      ? responses[index]
      : responses[responses.length - 1];
    const call = { query, select: undefined };
    calls.push(call);
    index += 1;

    return makeQueryResult(response.value, {
      onSelect: (projection) => {
        call.select = projection;
        if (response.projection) assert.equal(projection, response.projection);
      },
    });
  };

  return calls;
}

function mockAppointmentFindOne(response) {
  const calls = [];

  Appointment.findOne = (query) => {
    const call = { query, select: undefined };
    calls.push(call);
    return makeQueryResult(response, {
      onSelect: (projection) => {
        call.select = projection;
      },
    });
  };

  return calls;
}

function mockAppointmentCreate(response) {
  const calls = [];

  Appointment.create = async (payload, options) => {
    assert.deepEqual(options, { session: TEST_SESSION });
    assert.equal(Array.isArray(payload), true);
    assert.equal(payload.length, 1);
    calls.push(payload[0]);
    return [response];
  };

  return calls;
}

function mockAppointmentFindByIdForAccept(response) {
  const calls = [];

  Appointment.findById = (id) => ({
    populate: (path, select) => {
      calls.push({ id, path, select });
      assert.equal(path, "patient");
      assert.equal(select, APPOINTMENT_PATIENT_POPULATE_SELECT);
      return response;
    },
  });

  return calls;
}

function mockUserFindOne(response) {
  const calls = [];

  User.findOne = (query) => {
    const call = { query, select: undefined, lean: false };
    calls.push(call);
    return makeQueryResult(response, {
      onLean: () => {
        call.lean = true;
      },
      onSelect: (projection) => {
        call.select = projection;
      },
    });
  };

  return calls;
}

function mockNotificationCreate() {
  const calls = [];

  Notification.create = async (payload, options) => {
    if (options) {
      assert.deepEqual(options, { session: TEST_SESSION });
      assert.equal(Array.isArray(payload), true);
      assert.equal(payload.length, 1);
      calls.push(payload[0]);
    } else {
      calls.push(payload);
    }
    return payload;
  };

  return calls;
}

function guardAppointmentCreate() {
  Appointment.create = async () => {
    throw new Error("Appointment.create should not be called in rejection paths");
  };
}

function guardAppointmentFindOne() {
  Appointment.findOne = () => {
    throw new Error("Appointment.findOne should not be called in this rejection path");
  };
}

function guardUserFindOne() {
  User.findOne = () => {
    throw new Error("User.findOne should not be called in rejection paths");
  };
}

function guardNotificationCreate() {
  Notification.create = async () => {
    throw new Error("Notification.create should not be called in rejection paths");
  };
}

function makeCreateBody(overrides = {}) {
  return {
    patientId: "patient-id",
    start: "2026-06-01T10:00:00.000Z",
    end: "2026-06-01T10:30:00.000Z",
    reason: "  Follow up  ",
    ...overrides,
  };
}

test("createAppointment rejects overlapping doctor appointment with 409", async () => {
  restoreModelMethods();

  mockPatientFindOne(makePatient());
  const conflictCalls = mockAppointmentFindOne({ _id: "conflict-id" });
  guardAppointmentCreate();
  guardUserFindOne();
  guardNotificationCreate();

  const req = makeReq({ body: makeCreateBody() });
  const res = makeRes();
  const startDate = new Date(req.body.start);
  const endDate = new Date(req.body.end);

  try {
    await createAppointment(req, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, {
      error: "Time range overlaps an existing appointment",
    });
    assert.equal(conflictCalls.length, 1);
    assert.deepEqual(conflictCalls[0], {
      query: {
        status: { $in: ["pending", "accepted"] },
        $or: [{ doctor: "doctor-id" }, { patient: "patient-id" }],
        start: { $lt: endDate },
        end: { $gt: startDate },
      },
      select: "_id",
    });
  } finally {
    restoreModelMethods();
  }
});

test("createAppointment rejects overlapping patient appointment with 409", async () => {
  restoreModelMethods();

  mockPatientFindOne(makePatient());
  const conflictCalls = mockAppointmentFindOne({
    _id: "patient-conflict-id",
    doctor: "other-doctor-id",
    patient: "patient-id",
  });
  guardAppointmentCreate();
  guardUserFindOne();
  guardNotificationCreate();

  const req = makeReq({ body: makeCreateBody() });
  const res = makeRes();
  const startDate = new Date(req.body.start);
  const endDate = new Date(req.body.end);

  try {
    await createAppointment(req, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, {
      error: "Time range overlaps an existing appointment",
    });
    assert.equal(conflictCalls.length, 1);
    assert.deepEqual(conflictCalls[0], {
      query: {
        status: { $in: ["pending", "accepted"] },
        $or: [{ doctor: "doctor-id" }, { patient: "patient-id" }],
        start: { $lt: endDate },
        end: { $gt: startDate },
      },
      select: "_id",
    });
  } finally {
    restoreModelMethods();
  }
});

test("createAppointment overlap ignores inactive lifecycle appointments", async () => {
  restoreModelMethods();

  mockPatientFindOne(makePatient({ email: "" }));
  const conflictCalls = mockAppointmentFindOne(null);
  const appt = makeAppointment({ patient: "patient-id" });
  const createCalls = mockAppointmentCreate(appt);
  User.findOne = () => {
    throw new Error("User.findOne should not be called when patient has no email");
  };
  guardNotificationCreate();

  const req = makeReq({ body: makeCreateBody() });
  const res = makeRes();
  const startDate = new Date(req.body.start);
  const endDate = new Date(req.body.end);

  try {
    await createAppointment(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(createCalls.length, 1);
    assert.deepEqual(conflictCalls, [
      {
        query: {
          status: { $in: ["pending", "accepted"] },
          $or: [{ doctor: "doctor-id" }, { patient: "patient-id" }],
          start: { $lt: endDate },
          end: { $gt: startDate },
        },
        select: "_id",
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("createAppointment creates pending appointment when no conflict", async () => {
  restoreModelMethods();

  mockPatientFindOne(makePatient({ email: "" }));
  const conflictCalls = mockAppointmentFindOne(null);
  const appt = makeAppointment({ patient: "patient-id" });
  const createCalls = mockAppointmentCreate(appt);
  User.findOne = () => {
    throw new Error("User.findOne should not be called when patient has no email");
  };
  guardNotificationCreate();

  const req = makeReq({ body: makeCreateBody() });
  const res = makeRes();

  try {
    await createAppointment(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body, appt);
    assert.equal(conflictCalls.length, 1);
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].doctor, "doctor-id");
    assert.equal(createCalls[0].patient, "patient-id");
    assert.equal(createCalls[0].status, "pending");
    assert.equal(createCalls[0].reason, "Follow up");
    assert.ok(createCalls[0].start instanceof Date);
    assert.ok(createCalls[0].end instanceof Date);
    assert.equal(createCalls[0].start.toISOString(), req.body.start);
    assert.equal(createCalls[0].end.toISOString(), req.body.end);
  } finally {
    restoreModelMethods();
  }
});

test("createAppointment allows alive minor when guardian is alive", async () => {
  restoreModelMethods();

  const patientFindCalls = mockPatientFindOneSequence([
    {
      value: makePatient({
        _id: "minor-patient-id",
        email: "",
        parentEmail: " Parent@Example.com ",
        minorKey: "parent@example.com::minor patient",
        age: 10,
        fullname: "Minor Patient",
      }),
      projection: APPOINTMENT_PATIENT_SELECT,
    },
    {
      value: { _id: "parent-patient-id", isDeceased: false },
      projection: APPOINTMENT_GUARDIAN_SELECT,
    },
  ]);
  const conflictCalls = mockAppointmentFindOne(null);
  const appt = makeAppointment({ patient: "minor-patient-id" });
  const createCalls = mockAppointmentCreate(appt);
  const userFindCalls = mockUserFindOne(null);
  guardNotificationCreate();

  const req = makeReq({
    body: makeCreateBody({ patientId: "minor-patient-id" }),
  });
  const res = makeRes();

  try {
    await createAppointment(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body, appt);
    assert.deepEqual(patientFindCalls, [
      {
        query: {
          _id: "minor-patient-id",
          isDeceased: false,
          $or: [{ createdBy: "doctor-id" }, { owners: "doctor-id" }],
        },
        select: APPOINTMENT_PATIENT_SELECT,
      },
      {
        query: { email: "parent@example.com" },
        select: APPOINTMENT_GUARDIAN_SELECT,
      },
    ]);
    assert.equal(conflictCalls.length, 1);
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].patient, "minor-patient-id");
    assert.deepEqual(userFindCalls, [
      {
        query: { email: "parent@example.com" },
        select: "_id",
        lean: true,
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("createAppointment allows a reassigned minor when the new guardian is alive", async () => {
  restoreModelMethods();

  const patientFindCalls = mockPatientFindOneSequence([
    {
      value: makePatient({
        _id: "minor-patient-id",
        email: "",
        parentEmail: " NewParent@Example.com ",
        minorKey: "newparent@example.com::minor patient",
        age: 10,
        fullname: "Minor Patient",
      }),
      projection: APPOINTMENT_PATIENT_SELECT,
    },
    {
      value: { _id: "new-parent-patient-id", isDeceased: false },
      projection: APPOINTMENT_GUARDIAN_SELECT,
    },
  ]);
  const conflictCalls = mockAppointmentFindOne(null);
  const appt = makeAppointment({ patient: "minor-patient-id" });
  const createCalls = mockAppointmentCreate(appt);
  const userFindCalls = mockUserFindOne(null);
  guardNotificationCreate();

  const req = makeReq({
    body: makeCreateBody({ patientId: "minor-patient-id" }),
  });
  const res = makeRes();

  try {
    await createAppointment(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body, appt);
    assert.deepEqual(patientFindCalls, [
      {
        query: {
          _id: "minor-patient-id",
          isDeceased: false,
          $or: [{ createdBy: "doctor-id" }, { owners: "doctor-id" }],
        },
        select: APPOINTMENT_PATIENT_SELECT,
      },
      {
        query: { email: "newparent@example.com" },
        select: APPOINTMENT_GUARDIAN_SELECT,
      },
    ]);
    assert.equal(conflictCalls.length, 1);
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].patient, "minor-patient-id");
    assert.deepEqual(userFindCalls, [
      {
        query: { email: "newparent@example.com" },
        select: "_id",
        lean: true,
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("createAppointment allows same time for different doctor and different patient", async () => {
  restoreModelMethods();

  mockPatientFindOne(makePatient({ _id: "patient-b-id", email: "" }));
  const conflictCalls = mockAppointmentFindOne(null);
  const appt = makeAppointment({ patient: "patient-b-id" });
  const createCalls = mockAppointmentCreate(appt);
  User.findOne = () => {
    throw new Error("User.findOne should not be called when patient has no email");
  };
  guardNotificationCreate();

  const req = makeReq({
    body: makeCreateBody({ patientId: "patient-b-id" }),
  });
  const res = makeRes();
  const startDate = new Date(req.body.start);
  const endDate = new Date(req.body.end);

  try {
    await createAppointment(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body, appt);
    assert.deepEqual(conflictCalls, [
      {
        query: {
          status: { $in: ["pending", "accepted"] },
          $or: [{ doctor: "doctor-id" }, { patient: "patient-b-id" }],
          start: { $lt: endDate },
          end: { $gt: startDate },
        },
        select: "_id",
      },
    ]);
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].doctor, "doctor-id");
    assert.equal(createCalls[0].patient, "patient-b-id");
  } finally {
    restoreModelMethods();
  }
});

test("createAppointment sends patient notification when patient user exists", async () => {
  restoreModelMethods();

  mockPatientFindOne(makePatient());
  mockAppointmentFindOne(null);
  const appt = makeAppointment({ patient: "patient-id" });
  mockAppointmentCreate(appt);
  const userFindCalls = mockUserFindOne({ _id: "patient-user-id" });
  const notificationCalls = mockNotificationCreate();

  const req = makeReq({ body: makeCreateBody() });
  const res = makeRes();

  try {
    await createAppointment(req, res);

    assert.equal(res.statusCode, 201);
    assert.deepEqual(userFindCalls, [
      {
        query: { email: "patient@example.com" },
        select: "_id",
        lean: true,
      },
    ]);
    assert.equal(notificationCalls.length, 1);
    assert.equal(notificationCalls[0].recipient, "patient-user-id");
    assert.equal(notificationCalls[0].code, "APPT_NEW_appointment-id");
    assert.deepEqual(notificationCalls[0].title, {
      en: "New Appointment Request",
      es: "Nueva Solicitud de Cita",
    });
    assert.equal(
      notificationCalls[0].message.en.includes("Dr. Test scheduled an appointment"),
      true,
    );
    assert.equal(
      notificationCalls[0].message.es.includes("Dr. Test"),
      true,
    );
    assert.equal(
      notificationCalls[0].message.es.includes("Por favor"),
      true,
    );
    assert.equal(notificationCalls[0].relatedAppointment, "appointment-id");
    assert.equal(notificationCalls[0].meta.role, "patient");
  } finally {
    restoreModelMethods();
  }
});

test("createAppointment sends parent notification when minor has parentEmail and no email", async () => {
  restoreModelMethods();

  const minorBirthDate = new Date();
  minorBirthDate.setFullYear(minorBirthDate.getFullYear() - 10);
  mockPatientFindOne(makePatient({
    email: "",
    parentEmail: " Parent@Example.com ",
    birthDate: minorBirthDate,
    fullname: "Minor Patient",
  }));
  mockAppointmentFindOne(null);
  const appt = makeAppointment({ patient: "patient-id" });
  mockAppointmentCreate(appt);
  const userFindCalls = mockUserFindOne({ _id: "parent-user-id" });
  const notificationCalls = mockNotificationCreate();

  const req = makeReq({ body: makeCreateBody() });
  const res = makeRes();

  try {
    await createAppointment(req, res);

    assert.equal(res.statusCode, 201);
    assert.deepEqual(userFindCalls, [
      {
        query: { email: "parent@example.com" },
        select: "_id",
        lean: true,
      },
    ]);
    assert.equal(notificationCalls.length, 1);
    assert.equal(notificationCalls[0].recipient, "parent-user-id");
    assert.equal(notificationCalls[0].code, "APPT_NEW_appointment-id");
    assert.equal(notificationCalls[0].relatedAppointment, "appointment-id");
    assert.equal(notificationCalls[0].meta.role, "patient");
  } finally {
    restoreModelMethods();
  }
});

test("createAppointment does not notify a former guardian for an adult without email", async () => {
  restoreModelMethods();

  const adultBirthDate = new Date();
  adultBirthDate.setFullYear(adultBirthDate.getFullYear() - 20);
  mockPatientFindOne(makePatient({
    email: "",
    parentEmail: "former-guardian@example.com",
    birthDate: adultBirthDate,
    age: 17,
  }));
  mockAppointmentFindOne(null);
  const appt = makeAppointment({ patient: "patient-id" });
  mockAppointmentCreate(appt);
  User.findOne = () => {
    throw new Error("User.findOne should not be called for a former guardian");
  };
  guardNotificationCreate();

  const req = makeReq({ body: makeCreateBody() });
  const res = makeRes();

  try {
    await createAppointment(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body, appt);
  } finally {
    restoreModelMethods();
  }
});

test("createAppointment skips notification when patient has no email or patient user is not found", async () => {
  restoreModelMethods();

  mockPatientFindOne(makePatient({ email: "missing@example.com" }));
  mockAppointmentFindOne(null);
  const appt = makeAppointment({ patient: "patient-id" });
  mockAppointmentCreate(appt);
  const userFindCalls = mockUserFindOne(null);
  guardNotificationCreate();

  const req = makeReq({ body: makeCreateBody() });
  const res = makeRes();

  try {
    await createAppointment(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body, appt);
    assert.deepEqual(userFindCalls, [
      {
        query: { email: "missing@example.com" },
        select: "_id",
        lean: true,
      },
    ]);
  } finally {
    restoreModelMethods();
  }

  restoreModelMethods();

  mockPatientFindOne(makePatient({ email: "" }));
  mockAppointmentFindOne(null);
  mockAppointmentCreate(appt);
  User.findOne = () => {
    throw new Error("User.findOne should not be called when patient has no email");
  };
  guardNotificationCreate();

  const reqWithoutEmail = makeReq({ body: makeCreateBody() });
  const resWithoutEmail = makeRes();

  try {
    await createAppointment(reqWithoutEmail, resWithoutEmail);

    assert.equal(resWithoutEmail.statusCode, 201);
    assert.equal(resWithoutEmail.body, appt);
  } finally {
    restoreModelMethods();
  }
});

test("acceptAppointment rejects non-pending appointment with 400", async () => {
  restoreModelMethods();

  let saveCalled = false;
  const appt = makeAppointment({
    status: "accepted",
    save: async () => {
      saveCalled = true;
      throw new Error("appt.save should not be called for non-pending appointments");
    },
  });
  mockAppointmentFindByIdForAccept(appt);
  guardAppointmentFindOne();
  guardNotificationCreate();

  const req = makeReq({
    params: { id: "appointment-id" },
    user: { _id: "patient-user-id", role: "patient", email: "patient@example.com" },
  });
  const res = makeRes();

  try {
    await acceptAppointment(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: "Appointment is not pending" });
    assert.equal(saveCalled, false);
  } finally {
    restoreModelMethods();
  }
});

test("acceptAppointment rejects accepted-time conflict with 409", async () => {
  restoreModelMethods();

  let saveCalled = false;
  const appt = makeAppointment({
    save: async () => {
      saveCalled = true;
      throw new Error("appt.save should not be called when accept has a conflict");
    },
  });
  mockAppointmentFindByIdForAccept(appt);
  const conflictCalls = mockAppointmentFindOne({ _id: "accepted-conflict-id" });
  guardNotificationCreate();

  const req = makeReq({
    params: { id: "appointment-id" },
    user: { _id: "patient-user-id", role: "patient", email: "patient@example.com" },
  });
  const res = makeRes();

  try {
    await acceptAppointment(req, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, {
      error: "Doctor already has an accepted appointment in that time range",
    });
    assert.equal(saveCalled, false);
    assert.deepEqual(conflictCalls, [
      {
        query: {
          _id: { $ne: "appointment-id" },
          doctor: "doctor-id",
          status: "accepted",
          start: { $lt: appt.end },
          end: { $gt: appt.start },
        },
        select: "_id",
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("acceptAppointment accepts pending appointment when no conflict", async () => {
  restoreModelMethods();

  let saveCalled = false;
  const appt = makeAppointment({
    save: async () => {
      assert.equal(appt.status, "accepted");
      saveCalled = true;
    },
  });
  mockAppointmentFindByIdForAccept(appt);
  const conflictCalls = mockAppointmentFindOne(null);
  const notificationCalls = mockNotificationCreate();

  const req = makeReq({
    params: { id: "appointment-id" },
    user: { _id: "patient-user-id", role: "patient", email: "patient@example.com" },
  });
  const res = makeRes();

  try {
    await acceptAppointment(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body, appt);
    assert.equal(appt.status, "accepted");
    assert.equal(saveCalled, true);
    assert.deepEqual(conflictCalls, [
      {
        query: {
          _id: { $ne: "appointment-id" },
          doctor: "doctor-id",
          status: "accepted",
          start: { $lt: appt.end },
          end: { $gt: appt.start },
        },
        select: "_id",
      },
    ]);
    assert.equal(notificationCalls.length, 1);
  } finally {
    restoreModelMethods();
  }
});

test("acceptAppointment sends doctor notification when accepted", async () => {
  restoreModelMethods();

  const appt = makeAppointment({
    save: async () => {
      assert.equal(appt.status, "accepted");
    },
  });
  mockAppointmentFindByIdForAccept(appt);
  mockAppointmentFindOne(null);
  const notificationCalls = mockNotificationCreate();

  const req = makeReq({
    params: { id: "appointment-id" },
    user: { _id: "patient-user-id", role: "patient", email: "patient@example.com" },
  });
  const res = makeRes();

  try {
    await acceptAppointment(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(notificationCalls.length, 1);
    assert.equal(notificationCalls[0].recipient, "doctor-id");
    assert.equal(notificationCalls[0].code, "APPT_ACCEPTED_appointment-id");
    assert.equal(notificationCalls[0].relatedAppointment, "appointment-id");
    assert.equal(notificationCalls[0].meta.role, "doctor");
  } finally {
    restoreModelMethods();
  }
});
