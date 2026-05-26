import assert from "node:assert/strict";
import { after, test } from "node:test";

import Appointment from "../../../models/Appointment.js";
import Notification from "../../../models/Notification.js";
import User from "../../../models/User.js";
import { deleteAppointment } from "../../appointmentController.js";

const originalAppointmentMethods = {
  findById: Appointment.findById,
};

const originalNotificationMethods = {
  create: Notification.create,
};

const originalUserMethods = {
  findOne: User.findOne,
};

after(() => {
  restoreModelMethods();
});

function restoreModelMethods() {
  Appointment.findById = originalAppointmentMethods.findById;
  Notification.create = originalNotificationMethods.create;
  User.findOne = originalUserMethods.findOne;
}

function makeReq(overrides = {}) {
  return {
    body: {},
    params: { id: "appointment-id" },
    query: {},
    user: {
      _id: "doctor-id",
      role: "doctor",
      email: "doctor@example.com",
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

function makeAppointment(overrides = {}) {
  const appt = {
    _id: "appointment-id",
    doctor: { _id: "doctor-id", name: "Owner", email: "doctor@example.com" },
    patient: { email: "patient@example.com", fullname: "Patient Owner" },
    status: "accepted",
    start: new Date("2026-06-01T10:00:00.000Z"),
    deleteOne: async () => {},
    ...overrides,
  };

  return appt;
}

function mockAppointmentFindByIdForDelete(response) {
  const calls = [];

  Appointment.findById = (id) => ({
    populate: (firstPath, firstSelect) => {
      calls.push({ id, path: firstPath, select: firstSelect });
      assert.equal(firstPath, "patient");
      assert.equal(firstSelect, "email parentEmail fullname name");
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

function mockUserFindOne(response) {
  const calls = [];

  User.findOne = (query) => {
    const call = { query, select: undefined };
    calls.push(call);
    return {
      select: (projection) => {
        call.select = projection;
        return {
          lean: async () => response,
        };
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

function guardUserFindOne() {
  User.findOne = () => {
    throw new Error("User.findOne should not be called for patient-owner delete");
  };
}

function guardNotificationCreate() {
  Notification.create = async () => {
    throw new Error("Notification.create should not be called for this delete path");
  };
}

test("doctor owner can delete appointment", async () => {
  restoreModelMethods();

  let deleteCalled = false;
  const appt = makeAppointment({
    deleteOne: async () => {
      deleteCalled = true;
    },
  });
  const findByIdCalls = mockAppointmentFindByIdForDelete(appt);
  const userFindCalls = mockUserFindOne(null);
  guardNotificationCreate();

  const req = makeReq();
  const res = makeRes();

  try {
    await deleteAppointment(req, res);

    assert.deepEqual(findByIdCalls, [
      { id: "appointment-id", path: "patient", select: "email parentEmail fullname name" },
      { id: "appointment-id", path: "doctor", select: "name  email" },
    ]);
    assert.deepEqual(userFindCalls, [
      { query: { email: "patient@example.com" }, select: "_id" },
    ]);
    assert.equal(deleteCalled, true);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { message: "Appointment deleted" });
  } finally {
    restoreModelMethods();
  }
});

test("patient owner can delete appointment", async () => {
  restoreModelMethods();

  let deleteCalled = false;
  const appt = makeAppointment({
    status: "accepted",
    deleteOne: async () => {
      deleteCalled = true;
    },
  });
  mockAppointmentFindByIdForDelete(appt);
  guardUserFindOne();
  const notificationCalls = mockNotificationCreate();

  const req = makeReq({
    user: {
      _id: "patient-user-id",
      role: "patient",
      email: "Patient@Example.com ",
    },
  });
  const res = makeRes();

  try {
    await deleteAppointment(req, res);

    assert.equal(notificationCalls.length, 1);
    assert.equal(notificationCalls[0].recipient, "doctor-id");
    assert.equal(notificationCalls[0].meta.role, "doctor");
    assert.equal(deleteCalled, true);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { message: "Appointment deleted" });
  } finally {
    restoreModelMethods();
  }
});

test("doctor delete sends patient notification when patient user exists", async () => {
  restoreModelMethods();

  let deleteCalled = false;
  const appt = makeAppointment({
    deleteOne: async () => {
      deleteCalled = true;
    },
  });
  mockAppointmentFindByIdForDelete(appt);
  const userFindCalls = mockUserFindOne({ _id: "patient-user-id" });
  const notificationCalls = mockNotificationCreate();

  const req = makeReq();
  const res = makeRes();

  try {
    await deleteAppointment(req, res);

    assert.deepEqual(userFindCalls, [
      { query: { email: "patient@example.com" }, select: "_id" },
    ]);
    assert.equal(notificationCalls.length, 1);
    assert.equal(notificationCalls[0].recipient, "patient-user-id");
    assert.equal(
      notificationCalls[0].code.startsWith("APPT_CANCEL_DR_appointment-id_"),
      true
    );
    assert.equal(notificationCalls[0].relatedAppointment, null);
    assert.equal(notificationCalls[0].meta.role, "patient");
    assert.equal(notificationCalls[0].meta.oldDate, appt.start);
    assert.equal(deleteCalled, true);
    assert.equal(res.statusCode, 200);
  } finally {
    restoreModelMethods();
  }
});

test("patient delete sends doctor notification", async () => {
  restoreModelMethods();

  let deleteCalled = false;
  const appt = makeAppointment({
    status: "accepted",
    deleteOne: async () => {
      deleteCalled = true;
    },
  });
  mockAppointmentFindByIdForDelete(appt);
  guardUserFindOne();
  const notificationCalls = mockNotificationCreate();

  const req = makeReq({
    user: {
      _id: "patient-user-id",
      role: "patient",
      email: "patient@example.com",
    },
  });
  const res = makeRes();

  try {
    await deleteAppointment(req, res);

    assert.equal(notificationCalls.length, 1);
    assert.equal(notificationCalls[0].recipient, "doctor-id");
    assert.equal(
      notificationCalls[0].code.startsWith("APPT_CANCEL_PT_appointment-id_"),
      true
    );
    assert.equal(notificationCalls[0].relatedAppointment, null);
    assert.equal(notificationCalls[0].meta.role, "doctor");
    assert.equal(notificationCalls[0].meta.patientName, "Patient Owner");
    assert.equal(notificationCalls[0].meta.oldDate, appt.start);
    assert.equal(deleteCalled, true);
    assert.equal(res.statusCode, 200);
  } finally {
    restoreModelMethods();
  }
});

test("pending patient delete uses declined wording and metadata", async () => {
  restoreModelMethods();

  let deleteCalled = false;
  const appt = makeAppointment({
    status: "pending",
    deleteOne: async () => {
      deleteCalled = true;
    },
  });
  mockAppointmentFindByIdForDelete(appt);
  guardUserFindOne();
  const notificationCalls = mockNotificationCreate();

  const req = makeReq({
    user: {
      _id: "patient-user-id",
      role: "patient",
      email: "patient@example.com",
    },
  });
  const res = makeRes();

  try {
    await deleteAppointment(req, res);

    assert.equal(notificationCalls.length, 1);
    assert.equal(notificationCalls[0].title.en, "Appointment Declined");
    assert.equal(notificationCalls[0].title.es, "Cita Rechazada");
    assert.equal(notificationCalls[0].message.en.includes("declined"), true);
    assert.equal(notificationCalls[0].message.es.includes("rechazado"), true);
    assert.equal(notificationCalls[0].recipient, "doctor-id");
    assert.equal(notificationCalls[0].relatedAppointment, null);
    assert.equal(notificationCalls[0].meta.role, "doctor");
    assert.equal(notificationCalls[0].meta.patientName, "Patient Owner");
    assert.equal(notificationCalls[0].meta.oldDate, appt.start);
    assert.equal(deleteCalled, true);
    assert.equal(res.statusCode, 200);
  } finally {
    restoreModelMethods();
  }
});
