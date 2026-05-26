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

function mockPatientFindOne(response) {
  const calls = [];

  Patient.findOne = (query) => {
    calls.push(query);
    return {
      select: (projection) => {
        assert.equal(projection, "_id email parentEmail fullname name");
        return response;
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
      assert.equal(select, "email parentEmail fullname name isDeceased");
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
      assert.equal(firstSelect, "email parentEmail fullname name isDeceased");
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
          { path: "patient", select: "fullname email parentEmail name isDeceased" },
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
          { path: "patient", select: "fullname email parentEmail name isDeceased" },
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
          { path: "patient", select: "fullname email parentEmail name isDeceased" },
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
        _id: "patient-id",
        isDeceased: false,
        $or: [{ createdBy: "doctor-id" }, { owners: "doctor-id" }],
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("createAppointment rejects deceased patient by requiring an alive patient", async () => {
  restoreModelMethods();
  guardAppointmentCreate();
  guardNotificationCreate();
  guardAppointmentFindOne();

  const findOneCalls = mockPatientFindOne(null);
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
    assert.deepEqual(res.body, { error: "Patient not found or is deceased" });
    assert.deepEqual(findOneCalls, [
      {
        _id: "deceased-patient-id",
        isDeceased: false,
        $or: [{ createdBy: "doctor-id" }, { owners: "doctor-id" }],
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
        select: "email parentEmail fullname name isDeceased",
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
    });
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
