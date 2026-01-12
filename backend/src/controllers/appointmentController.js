import Appointment from "../models/Appointment.js";
import Patient from "../models/Patient.js";

const normEmail = (v) => (v || "").toLowerCase().trim();

// Doctor crea cita (solo para pacientes vivos que le “pertenecen”)
// Para cubrir tu arquitectura, permito createdBy OR owners (si existe).
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
    }).select("_id");

    if (!patient) {
      return res.status(404).json({ error: "Patient not found or is deceased" });
    }

    const appt = await Appointment.create({
      doctor: req.user._id,
      patient: patientId,
      start: s,
      end: e,
      reason: reason?.trim(),
      status: "pending",
    });

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
      const myProfiles = await Patient.find({ email }).select("_id");
      const ids = myProfiles.map((p) => p._id);
      query = { patient: { $in: ids } };
    }

    const appts = await Appointment.find(query)
      .populate("patient", "fullname email")
      .populate("doctor", "name email")
      .sort({ start: 1 });

    return res.json(appts);
  } catch (err) {
    console.error("getAppointments error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

export const acceptAppointment = async (req, res) => {
  try {
    const appt = await Appointment.findById(req.params.id).populate("patient", "email");
    if (!appt) return res.status(404).json({ error: "Not found" });

    const email = normEmail(req.user.email);
    if (normEmail(appt.patient?.email) !== email) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    appt.status = "accepted";
    await appt.save();
    return res.json(appt);
  } catch (err) {
    console.error("acceptAppointment error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

export const deleteAppointment = async (req, res) => {
  try {
    const appt = await Appointment.findById(req.params.id).populate("patient", "email");
    if (!appt) return res.status(404).json({ error: "Not found" });

    const isDoctorOwner = appt.doctor.toString() === req.user._id.toString();
    const isPatientOwner = normEmail(appt.patient?.email) === normEmail(req.user.email);

    if (!isDoctorOwner && !isPatientOwner) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await appt.deleteOne();
    return res.json({ message: "Appointment deleted" });
  } catch (err) {
    console.error("deleteAppointment error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
