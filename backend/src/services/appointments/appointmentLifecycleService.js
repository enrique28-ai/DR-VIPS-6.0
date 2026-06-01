import Appointment from "../../models/Appointment.js";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  CANCELLED_DUE_TO_DEATH_STATUS,
} from "../../constants/appointmentStatuses.js";

export { ACTIVE_APPOINTMENT_STATUSES, CANCELLED_DUE_TO_DEATH_STATUS };

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
