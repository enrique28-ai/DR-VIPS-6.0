import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import Appointment from "../../../models/Appointment.js";
import Notification from "../../../models/Notification.js";
import Patient from "../../../models/Patient.js";
import {
  acceptAppointment,
  deleteAppointment,
  getAppointments,
} from "../../appointmentController.js";

const originals = {
  appointmentFind: Appointment.find,
  appointmentFindById: Appointment.findById,
  appointmentFindOne: Appointment.findOne,
  notificationCreate: Notification.create,
  patientFind: Patient.find,
  patientFindOne: Patient.findOne,
};

afterEach(() => {
  Appointment.find = originals.appointmentFind;
  Appointment.findById = originals.appointmentFindById;
  Appointment.findOne = originals.appointmentFindOne;
  Notification.create = originals.notificationCreate;
  Patient.find = originals.patientFind;
  Patient.findOne = originals.patientFindOne;
});

function birthDateAtBoundary(dayOffset = 0) {
  const today = new Date();
  const targetYear = today.getFullYear() - 18;
  const targetMonth = today.getMonth();
  const targetDay = Math.min(
    today.getDate(),
    new Date(targetYear, targetMonth + 1, 0).getDate()
  );
  const birthDate = new Date(targetYear, targetMonth, targetDay, 12, 0, 0, 0);
  birthDate.setDate(birthDate.getDate() + dayOffset);
  return birthDate;
}

function makeReq(overrides = {}) {
  return {
    params: {},
    query: {},
    user: {
      _id: "guardian-user-id",
      role: "patient",
      email: "guardian@example.com",
    },
    ...overrides,
  };
}

function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function makeThenable(value, methods = {}) {
  const query = {
    ...methods,
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    },
  };
  return query;
}

function mockPatientProfiles(profiles, guardian = { _id: "guardian-profile-id", isDeceased: false }) {
  Patient.findOne = () => ({ select: () => Promise.resolve(guardian) });
  Patient.find = (query) => ({
    select: () => {
      const directEmail = query.$or?.find((condition) => condition.email)?.email;
      const guardianCondition = query.$or?.find((condition) => condition.parentEmail);
      const cutoff = guardianCondition?.$or?.[0]?.birthDate?.$gt;
      const filtered = profiles.filter((patient) => {
        if (patient.email === directEmail) return true;
        if (patient.parentEmail !== guardianCondition?.parentEmail) return false;
        if (!cutoff) return true;
        if (patient.birthDate) return new Date(patient.birthDate) > cutoff;
        return Number(patient.age) < 18;
      });
      return Promise.resolve(filtered);
    },
  });
}

function mockAppointmentList(appointmentsByPatientId) {
  const calls = [];
  Appointment.find = (query) => {
    calls.push(query);
    const ids = query.patient?.$in?.map(String) ?? [];
    const appointments = ids.flatMap((id) => appointmentsByPatientId[id] ?? []);
    const chain = {
      populate() {
        return chain;
      },
      sort() {
        return Promise.resolve(appointments);
      },
    };
    return chain;
  };
  return calls;
}

function mockAppointmentById(appointment) {
  Appointment.findById = () => {
    const query = makeThenable(appointment);
    query.populate = () => query;
    return query;
  };
}

function allowAppointmentDecisionSideEffects() {
  Patient.findOne = () => ({ select: () => Promise.resolve({ _id: "guardian-profile-id", isDeceased: false }) });
  Appointment.findOne = () => ({ select: () => Promise.resolve(null) });
  Notification.create = async () => ({});
}

