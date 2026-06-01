import Appointment from "../models/Appointment.js";
import Patient from "../models/Patient.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { ACTIVE_APPOINTMENT_STATUSES } from "../services/appointments/appointmentLifecycleService.js";

const normEmail = (v) => (v || "").toLowerCase().trim();

// Doctor crea cita (solo para pacientes vivos que le “pertenecen”)
// Para cubrir tu arquitectura, permito createdBy OR owners (si existe).

const formatDateTime = (date, locale) => {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  } catch {
    return new Date(date).toLocaleString();
  }
};

// --- CORRECCIÓN AQUÍ ---
// Tratamos los nombres como Strings simples, no Arrays.
const patientDisplayName = (p) => p?.fullname || "Patient";
const doctorDisplayName = (d) => d?.name || "Doctor";
const patientUserMatchesAppointmentPatient = (patient, email) => {
  const normalizedEmail = normEmail(email);
  return Boolean(normalizedEmail) && (
    normEmail(patient?.email) === normalizedEmail ||
    normEmail(patient?.parentEmail) === normalizedEmail
  );
};

const DECEASED_APPOINTMENT_ERROR = "Cannot manage appointments for a deceased patient.";
const DECEASED_APPOINTMENT_ERROR_CODE = "APPOINTMENT_PATIENT_DECEASED";
const deceasedAppointmentErrorBody = (error = DECEASED_APPOINTMENT_ERROR) => ({
  error,
  errorCode: DECEASED_APPOINTMENT_ERROR_CODE,
});
const appointmentPatientIsDeceased = (appt) => appt?.patient?.isDeceased === true;
const APPOINTMENT_PATIENT_SELECT = "_id email parentEmail minorKey age fullname name isDeceased";
const APPOINTMENT_PATIENT_POPULATE_SELECT = "email parentEmail minorKey age fullname name isDeceased";
const GUARDIAN_UNAVAILABLE_APPOINTMENT_ERROR =
  "The guardian is unavailable. Assign a new guardian before scheduling appointments for this minor.";
const GUARDIAN_UNAVAILABLE_APPOINTMENT_ERROR_CODE = "APPOINTMENT_GUARDIAN_UNAVAILABLE";
const guardianUnavailableAppointmentErrorBody = (
  error = GUARDIAN_UNAVAILABLE_APPOINTMENT_ERROR
) => ({
  error,
  errorCode: GUARDIAN_UNAVAILABLE_APPOINTMENT_ERROR_CODE,
});
const appointmentPatientUsesGuardian = (patient) => {
  const age = Number(patient?.age);
  return Boolean(
    normEmail(patient?.parentEmail) ||
      patient?.minorKey ||
      (Number.isFinite(age) && age < 18)
  );
};
const getAppointmentGuardian = async (patient) => {
  if (!appointmentPatientUsesGuardian(patient)) {
    return { required: false, guardian: null };
  }

  const parentEmail = normEmail(patient?.parentEmail);
  if (!parentEmail) {
    return { required: true, guardian: null };
  }

  const guardian = await Patient.findOne({ email: parentEmail }).select("_id isDeceased");
  return { required: true, guardian };
};
const appointmentGuardianIsUnavailable = async (patient) => {
  const { required, guardian } = await getAppointmentGuardian(patient);
  return required && (!guardian || guardian.isDeceased === true);
};
// -----------------------


