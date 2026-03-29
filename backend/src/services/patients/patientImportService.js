import Patient from "../../models/Patient.js";
import { applyDynamicAgeToPatient } from "../../controllers/helpers/patienthelpers.js";

export const importPatientService = async ({ user, patientId }) => {
  const base = await Patient.findById(patientId).select("_id createdBy").lean();

  if (!base) {
    const err = new Error("Patient not found");
    err.status = 404;
    throw err;
  }

  const updated = await Patient.findByIdAndUpdate(
    patientId,
    { $addToSet: { owners: { $each: [user._id, base.createdBy] } } },
    { new: true, timestamps: false }
  ).lean({ virtuals: true });

  return {
    message: "Patient imported successfully",
    patient: applyDynamicAgeToPatient(updated),
  };
};