test("former guardian cannot list an adult patient's appointment through stale parentEmail", async () => {
  const adult = {
    _id: "adult-patient-id",
    email: "adult@example.com",
    parentEmail: "guardian@example.com",
    birthDate: birthDateAtBoundary(0),
    age: 17,
    isDeceased: false,
  };
  const adultAppointment = {
    _id: "adult-appointment-id",
    patient: adult,
    status: "pending",
  };
  mockPatientProfiles([adult]);
  const appointmentFindCalls = mockAppointmentList({
    "adult-patient-id": [adultAppointment],
  });
  const res = makeRes();

  await getAppointments(makeReq(), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
  assert.deepEqual(appointmentFindCalls[0].patient.$in, []);
});

test("guardian can still list a dependent who is just under 18", async () => {
  const minor = {
    _id: "minor-patient-id",
    parentEmail: "guardian@example.com",
    birthDate: birthDateAtBoundary(1),
    age: 17,
    isDeceased: false,
  };
  const minorAppointment = {
    _id: "minor-appointment-id",
    patient: minor,
    status: "pending",
  };
  mockPatientProfiles([minor]);
  mockAppointmentList({ "minor-patient-id": [minorAppointment] });
  const res = makeRes();

  await getAppointments(makeReq(), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [minorAppointment]);
});

test("adult patient keeps appointment list access through their own email", async () => {
  const adult = {
    _id: "adult-patient-id",
    email: "adult@example.com",
    parentEmail: "former-guardian@example.com",
    birthDate: birthDateAtBoundary(0),
    age: 17,
    isDeceased: false,
  };
  const adultAppointment = {
    _id: "adult-appointment-id",
    patient: adult,
    status: "accepted",
  };
  mockPatientProfiles([adult], { _id: "adult-patient-id", isDeceased: false });
  mockAppointmentList({ "adult-patient-id": [adultAppointment] });
  const res = makeRes();

  await getAppointments(
    makeReq({
      user: { _id: "adult-user-id", role: "patient", email: "adult@example.com" },
    }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [adultAppointment]);
});

test("former guardian cannot accept an adult patient's appointment through stale parentEmail", async () => {
  let saveCalls = 0;
  const appointment = {
    _id: "adult-appointment-id",
    doctor: "doctor-id",
    patient: {
      _id: "adult-patient-id",
      email: "adult@example.com",
      parentEmail: "guardian@example.com",
      birthDate: birthDateAtBoundary(0),
      age: 17,
      isDeceased: false,
    },
    status: "pending",
    start: new Date("2026-09-01T10:00:00.000Z"),
    end: new Date("2026-09-01T10:30:00.000Z"),
    async save() {
      saveCalls += 1;
    },
  };
  mockAppointmentById(appointment);
  allowAppointmentDecisionSideEffects();
  const res = makeRes();

  await acceptAppointment(makeReq({ params: { id: appointment._id } }), res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Unauthorized" });
  assert.equal(saveCalls, 0);
});

test("former guardian cannot delete an adult patient's appointment through stale parentEmail", async () => {
  let deleteCalls = 0;
  const appointment = {
    _id: "adult-appointment-id",
    doctor: { _id: "doctor-id", name: "Doctor" },
    patient: {
      _id: "adult-patient-id",
      email: "adult@example.com",
      parentEmail: "guardian@example.com",
      birthDate: birthDateAtBoundary(0),
      age: 17,
      isDeceased: false,
    },
    status: "accepted",
    start: new Date("2026-09-01T10:00:00.000Z"),
    async deleteOne() {
      deleteCalls += 1;
    },
  };
  mockAppointmentById(appointment);
  allowAppointmentDecisionSideEffects();
  const res = makeRes();

  await deleteAppointment(makeReq({ params: { id: appointment._id } }), res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Unauthorized" });
  assert.equal(deleteCalls, 0);
});

test("adult patient keeps appointment action access through their own email", async () => {
  let saveCalls = 0;
  const appointment = {
    _id: "adult-appointment-id",
    doctor: "doctor-id",
    patient: {
      _id: "adult-patient-id",
      email: "adult@example.com",
      parentEmail: "former-guardian@example.com",
      birthDate: birthDateAtBoundary(0),
      age: 17,
      isDeceased: false,
    },
    status: "pending",
    start: new Date("2026-09-01T10:00:00.000Z"),
    end: new Date("2026-09-01T10:30:00.000Z"),
    async save() {
      saveCalls += 1;
    },
  };
  mockAppointmentById(appointment);
  Patient.findOne = () => ({ select: () => Promise.resolve(null) });
  Appointment.findOne = () => ({ select: () => Promise.resolve(null) });
  Notification.create = async () => ({});
  const res = makeRes();

  await acceptAppointment(
    makeReq({
      params: { id: appointment._id },
      user: { _id: "adult-user-id", role: "patient", email: "adult@example.com" },
    }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(saveCalls, 1);
});
