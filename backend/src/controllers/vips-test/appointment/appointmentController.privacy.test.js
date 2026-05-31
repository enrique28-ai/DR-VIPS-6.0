import assert from "node:assert/strict";
import { after, test } from "node:test";

import Appointment from "../../../models/Appointment.js";
import Notification from "../../../models/Notification.js";
import Patient from "../../../models/Patient.js";
import {
  acceptAppointment,
  createAppointment,
  deleteAppointment,
  getAppointments,
} from "../../appointmentController.js";

const originalAppointmentMethods = {
  create: Appointment.create,
  find: Appointment.find,
  findById: Appointment.findById,
  findOne: Appointment.findOne,
};

const originalNotificationMethods = {
  create: Notification.create,
};

const originalPatientMethods = {
  find: Patient.find,
  findOne: Patient.findOne,
};

const APPOINTMENT_PATIENT_SELECT = "_id email parentEmail minorKey age fullname name isDeceased";
const APPOINTMENT_PATIENT_POPULATE_SELECT = "email parentEmail minorKey age fullname name isDeceased";
const APPOINTMENT_PATIENT_LIST_POPULATE_SELECT = "fullname email parentEmail minorKey age name isDeceased";
const APPOINTMENT_GUARDIAN_SELECT = "_id isDeceased";

after(() => {
  restoreModelMethods();
});

