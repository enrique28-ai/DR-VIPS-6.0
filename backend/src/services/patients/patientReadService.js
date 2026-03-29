import Patient from "../../models/Patient.js";
import { applyDynamicAgeToPatient } from "../../controllers/helpers/patienthelpers.js";
import { translatePatientDoc } from "../../utils/deeplTranslate.js";

export const getPatientByIdService = async ({ user, patientId, lang }) => {
  const doc = await Patient.findOne({
    _id: patientId,
    $or: [{ owners: user._id }, { createdBy: user._id }],
  }).lean({ virtuals: true });

  if (!doc) {
    const err = new Error("Paciente no encontrado");
    err.status = 404;
    throw err;
  }

  applyDynamicAgeToPatient(doc);

  if (lang) {
    return await translatePatientDoc(doc, lang);
  }

  return doc;
};

export const getGlobalPatientPreviewService = async ({ user, patientId }) => {
  const doc = await Patient.findById(patientId).lean({ virtuals: true });

  if (!doc) {
    const err = new Error("Patient not found");
    err.status = 404;
    throw err;
  }

  applyDynamicAgeToPatient(doc);

  const amIOwner =
    (Array.isArray(doc.owners) && doc.owners.map(String).includes(String(user._id))) ||
    String(doc.createdBy) === String(user._id);

  return { ...doc, amIOwner };
};