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

const identificationRequired = () => {
  const err = new Error("Patient identification is required");
  err.status = 404;
  throw err;
};

// Compatibility routes cannot enumerate or confirm records, including owned IDs.
// Authorized doctors continue to use the normal ownership-scoped Patient reads.
export const getGlobalPatientPreviewService = async () => identificationRequired();
export const searchGlobalPatientsService = async () => identificationRequired();