function restoreModelMethods() {
  Appointment.create = originalAppointmentMethods.create;
  Appointment.find = originalAppointmentMethods.find;
  Appointment.findById = originalAppointmentMethods.findById;
  Appointment.findOne = originalAppointmentMethods.findOne;
  Notification.create = originalNotificationMethods.create;
  Patient.find = originalPatientMethods.find;
  Patient.findOne = originalPatientMethods.findOne;
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

function guardAppointmentCreate() {
  Appointment.create = async () => {
    throw new Error("Appointment.create should not be called in rejection paths");
  };
}

function guardNotificationCreate() {
  Notification.create = async () => {
    throw new Error("Notification.create should not be called in rejection paths");
  };
}

function guardAppointmentFindOne() {
  Appointment.findOne = () => {
    throw new Error("Appointment.findOne should not be called in this rejection path");
  };
}

function mockPatientFindOne(response, expectedProjection = APPOINTMENT_PATIENT_SELECT) {
  const calls = [];

  Patient.findOne = (query) => {
    const call = { query, select: undefined };
    calls.push(call);
    return {
      select: (projection) => {
        call.select = projection;
        assert.equal(projection, expectedProjection);
        return response;
      },
    };
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
    const value = response && Object.hasOwn(response, "value") ? response.value : response;
    const expectedProjection =
      response && Object.hasOwn(response, "projection")
        ? response.projection
        : APPOINTMENT_PATIENT_SELECT;
    const call = { query, select: undefined };
    calls.push(call);
    index += 1;

    return {
      select: (projection) => {
        call.select = projection;
        assert.equal(projection, expectedProjection);
        return value;
      },
    };
  };

  return calls;
}

function mockPatientFind(response) {
  const calls = [];

  Patient.find = (query) => {
    const call = { query, select: undefined };
    calls.push(call);
    return {
      select: (projection) => {
        call.select = projection;
        return response;
      },
    };
  };

  return calls;
}

function mockAppointmentFind(response) {
  const calls = [];

  Appointment.find = (query) => {
    const call = { query, populate: [], sort: undefined };
    calls.push(call);
    const chain = {
      populate: (path, select) => {
        call.populate.push({ path, select });
        return chain;
      },
      sort: (sort) => {
        call.sort = sort;
        return response;
      },
    };
    return chain;
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

function mockAppointmentFindByIdForDelete(response) {
  const calls = [];

  Appointment.findById = (id) => ({
    populate: (firstPath, firstSelect) => {
      calls.push({ id, path: firstPath, select: firstSelect });
      assert.equal(firstPath, "patient");
      assert.equal(firstSelect, APPOINTMENT_PATIENT_POPULATE_SELECT);
      return {
        populate: (secondPath, secondSelect) => {
          calls.push({ id, path: secondPath, select: secondSelect });
          assert.equal(secondPath, "doctor");
          assert.equal(secondSelect, "name  email");
          return response;
        },
      };
    },
  });

  return calls;
}

function mockAppointmentFindOne(response) {
  const calls = [];

  Appointment.findOne = (query) => {
    const call = { query, select: undefined };
    calls.push(call);
    return {
      select: (projection) => {
        call.select = projection;
        return response;
      },
    };
  };

  return calls;
}

function mockNotificationCreate() {
  const calls = [];

  Notification.create = async (payload) => {
    calls.push(payload);
    return payload;
  };

  return calls;
}

test("getAppointments excludes deceased adult patient appointments for doctors", async () => {
  restoreModelMethods();

  Patient.find = () => {
    throw new Error("Patient.find should not be called for doctor appointment reads");
  };

  const aliveAppt = {
    _id: "alive-adult-appointment-id",
    patient: { _id: "adult-patient-id", isDeceased: false },
  };
  const deceasedAppt = {
    _id: "deceased-adult-appointment-id",
    patient: { _id: "deceased-patient-id", isDeceased: true },
  };
  const appointmentFindCalls = mockAppointmentFind([aliveAppt, deceasedAppt]);
  const req = makeReq({
    user: {
      _id: "doctor-id",
      role: "doctor",
      email: "doctor@example.com",
    },
  });
  const res = makeRes();

  try {
    await getAppointments(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, [aliveAppt]);
    assert.deepEqual(appointmentFindCalls, [
      {
        query: { doctor: "doctor-id" },
        populate: [
          { path: "patient", select: APPOINTMENT_PATIENT_LIST_POPULATE_SELECT },
          { path: "doctor", select: "name  email" },
        ],
        sort: { start: 1 },
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("getAppointments includes child appointments for parent by parentEmail", async () => {
  restoreModelMethods();

  const appts = [
    {
      _id: "child-appointment-id",
      patient: { _id: "child-patient-id", isDeceased: false },
    },
  ];
  const patientFindCalls = mockPatientFind([
    { _id: "parent-patient-id" },
    { _id: "child-patient-id" },
  ]);
  const guardianFindCalls = mockPatientFindOne(
    { _id: "parent-patient-id", isDeceased: false },
    APPOINTMENT_GUARDIAN_SELECT
  );
  const appointmentFindCalls = mockAppointmentFind(appts);
  const req = makeReq({
    user: {
      _id: "parent-user-id",
      role: "patient",
      email: " Parent@Example.com ",
    },
  });
  const res = makeRes();

  try {
    await getAppointments(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, appts);
    assert.deepEqual(guardianFindCalls, [
      {
        query: { email: "parent@example.com" },
        select: APPOINTMENT_GUARDIAN_SELECT,
      },
    ]);
    assert.deepEqual(patientFindCalls, [
      {
        query: {
          isDeceased: { $ne: true },
          $or: [
            { email: "parent@example.com" },
            { parentEmail: "parent@example.com" },
          ],
        },
        select: "_id",
      },
    ]);
    assert.deepEqual(appointmentFindCalls, [
      {
        query: {
          patient: { $in: ["parent-patient-id", "child-patient-id"] },
        },
        populate: [
          { path: "patient", select: APPOINTMENT_PATIENT_LIST_POPULATE_SELECT },
          { path: "doctor", select: "name  email" },
        ],
        sort: { start: 1 },
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("getAppointments excludes deceased child appointments for parent tutor", async () => {
  restoreModelMethods();

  const aliveChildAppt = {
    _id: "alive-child-appointment-id",
    patient: {
      _id: "alive-child-patient-id",
      parentEmail: "parent@example.com",
      isDeceased: false,
    },
  };
  const deceasedChildAppt = {
    _id: "deceased-child-appointment-id",
    patient: {
      _id: "deceased-child-patient-id",
      parentEmail: "parent@example.com",
      isDeceased: true,
    },
  };
  const patientFindCalls = mockPatientFind([{ _id: "alive-child-patient-id" }]);
  const guardianFindCalls = mockPatientFindOne(
    { _id: "parent-patient-id", isDeceased: false },
    APPOINTMENT_GUARDIAN_SELECT
  );
  const appointmentFindCalls = mockAppointmentFind([aliveChildAppt, deceasedChildAppt]);
  const req = makeReq({
    user: {
      _id: "parent-user-id",
      role: "patient",
      email: " Parent@Example.com ",
    },
  });
  const res = makeRes();

  try {
    await getAppointments(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, [aliveChildAppt]);
    assert.deepEqual(guardianFindCalls, [
      {
        query: { email: "parent@example.com" },
        select: APPOINTMENT_GUARDIAN_SELECT,
      },
    ]);
    assert.deepEqual(patientFindCalls, [
      {
        query: {
          isDeceased: { $ne: true },
          $or: [
            { email: "parent@example.com" },
            { parentEmail: "parent@example.com" },
          ],
        },
        select: "_id",
      },
    ]);
    assert.deepEqual(appointmentFindCalls, [
      {
        query: {
          patient: { $in: ["alive-child-patient-id"] },
        },
        populate: [
          { path: "patient", select: APPOINTMENT_PATIENT_LIST_POPULATE_SELECT },
          { path: "doctor", select: "name  email" },
        ],
        sort: { start: 1 },
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("getAppointments does not return child appointments to a deceased guardian", async () => {
  restoreModelMethods();

  const guardianFindCalls = mockPatientFindOne(
    { _id: "parent-patient-id", isDeceased: true },
    APPOINTMENT_GUARDIAN_SELECT
  );
  const patientFindCalls = mockPatientFind([]);
  const appointmentFindCalls = mockAppointmentFind([]);
  const req = makeReq({
    user: {
      _id: "parent-user-id",
      role: "patient",
      email: " Parent@Example.com ",
    },
  });
  const res = makeRes();

  try {
    await getAppointments(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, []);
    assert.deepEqual(guardianFindCalls, [
      {
        query: { email: "parent@example.com" },
        select: APPOINTMENT_GUARDIAN_SELECT,
      },
    ]);
    assert.deepEqual(patientFindCalls, [
      {
        query: {
          isDeceased: { $ne: true },
          $or: [{ email: "parent@example.com" }],
        },
        select: "_id",
      },
    ]);
    assert.deepEqual(appointmentFindCalls, [
      {
        query: {
          patient: { $in: [] },
        },
        populate: [
          { path: "patient", select: APPOINTMENT_PATIENT_LIST_POPULATE_SELECT },
          { path: "doctor", select: "name  email" },
        ],
        sort: { start: 1 },
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("createAppointment rejects invalid dates with 400", async () => {
  restoreModelMethods();
  guardAppointmentCreate();
  guardNotificationCreate();

  const req = makeReq({
    body: {
      patientId: "patient-id",
      start: "not-a-date",
      end: "2026-06-01T10:30:00.000Z",
    },
  });
  const res = makeRes();

  try {
    await createAppointment(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: "Invalid dates" });
  } finally {
    restoreModelMethods();
  }
});

test("createAppointment rejects end before or equal to start with 400", async () => {
  restoreModelMethods();
  guardAppointmentCreate();
  guardNotificationCreate();

  const req = makeReq({
    body: {
      patientId: "patient-id",
      start: "2026-06-01T10:30:00.000Z",
      end: "2026-06-01T10:30:00.000Z",
    },
  });
  const res = makeRes();

  try {
    await createAppointment(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: "End must be after start" });
  } finally {
    restoreModelMethods();
  }
});

test("createAppointment rejects when doctor does not own the patient with 404", async () => {
  restoreModelMethods();
  guardAppointmentCreate();
  guardNotificationCreate();

  const findOneCalls = mockPatientFindOne(null);
  const req = makeReq({
    body: {
      patientId: "patient-id",
      start: "2026-06-01T10:00:00.000Z",
      end: "2026-06-01T10:30:00.000Z",
    },
  });
  const res = makeRes();

  try {
    await createAppointment(req, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: "Patient not found or is deceased" });
    assert.deepEqual(findOneCalls, [
      {
        query: {
          _id: "patient-id",
          isDeceased: false,
          $or: [{ createdBy: "doctor-id" }, { owners: "doctor-id" }],
        },
        select: APPOINTMENT_PATIENT_SELECT,
      },
      {
        query: {
          _id: "patient-id",
          isDeceased: true,
          $or: [{ createdBy: "doctor-id" }, { owners: "doctor-id" }],
        },
        select: APPOINTMENT_PATIENT_SELECT,
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("createAppointment rejects deceased adult patient with stable errorCode", async () => {
  restoreModelMethods();
  guardAppointmentCreate();
  guardNotificationCreate();
  guardAppointmentFindOne();

  const findOneCalls = mockPatientFindOneSequence([
    null,
    {
      _id: "deceased-patient-id",
      email: "patient@example.com",
      fullname: "Patient Owner",
    },
  ]);
  const req = makeReq({
    body: {
      patientId: "deceased-patient-id",
      start: "2026-06-01T10:00:00.000Z",
      end: "2026-06-01T10:30:00.000Z",
    },
  });
  const res = makeRes();

  try {
    await createAppointment(req, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, {
      error: "Patient not found or is deceased",
      errorCode: "APPOINTMENT_PATIENT_DECEASED",
    });
    assert.deepEqual(findOneCalls, [
      {
        query: {
          _id: "deceased-patient-id",
          isDeceased: false,
          $or: [{ createdBy: "doctor-id" }, { owners: "doctor-id" }],
        },
        select: APPOINTMENT_PATIENT_SELECT,
      },
      {
        query: {
          _id: "deceased-patient-id",
          isDeceased: true,
          $or: [{ createdBy: "doctor-id" }, { owners: "doctor-id" }],
        },
        select: APPOINTMENT_PATIENT_SELECT,
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("createAppointment rejects deceased minor patient with stable errorCode", async () => {
  restoreModelMethods();
  guardAppointmentCreate();
  guardNotificationCreate();
  guardAppointmentFindOne();

  const findOneCalls = mockPatientFindOneSequence([
    null,
    {
      _id: "deceased-minor-patient-id",
      email: "",
      parentEmail: "parent@example.com",
      fullname: "Minor Patient",
    },
  ]);
  const req = makeReq({
    body: {
      patientId: "deceased-minor-patient-id",
      start: "2026-06-01T10:00:00.000Z",
      end: "2026-06-01T10:30:00.000Z",
    },
  });
  const res = makeRes();

  try {
    await createAppointment(req, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, {
      error: "Patient not found or is deceased",
      errorCode: "APPOINTMENT_PATIENT_DECEASED",
    });
    assert.deepEqual(findOneCalls, [
      {
        query: {
          _id: "deceased-minor-patient-id",
          isDeceased: false,
          $or: [{ createdBy: "doctor-id" }, { owners: "doctor-id" }],
        },
        select: APPOINTMENT_PATIENT_SELECT,
      },
      {
        query: {
          _id: "deceased-minor-patient-id",
          isDeceased: true,
          $or: [{ createdBy: "doctor-id" }, { owners: "doctor-id" }],
        },
        select: APPOINTMENT_PATIENT_SELECT,
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("createAppointment rejects alive minor when guardian is deceased", async () => {
  restoreModelMethods();
  guardAppointmentCreate();
  guardNotificationCreate();
  guardAppointmentFindOne();

  const findOneCalls = mockPatientFindOneSequence([
    {
      value: {
        _id: "alive-minor-patient-id",
        email: "",
        parentEmail: " Parent@Example.com ",
        minorKey: "parent@example.com::minor patient",
        age: 10,
        fullname: "Minor Patient",
      },
      projection: APPOINTMENT_PATIENT_SELECT,
    },
    {
      value: { _id: "parent-patient-id", isDeceased: true },
      projection: APPOINTMENT_GUARDIAN_SELECT,
    },
  ]);
  const req = makeReq({
    body: {
      patientId: "alive-minor-patient-id",
      start: "2026-06-01T10:00:00.000Z",
      end: "2026-06-01T10:30:00.000Z",
    },
  });
  const res = makeRes();

  try {
    await createAppointment(req, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, {
      error:
        "The guardian is unavailable. Assign a new guardian before scheduling appointments for this minor.",
      errorCode: "APPOINTMENT_GUARDIAN_UNAVAILABLE",
    });
    assert.deepEqual(findOneCalls, [
      {
        query: {
          _id: "alive-minor-patient-id",
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
  } finally {
    restoreModelMethods();
  }
});

test("createAppointment rejects alive minor when guardian is missing", async () => {
  restoreModelMethods();
  guardAppointmentCreate();
  guardNotificationCreate();
  guardAppointmentFindOne();

  const findOneCalls = mockPatientFindOneSequence([
    {
      value: {
        _id: "alive-minor-patient-id",
        email: "",
        parentEmail: " Parent@Example.com ",
        minorKey: "parent@example.com::minor patient",
        age: 10,
        fullname: "Minor Patient",
      },
      projection: APPOINTMENT_PATIENT_SELECT,
    },
    {
      value: null,
      projection: APPOINTMENT_GUARDIAN_SELECT,
    },
  ]);
  const req = makeReq({
    body: {
      patientId: "alive-minor-patient-id",
      start: "2026-06-01T10:00:00.000Z",
      end: "2026-06-01T10:30:00.000Z",
    },
  });
  const res = makeRes();

  try {
    await createAppointment(req, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, {
      error:
        "The guardian is unavailable. Assign a new guardian before scheduling appointments for this minor.",
      errorCode: "APPOINTMENT_GUARDIAN_UNAVAILABLE",
    });
    assert.deepEqual(findOneCalls, [
      {
        query: {
          _id: "alive-minor-patient-id",
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
  } finally {
    restoreModelMethods();
  }
});

test("acceptAppointment rejects when appointment does not exist with 404", async () => {
  restoreModelMethods();
  guardNotificationCreate();

  const findByIdCalls = mockAppointmentFindByIdForAccept(null);
  const req = makeReq({
    params: { id: "missing-appointment-id" },
    user: { _id: "patient-user-id", role: "patient", email: "patient@example.com" },
  });
  const res = makeRes();

  try {
    await acceptAppointment(req, res);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: "Not found" });
    assert.deepEqual(findByIdCalls, [
      {
        id: "missing-appointment-id",
        path: "patient",
        select: APPOINTMENT_PATIENT_POPULATE_SELECT,
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("acceptAppointment rejects patient email mismatch with 403", async () => {
  restoreModelMethods();
  guardAppointmentFindOne();
  guardNotificationCreate();

  let saveCalled = false;
  const appt = {
    _id: "appointment-id",
    doctor: "doctor-id",
    patient: { email: "other@example.com", fullname: "Other Patient" },
    status: "pending",
    save: async () => {
      saveCalled = true;
      throw new Error("appt.save should not be called in rejection paths");
    },
  };
  mockAppointmentFindByIdForAccept(appt);

  const req = makeReq({
    params: { id: "appointment-id" },
    user: { _id: "patient-user-id", role: "patient", email: "patient@example.com" },
  });
  const res = makeRes();

  try {
    await acceptAppointment(req, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Unauthorized" });
    assert.equal(saveCalled, false);
  } finally {
    restoreModelMethods();
  }
});

test("acceptAppointment blocks deceased patient appointment with 409", async () => {
  restoreModelMethods();
  guardAppointmentFindOne();
  guardNotificationCreate();

  let saveCalled = false;
  const appt = {
    _id: "appointment-id",
    doctor: "doctor-id",
    patient: {
      email: "patient@example.com",
      fullname: "Patient Owner",
      isDeceased: true,
    },
    status: "pending",
    save: async () => {
      saveCalled = true;
      throw new Error("appt.save should not be called for deceased patients");
    },
  };
  mockAppointmentFindByIdForAccept(appt);

  const req = makeReq({
    params: { id: "appointment-id" },
    user: { _id: "patient-user-id", role: "patient", email: "patient@example.com" },
  });
  const res = makeRes();

  try {
    await acceptAppointment(req, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, {
      error: "Cannot manage appointments for a deceased patient.",
      errorCode: "APPOINTMENT_PATIENT_DECEASED",
    });
    assert.equal(saveCalled, false);
  } finally {
    restoreModelMethods();
  }
});

test("acceptAppointment allows parent tutor for child appointment", async () => {
  restoreModelMethods();

  let saveCalled = false;
  const appt = {
    _id: "appointment-id",
    doctor: "doctor-id",
    patient: {
      email: "",
      parentEmail: "Parent@Example.com ",
      fullname: "Minor Patient",
    },
    status: "pending",
    start: new Date("2026-06-01T10:00:00.000Z"),
    end: new Date("2026-06-01T10:30:00.000Z"),
    save: async () => {
      assert.equal(appt.status, "accepted");
      saveCalled = true;
    },
  };
  mockAppointmentFindByIdForAccept(appt);
  const guardianFindCalls = mockPatientFindOne(
    { _id: "parent-patient-id", isDeceased: false },
    APPOINTMENT_GUARDIAN_SELECT
  );
  const conflictCalls = mockAppointmentFindOne(null);
  const notificationCalls = mockNotificationCreate();

  const req = makeReq({
    params: { id: "appointment-id" },
    user: { _id: "parent-user-id", role: "patient", email: " parent@example.com " },
  });
  const res = makeRes();

  try {
    await acceptAppointment(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body, appt);
    assert.equal(appt.status, "accepted");
    assert.equal(saveCalled, true);
    assert.deepEqual(guardianFindCalls, [
      {
        query: { email: "parent@example.com" },
        select: APPOINTMENT_GUARDIAN_SELECT,
      },
    ]);
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
    assert.equal(notificationCalls[0].recipient, "doctor-id");
    assert.equal(notificationCalls[0].meta.role, "doctor");
    assert.equal(notificationCalls[0].message.en.includes("Minor Patient"), true);
  } finally {
    restoreModelMethods();
  }
});

test("acceptAppointment blocks deceased guardian from managing child appointment", async () => {
  restoreModelMethods();
  guardAppointmentFindOne();
  guardNotificationCreate();

  let saveCalled = false;
  const appt = {
    _id: "appointment-id",
    doctor: "doctor-id",
    patient: {
      email: "",
      parentEmail: "Parent@Example.com ",
      fullname: "Minor Patient",
      isDeceased: false,
    },
    status: "pending",
    save: async () => {
      saveCalled = true;
      throw new Error("appt.save should not be called when guardian is unavailable");
    },
  };
  mockAppointmentFindByIdForAccept(appt);
  const guardianFindCalls = mockPatientFindOne(
    { _id: "parent-patient-id", isDeceased: true },
    APPOINTMENT_GUARDIAN_SELECT
  );

  const req = makeReq({
    params: { id: "appointment-id" },
    user: { _id: "parent-user-id", role: "patient", email: " parent@example.com " },
  });
  const res = makeRes();

  try {
    await acceptAppointment(req, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, {
      error:
        "The guardian is unavailable. Assign a new guardian before scheduling appointments for this minor.",
      errorCode: "APPOINTMENT_GUARDIAN_UNAVAILABLE",
    });
    assert.deepEqual(guardianFindCalls, [
      {
        query: { email: "parent@example.com" },
        select: APPOINTMENT_GUARDIAN_SELECT,
      },
    ]);
    assert.equal(saveCalled, false);
  } finally {
    restoreModelMethods();
  }
});

test("acceptAppointment rejects unrelated parent for child appointment with 403", async () => {
  restoreModelMethods();
  guardAppointmentFindOne();
  guardNotificationCreate();

  let saveCalled = false;
  const appt = {
    _id: "appointment-id",
    doctor: "doctor-id",
    patient: {
      email: "",
      parentEmail: "parent@example.com",
      fullname: "Minor Patient",
    },
    status: "pending",
    save: async () => {
      saveCalled = true;
      throw new Error("appt.save should not be called in rejection paths");
    },
  };
  mockAppointmentFindByIdForAccept(appt);

  const req = makeReq({
    params: { id: "appointment-id" },
    user: { _id: "other-user-id", role: "patient", email: "other@example.com" },
  });
  const res = makeRes();

  try {
    await acceptAppointment(req, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Unauthorized" });
    assert.equal(saveCalled, false);
  } finally {
    restoreModelMethods();
  }
});

test("deleteAppointment rejects when requester is neither doctor nor patient owner with 403", async () => {
  restoreModelMethods();
  guardNotificationCreate();

  let deleteCalled = false;
  const appt = {
    _id: "appointment-id",
    doctor: { _id: "doctor-id", name: "Dr. Owner", email: "doctor@example.com" },
    patient: { email: "patient@example.com", fullname: "Patient Owner" },
    status: "pending",
    start: new Date("2026-06-01T10:00:00.000Z"),
    deleteOne: async () => {
      deleteCalled = true;
      throw new Error("appt.deleteOne should not be called in rejection paths");
    },
  };
  mockAppointmentFindByIdForDelete(appt);

  const req = makeReq({
    params: { id: "appointment-id" },
    user: {
      _id: "other-doctor-id",
      role: "doctor",
      email: "other@example.com",
    },
  });
  const res = makeRes();

  try {
    await deleteAppointment(req, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Unauthorized" });
    assert.equal(deleteCalled, false);
  } finally {
    restoreModelMethods();
  }
});

test("deleteAppointment blocks parent tutor from deleting deceased child appointment", async () => {
  restoreModelMethods();
  guardNotificationCreate();

  let deleteCalled = false;
  const appt = {
    _id: "appointment-id",
    doctor: { _id: "doctor-id", name: "Dr. Owner", email: "doctor@example.com" },
    patient: {
      email: "",
      parentEmail: "Parent@Example.com ",
      fullname: "Minor Patient",
      isDeceased: true,
    },
    status: "pending",
    start: new Date("2026-06-01T10:00:00.000Z"),
    deleteOne: async () => {
      deleteCalled = true;
      throw new Error("appt.deleteOne should not be called for deceased patient tutor actions");
    },
  };
  mockAppointmentFindByIdForDelete(appt);

  const req = makeReq({
    params: { id: "appointment-id" },
    user: {
      _id: "parent-user-id",
      role: "patient",
      email: "parent@example.com",
    },
  });
  const res = makeRes();

  try {
    await deleteAppointment(req, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, {
      error: "Cannot manage appointments for a deceased patient.",
      errorCode: "APPOINTMENT_PATIENT_DECEASED",
    });
    assert.equal(deleteCalled, false);
  } finally {
    restoreModelMethods();
  }
});

test("deleteAppointment blocks patient owner from deleting deceased adult appointment", async () => {
  restoreModelMethods();
  guardNotificationCreate();

  let deleteCalled = false;
  const appt = {
    _id: "appointment-id",
    doctor: { _id: "doctor-id", name: "Dr. Owner", email: "doctor@example.com" },
    patient: {
      email: "Patient@Example.com ",
      fullname: "Patient Owner",
      isDeceased: true,
    },
    status: "accepted",
    start: new Date("2026-06-01T10:00:00.000Z"),
    deleteOne: async () => {
      deleteCalled = true;
      throw new Error("appt.deleteOne should not be called for deceased patient owner actions");
    },
  };
  mockAppointmentFindByIdForDelete(appt);

  const req = makeReq({
    params: { id: "appointment-id" },
    user: {
      _id: "patient-user-id",
      role: "patient",
      email: "patient@example.com",
    },
  });
  const res = makeRes();

  try {
    await deleteAppointment(req, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, {
      error: "Cannot manage appointments for a deceased patient.",
      errorCode: "APPOINTMENT_PATIENT_DECEASED",
    });
    assert.equal(deleteCalled, false);
  } finally {
    restoreModelMethods();
  }
});

test("deleteAppointment allows doctor owner to delete minor appointment when guardian is deceased", async () => {
  restoreModelMethods();
  guardNotificationCreate();

  let deleteCalled = false;
  const appt = {
    _id: "appointment-id",
    doctor: { _id: "doctor-id", name: "Dr. Owner", email: "doctor@example.com" },
    patient: {
      email: "",
      parentEmail: "Parent@Example.com ",
      fullname: "Minor Patient",
      isDeceased: false,
    },
    status: "accepted",
    start: new Date("2026-06-01T10:00:00.000Z"),
    deleteOne: async () => {
      deleteCalled = true;
    },
  };
  mockAppointmentFindByIdForDelete(appt);
  Patient.findOne = () => {
    throw new Error("Patient.findOne should not be called for doctor cleanup");
  };

  const req = makeReq({
    params: { id: "appointment-id" },
    user: {
      _id: "doctor-id",
      role: "doctor",
      email: "doctor@example.com",
    },
  });
  const res = makeRes();

  try {
    await deleteAppointment(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { message: "Appointment deleted" });
    assert.equal(deleteCalled, true);
  } finally {
    restoreModelMethods();
  }
});

test("deleteAppointment blocks deceased guardian from managing child appointment", async () => {
  restoreModelMethods();
  guardNotificationCreate();

  let deleteCalled = false;
  const appt = {
    _id: "appointment-id",
    doctor: { _id: "doctor-id", name: "Dr. Owner", email: "doctor@example.com" },
    patient: {
      email: "",
      parentEmail: "Parent@Example.com ",
      fullname: "Minor Patient",
      isDeceased: false,
    },
    status: "accepted",
    start: new Date("2026-06-01T10:00:00.000Z"),
    deleteOne: async () => {
      deleteCalled = true;
      throw new Error("appt.deleteOne should not be called when guardian is unavailable");
    },
  };
  mockAppointmentFindByIdForDelete(appt);
  const guardianFindCalls = mockPatientFindOne(
    { _id: "parent-patient-id", isDeceased: true },
    APPOINTMENT_GUARDIAN_SELECT
  );

  const req = makeReq({
    params: { id: "appointment-id" },
    user: {
      _id: "parent-user-id",
      role: "patient",
      email: "parent@example.com",
    },
  });
  const res = makeRes();

  try {
    await deleteAppointment(req, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, {
      error:
        "The guardian is unavailable. Assign a new guardian before scheduling appointments for this minor.",
      errorCode: "APPOINTMENT_GUARDIAN_UNAVAILABLE",
    });
    assert.deepEqual(guardianFindCalls, [
      {
        query: { email: "parent@example.com" },
        select: APPOINTMENT_GUARDIAN_SELECT,
      },
    ]);
    assert.equal(deleteCalled, false);
  } finally {
    restoreModelMethods();
  }
});

test("deleteAppointment allows parent tutor to decline child appointment", async () => {
  restoreModelMethods();

  let deleteCalled = false;
  const appt = {
    _id: "appointment-id",
    doctor: { _id: "doctor-id", name: "Dr. Owner", email: "doctor@example.com" },
    patient: {
      email: "",
      parentEmail: "Parent@Example.com ",
      fullname: "Minor Patient",
    },
    status: "pending",
    start: new Date("2026-06-01T10:00:00.000Z"),
    deleteOne: async () => {
      deleteCalled = true;
    },
  };
  mockAppointmentFindByIdForDelete(appt);
  const guardianFindCalls = mockPatientFindOne(
    { _id: "parent-patient-id", isDeceased: false },
    APPOINTMENT_GUARDIAN_SELECT
  );
  const notificationCalls = mockNotificationCreate();

  const req = makeReq({
    params: { id: "appointment-id" },
    user: {
      _id: "parent-user-id",
      role: "patient",
      email: "parent@example.com",
    },
  });
  const res = makeRes();

  try {
    await deleteAppointment(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { message: "Appointment deleted" });
    assert.deepEqual(guardianFindCalls, [
      {
        query: { email: "parent@example.com" },
        select: APPOINTMENT_GUARDIAN_SELECT,
      },
    ]);
    assert.equal(deleteCalled, true);
    assert.equal(notificationCalls.length, 1);
    assert.equal(notificationCalls[0].recipient, "doctor-id");
    assert.equal(notificationCalls[0].title.en, "Appointment Declined");
    assert.equal(notificationCalls[0].meta.role, "doctor");
    assert.equal(notificationCalls[0].meta.patientName, "Minor Patient");
    assert.equal(notificationCalls[0].message.en.includes("Minor Patient"), true);
  } finally {
    restoreModelMethods();
  }
});

test("deleteAppointment allows parent tutor to cancel accepted child appointment", async () => {
  restoreModelMethods();

  let deleteCalled = false;
  const appt = {
    _id: "appointment-id",
    doctor: { _id: "doctor-id", name: "Dr. Owner", email: "doctor@example.com" },
    patient: {
      email: "",
      parentEmail: "Parent@Example.com ",
      fullname: "Minor Patient",
    },
    status: "accepted",
    start: new Date("2026-06-01T10:00:00.000Z"),
    deleteOne: async () => {
      deleteCalled = true;
    },
  };
  mockAppointmentFindByIdForDelete(appt);
  const guardianFindCalls = mockPatientFindOne(
    { _id: "parent-patient-id", isDeceased: false },
    APPOINTMENT_GUARDIAN_SELECT
  );
  const notificationCalls = mockNotificationCreate();

  const req = makeReq({
    params: { id: "appointment-id" },
    user: {
      _id: "parent-user-id",
      role: "patient",
      email: "parent@example.com",
    },
  });
  const res = makeRes();

  try {
    await deleteAppointment(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { message: "Appointment deleted" });
    assert.deepEqual(guardianFindCalls, [
      {
        query: { email: "parent@example.com" },
        select: APPOINTMENT_GUARDIAN_SELECT,
      },
    ]);
    assert.equal(deleteCalled, true);
    assert.equal(notificationCalls.length, 1);
    assert.equal(notificationCalls[0].recipient, "doctor-id");
    assert.equal(notificationCalls[0].title.en, "Appointment Cancelled");
    assert.equal(notificationCalls[0].meta.role, "doctor");
    assert.equal(notificationCalls[0].meta.patientName, "Minor Patient");
    assert.equal(notificationCalls[0].message.en.includes("Minor Patient"), true);
    assert.equal(notificationCalls[0].message.en.includes("cancelled"), true);
  } finally {
    restoreModelMethods();
  }
});