export const createAppointment = async (req, res) => {
  try {
    const { patientId, start, end, reason } = req.body;

    const s = new Date(start);
    const e = new Date(end);

    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      return res.status(400).json({ error: "Invalid dates" });
    }
    if (e <= s) {
      return res.status(400).json({ error: "End must be after start" });
    }

    const patient = await Patient.findOne({
      _id: patientId,
      isDeceased: false,
      $or: [{ createdBy: req.user._id }, { owners: req.user._id }],
    }).select(APPOINTMENT_PATIENT_SELECT);

    if (!patient) {
      const deceasedPatient = await Patient.findOne({
        _id: patientId,
        isDeceased: true,
        $or: [{ createdBy: req.user._id }, { owners: req.user._id }],
      }).select(APPOINTMENT_PATIENT_SELECT);

      if (deceasedPatient) {
        return res
          .status(404)
          .json(deceasedAppointmentErrorBody("Patient not found or is deceased"));
      }

      return res.status(404).json({ error: "Patient not found or is deceased" });
    }

    if (await appointmentGuardianIsUnavailable(patient)) {
      return res.status(409).json(guardianUnavailableAppointmentErrorBody());
    }

    // ✅ ANTI-OVERLAP (Backend Check)
    // Buscamos si el doctor o paciente ya tiene algo 'pending' o 'accepted' en ese rango
    const conflict = await Appointment.findOne({
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
      $or: [{ doctor: req.user._id }, { patient: patientId }],
      start: { $lt: e }, // Empieza antes de que yo termine
      end: { $gt: s },   // Termina después de que yo empiece
    }).select("_id");

    if (conflict) {
      return res.status(409).json({
        error: "Time range overlaps an existing appointment",
      });
    }

    const appt = await Appointment.create({
      doctor: req.user._id,
      patient: patientId,
      start: s,
      end: e,
      reason: reason?.trim(),
      status: "pending",
    });

      // 🔔 NOTIF al paciente (si existe cuenta User para ese email)
    const pEmail = normEmail(patient.email) || normEmail(patient.parentEmail);
    if (pEmail) {
      const patientUser = await User.findOne({ email: pEmail }).select("_id").lean();
      if (patientUser?._id) {
        const dName = doctorDisplayName(req.user);
        await Notification.create({
          recipient: patientUser._id,
          code: `APPT_NEW_${appt._id}`,
          title: { en: "New Appointment Request", es: "Nueva Solicitud de Cita" },
          message: {
            en: `${dName} scheduled an appointment for ${formatDateTime(s, "en-US")}. Please review it.`,
            es: `${dName} programó una cita para el ${formatDateTime(s, "es-MX")}. Por favor revísala.`,
          },
          relatedAppointment: appt._id,
          meta: { role: "patient" },
        });
      }
    }


    return res.status(201).json(appt);
  } catch (err) {
    console.error("createAppointment error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

export const getAppointments = async (req, res) => {
  try {
    let query = {};

    if (req.user.role === "doctor") {
      query = { doctor: req.user._id };
    } else {
      const email = normEmail(req.user.email);
      const guardianProfile = await Patient.findOne({ email }).select("_id isDeceased");
      const profileConditions = [{ email }];
      if (guardianProfile && guardianProfile.isDeceased !== true) {
        profileConditions.push({ parentEmail: email });
      }
      const myProfiles = await Patient.find({
        isDeceased: { $ne: true },
        $or: profileConditions,
      }).select("_id");
      const ids = myProfiles.map((p) => p._id);
      query = { patient: { $in: ids } };
    }

    query = { ...query, status: { $in: ACTIVE_APPOINTMENT_STATUSES } };

    const appts = await Appointment.find(query)
      .populate("patient", "fullname email parentEmail minorKey age name isDeceased")
      .populate("doctor", "name  email")
      .sort({ start: 1 });

    return res.json(
      appts.filter(
        (appt) =>
          ACTIVE_APPOINTMENT_STATUSES.includes(appt.status) &&
          !appointmentPatientIsDeceased(appt)
      )
    );
  } catch (err) {
    console.error("getAppointments error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

export const acceptAppointment = async (req, res) => {
  try {
    const appt = await Appointment.findById(req.params.id).populate("patient", APPOINTMENT_PATIENT_POPULATE_SELECT);
    if (!appt) return res.status(404).json({ error: "Not found" });

    const email = normEmail(req.user.email);
    if (!patientUserMatchesAppointmentPatient(appt.patient, email)) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    if (appointmentPatientIsDeceased(appt)) {
      return res.status(409).json(deceasedAppointmentErrorBody());
    }
    if (await appointmentGuardianIsUnavailable(appt.patient)) {
      return res.status(409).json(guardianUnavailableAppointmentErrorBody());
    }
    if (appt.status !== "pending") {
      return res.status(400).json({ error: "Appointment is not pending" });
    }

    // ✅ CHECK EXTRA: Si por alguna razón el doctor se llenó de citas accepted en ese horario
    const conflict = await Appointment.findOne({
      _id: { $ne: appt._id },
      doctor: appt.doctor,
      status: "accepted",
      start: { $lt: appt.end },
      end: { $gt: appt.start },
    }).select("_id");

    if (conflict) {
      return res.status(409).json({
        error: "Doctor already has an accepted appointment in that time range",
      });
    }

    appt.status = "accepted";
    await appt.save();
    const pName = patientDisplayName(appt.patient);
    await Notification.create({
      recipient: appt.doctor, // doctor es User _id
      code: `APPT_ACCEPTED_${appt._id}`,
      title: { en: "Appointment Accepted", es: "Cita Aceptada" },
      message: {
        en: `${pName} accepted the appointment for ${formatDateTime(appt.start, "en-US")}.`,
        es: `${pName} aceptó la cita para el ${formatDateTime(appt.start, "es-MX")}.`,
      },
      relatedAppointment: appt._id,
      meta: { role: "doctor" },
    });
    return res.json(appt);
  } catch (err) {
    console.error("acceptAppointment error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

export const deleteAppointment = async (req, res) => {
  try {
    const appt = await Appointment.findById(req.params.id).populate("patient", APPOINTMENT_PATIENT_POPULATE_SELECT).populate("doctor", "name  email");
    if (!appt) return res.status(404).json({ error: "Not found" });

    //const isDoctorOwner = appt.doctor.toString() === req.user._id.toString();
    const isDoctorOwner =
      String(appt.doctor?._id || appt.doctor) === String(req.user._id);

    const isPatientOwner = patientUserMatchesAppointmentPatient(appt.patient, req.user.email);

    if (!isDoctorOwner && !isPatientOwner) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    if (appointmentPatientIsDeceased(appt) && !isDoctorOwner) {
      return res.status(409).json(deceasedAppointmentErrorBody());
    }
    if (!isDoctorOwner && await appointmentGuardianIsUnavailable(appt.patient)) {
      return res.status(409).json(guardianUnavailableAppointmentErrorBody());
    }
    const startStrEn = formatDateTime(appt.start, "en-US");
    const startStrEs = formatDateTime(appt.start, "es-MX");

    
    // A) Doctor cancela -> avisar al paciente
    if (isDoctorOwner) {
      const pEmail = normEmail(appt.patient?.email);
      if (pEmail) {
        const patientUser = await User.findOne({ email: pEmail }).select("_id").lean();
        if (patientUser?._id) {
          const dName = doctorDisplayName(appt.doctor);
          await Notification.create({
            recipient: patientUser._id,
            code: `APPT_CANCEL_DR_${appt._id}_${Date.now()}`,
            title: { en: "Appointment Cancelled", es: "Cita Cancelada" },
            message: {
              en: `Dr. ${dName} cancelled the appointment for ${startStrEn}.`,
              es: `El Dr. ${dName} canceló la cita del ${startStrEs}.`,
            },
            relatedAppointment: null,
            meta: { oldDate: appt.start, role: "patient" },
          });
        }
      }
    }

    // B) Paciente cancela o rechaza -> avisar al doctor
    if (isPatientOwner) {
      const pName = patientDisplayName(appt.patient);
      const isPending = appt.status === "pending";

      await Notification.create({
        recipient: appt.doctor?._id || appt.doctor,
        code: `APPT_CANCEL_PT_${appt._id}_${Date.now()}`,
        title: {
          en: isPending ? "Appointment Declined" : "Appointment Cancelled",
          es: isPending ? "Cita Rechazada" : "Cita Cancelada",
        },
        message: {
          en: `${pName} has ${isPending ? "declined" : "cancelled"} the appointment for ${startStrEn}.`,
          es: `${pName} ha ${isPending ? "rechazado" : "cancelado"} la cita del ${startStrEs}.`,
        },
        relatedAppointment: null,
        meta: { oldDate: appt.start, patientName: pName, role: "doctor" },
      });
    }
    await appt.deleteOne();
    return res.json({ message: "Appointment deleted" });
  } catch (err) {
    console.error("deleteAppointment error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
