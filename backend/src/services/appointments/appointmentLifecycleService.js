import Appointment from "../../models/Appointment.js";
import Patient from "../../models/Patient.js";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  CANCELLED_DUE_TO_DEATH_STATUS,
  CANCELLED_DUE_TO_GUARDIAN_UNAVAILABLE_STATUS,
} from "../../constants/appointmentStatuses.js";

const normEmail = (value) => String(value || "").trim().toLowerCase();

export {
  ACTIVE_APPOINTMENT_STATUSES,
  CANCELLED_DUE_TO_DEATH_STATUS,
  CANCELLED_DUE_TO_GUARDIAN_UNAVAILABLE_STATUS,
};

export const cancelFutureActiveAppointmentsDueToDeath = async (
  patientId,
  now = new Date()
) => {
  if (!patientId) {
    return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
  }

  return Appointment.updateMany(
    {
      patient: patientId,
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
      start: { $gte: now },
    },
    { $set: { status: CANCELLED_DUE_TO_DEATH_STATUS } }
  );
};

export const cancelFutureActiveChildAppointmentsDueToGuardianUnavailable = async (
  guardianEmail,
  now = new Date()
) => {
  const parentEmail = normEmail(guardianEmail);
  if (!parentEmail) {
    return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
  }

  const children = await Patient.find({
    parentEmail,
    isDeceased: { $ne: true },
  })
    .select("_id")
    .lean();
  const childIds = children.map((child) => child._id).filter(Boolean);

  if (!childIds.length) {
    return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
  }

  return Appointment.updateMany(
    {
      patient: { $in: childIds },
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
      start: { $gte: now },
    },
    { $set: { status: CANCELLED_DUE_TO_GUARDIAN_UNAVAILABLE_STATUS } }
  );
};
