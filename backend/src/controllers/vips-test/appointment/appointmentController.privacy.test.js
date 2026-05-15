import assert from "node:assert/strict";
import { after, test } from "node:test";

import Appointment from "../../../models/Appointment.js";
import Notification from "../../../models/Notification.js";
import Patient from "../../../models/Patient.js";
import {
  acceptAppointment,
  createAppointment,
  deleteAppointment,
} from "../../appointmentController.js";

const originalAppointmentMethods = {
  create: Appointment.create,
  findById: Appointment.findById,
};

const originalNotificationMethods = {
  create: Notification.create,
};

const originalPatientMethods = {
  findOne: Patient.findOne,
};

after(() => {
  restoreModelMethods();
});

function restoreModelMethods() {
  Appointment.create = originalAppointmentMethods.create;
  Appointment.findById = originalAppointmentMethods.findById;
  Notification.create = originalNotificationMethods.create;
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

function mockPatientFindOne(response) {
  const calls = [];

  Patient.findOne = (query) => {
    calls.push(query);
    return {
      select: (projection) => {
        assert.equal(projection, "_id email fullname name");
        return response;
      },
    };
  };

  return calls;
}

function mockAppointmentFindByIdForAccept(response) {
  const calls = [];

  Appointment.findById = (id) => ({
    populate: (path, select) => {
      calls.push({ id, path, select });
      assert.equal(path, "patient");
      assert.equal(select, "email fullname name ");
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
      assert.equal(firstSelect, "email fullname name ");
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
        select: "email fullname name ",
      },
    ]);
  } finally {
    restoreModelMethods();
  }
});

test("acceptAppointment rejects patient email mismatch with 403", async () => {
  restoreModelMethods();
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
