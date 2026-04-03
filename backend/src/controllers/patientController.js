// controllers/patient.controller.js
import Patient from "../models/Patient.js";
import Diagnosis from "../models/Diagnosis.js";
//import dns from "node:dns/promises";
import User from "../models/User.js";
import {
  normPhoneWithCountry,
  normalize,
  toBool,
  normGender,
  verifyEmail,
  computeHealthSnapshotByEmail,
  hasPendingHealthDecisionForEmail,
  FT_TO_M,
  LB_TO_KG,
  buildHealthSnapshotFromPatients,
  identityQueryFromPatient,
  normStr,
  normLower,
  normUpper,
  arrKey,
  near,
  sanitizeChildren,
  normNameKey,
  parseChildrenCount,
   minorKeyOf,
  hasPendingGuardianDecisionForMinorKey,
  computeHealthSnapshotByMinorKey,
  computeDynamicAge,
  mapAgeToBand,
  applyDynamicAgeToPatient,
  applyDynamicAgeToSnapshotSet,
  minorQueryByBirthDateOrLegacy,
  t,
  isYmd,
  ymdUTC,
  parseYmdToUtcNoon,
} from "./helpers/patienthelpers.js";
import PatientHistory from "../models/PatientHistory.js";

import {
  getMyHistoryService,
  getPatientHistoryService,
  getPatientHistoryOneService,
  getMyHistoryOneService,
  getChildHistoryService,
  getChildHistoryOneService,
} from "../services/patients/patientHistoryService.js";
import {
  getPatientByIdService,
  getGlobalPatientPreviewService,
  searchGlobalPatientsService,
  importPatientService,
} from "../services/patients/patientReadService.js";
import { getMyPatientsService } from "../services/patients/patientListService.js";
import {
  getMyHealthInfoService,
  getMyChildrenHealthInfoService,
} from "../services/patients/patientPortalService.js";
import {
  approvePatientProfileService,
  rejectPatientProfileService,
  approveChildProfileService,
  rejectChildProfileService,
} from "../services/patients/patientApprovalService.js";
import {
  createPatientService,
  updatePatientService,
} from "../services/patients/patientWriteService.js";
/**
 * Crear paciente
 */
export const createPatient = async (req, res) => {
  try {
    const data = await createPatientService({
      user: req.user,
      body: req.body,
      });
      return res.status(201).json(data);
  } catch (err) {
    if (err?.code === 11000) {
      const isEmailDup = !!err?.keyPattern?.email || !!err?.keyValue?.email;
      return res.status(409).json({
        errorCode: isEmailDup ? "PATIENT_EMAIL_EXISTS" : "PATIENT_DUPLICATE",
        error: isEmailDup
          ? "A patient with this email already exists."
          : "Duplicate patient data.",
      });
    }

    console.error("createPatient error:", err);
  return res.status(err.status || 500).json({
      errorCode: err.errorCode,
      patientId: err.patientId,
      error: err.message || "Server error",
    });
  }
};

/**
 * Listar mis pacientes (búsqueda + filtros + paginación)
 * GET /api/patients?category=0-12|13-17|18-59|60+&q=&page=&limit=
 */
export const getMyPatients = async (req, res) => {
  try {
    const data = await getMyPatientsService({
      user: req.user,
      queryParams: req.query,
    });
     return res.json(data);
  } catch (err) {
    console.error("getMyPatients error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Server error",
    });
  }
};

/**
 * Búsqueda Global de Pacientes (excluye los que ya tienes)
 * GET /api/patients/global-search?q=...
 */
export const searchGlobalPatients = async (req, res) => {
  try {
    const data = await searchGlobalPatientsService({
      user: req.user,
      term: req.query.q,
    });
    return res.json(data);
  } catch (err) {
    console.error("searchGlobalPatients error:", err);
     return res.status(err.status || 500).json({
      error: err.message || "Server error",
    });
  }
};

/**
 * Preview (Read-only) para importar
 * GET /api/patients/global/:id
 */
export const getGlobalPatientPreview = async (req, res) => {
  try {
    const data = await getGlobalPatientPreviewService({
      user: req.user,
      patientId: req.params.id,
    });
    return res.json(data);
  } catch (err) {
    console.error("getGlobalPatientPreview error:", err);
     return res.status(err.status || 500).json({
      error: err.message || "Server error",
    });
  }
};

/**
 * Importar paciente a mi lista
 * POST /api/patients/import/:id
 */
/*export const importPatient = async (req, res) => {
  try {
    const patientId = req.params.id;

    const base = await Patient.findById(patientId).select("_id createdBy owners").lean();
    if (!base) return res.status(404).json({ error: "Patient not found" });

    const updated = await Patient.findByIdAndUpdate(
      patientId,
      { $addToSet: { owners: { $each: [req.user._id, base.createdBy] } } },
      { new: true }
    ).lean({ virtuals: true });

    return res.json({ message: "Patient imported successfully", patient: updated });
  } catch (err) {
    console.error("importPatient error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};*/

export const importPatient = async (req, res) => {
  try {
    const data = await importPatientService({
      user: req.user,
      patientId: req.params.id,
    });
    return res.json(data);
  } catch (err) {
    console.error("importPatient error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Server error",
    });
  }
};



/**
 * Obtener paciente por id
 */
export const getPatientById = async (req, res) => {
  try {
    const data = await getPatientByIdService({
      user: req.user,
      patientId: req.params.id,
      lang: (req.query.lang || "").trim(),
    });
    return res.json(data);
  } catch (err) {
    console.error("getPatientById error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Server error",
    });
  }
};

/**
 * Actualizar paciente
 */
export const updatePatient = async (req, res) => {
  try {
    const data = await updatePatientService({
      user: req.user,
      patientId: req.params.id,
      body: req.body,
    });
    return res.json(data);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({
        error: "Duplicate key: patient already exists for this user",
      });
    }

    console.error("updatePatient error:", err);
    return res.status(err.status || 500).json({
      errorCode: err.errorCode,
      patientId: err.patientId,
      error: err.message || "Server error",
    });
  }
};

/*export const deletePatient = async (req, res) => {
  try {
    // 1) Asegura ownership (solo puedes borrar tus pacientes)
    const patient = await Patient.findOne({
      _id: req.params.id,
      createdBy: req.user._id
    });
    if (!patient) {
      return res.status(404).json({ error: "Paciente no encontrado" });
    }

    // 2) Borra TODOS los diagnósticos que referencian al paciente
    await Diagnosis.deleteMany({ patient: patient._id }); // sin createdBy

    // 3) Borra el paciente
    await patient.deleteOne(); // (si luego agregas hook pre('deleteOne'), también se disparará)

    // 4) Respuesta
    return res.status(204).end();
  } catch (err) {
    console.error("deletePatient error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};*/


// === GET /api/patients/me/health-info ===
export const getMyHealthInfo = async (req, res) => {
  try {
    const data = await getMyHealthInfoService({
      user: req.user,
      req,
    });
    return res.json(data);
  } catch (err) {
    console.error("getMyHealthInfo error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  }
};


// Campos que vamos a sincronizar entre todos los doctors
const SYNC_FIELDS_SCALAR = [
  "fullname",
  "age",
  "ageCategory",
  "bloodtype",
  "gender",
  "organDonor",
  "bloodDonor",
  "measurementSystem",
  "heightM",
  "weightKg",
  "bmi",
  "bmiCategory",
  "isDeceased",
  "causeOfDeath",
  "country",
  "state",
  "city",
  "phone",
  "phoneDigits",
  "childrenCount",
  "birthDate",
"dateOfDeath"
];

const SYNC_FIELDS_ARRAY = ["diseases", "allergies", "medications", "children"];

/**
 * Paciente APRUEBA la versión de un doctor.
 * POST /api/patients/me/health-info/approve/:id
 */
export const approvePatientProfile = async (req, res) => {
  try {
   const data = await approvePatientProfileService({
      user: req.user,
      profileId: req.params.id,
    });
    return res.json(data);
  } catch (err) {
    console.error("approvePatientProfile error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  }
};


export const rejectPatientProfile = async (req, res) => {
  try {
   const data = await rejectPatientProfileService({
      user: req.user,
      profileId: req.params.id,
    });
    return res.json(data);
  } catch (err) {
    console.error("rejectPatientProfile error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  }
};

// Helper: armar query identidad (email > phoneDigits > fallback)


/**
 * GET /api/patients/me/history  (paciente)
 */
export const getMyHistory = async (req, res) => {
  try {
    const data = await getMyHistoryService({ user: req.user });
    return res.json(data);

  } catch (err) {
    console.error("getMyHistory error:", err);
     return res.status(err.status || 500).json({
      error: err.message || "Server error fetching history",
    });
  }
};

/**
 * GET /api/patients/:id/history  (doctor)
 */
export const getPatientHistory = async (req, res) => {
  try {
    const data = await getPatientHistoryService({
      user: req.user,
      patientId: req.params.id,
    });
    return res.json(data);

  } catch (err) {
    console.error("getPatientHistory error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Server error fetching history",
    });
  }
};

// GET /api/patients/:id/history/:historyId?lang=xx  (doctor)
export const getPatientHistoryOne = async (req, res) => {
  try {
    const data = await getPatientHistoryOneService({
      user: req.user,
      patientId: req.params.id,
      historyId: req.params.historyId,
      req,
    });
    return res.json(data);
  } catch (err) {
    console.error("getPatientHistoryOne error:", err);
     return res.status(err.status || 500).json({
      error: err.message || "Server error",
    });
  }
};

// GET /api/patients/me/history/:historyId?lang=xx  (patient)
export const getMyHistoryOne = async (req, res) => {
  try {
    const data = await getMyHistoryOneService({
      user: req.user,
      historyId: req.params.historyId,
      req,
    });
    return res.json(data);
  } catch (err) {
    console.error("getMyHistoryOne error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Server error",
    });
  }
};

export const getMyChildrenHealthInfo = async (req, res) => {
  try {
   const data = await getMyChildrenHealthInfoService({
      user: req.user,
      req,
    });
    return res.json(data);
  } catch (err) {
    console.error("getMyChildrenHealthInfo error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  }
};

export const approveChildProfile = async (req, res) => {
  try {
    const data = await approveChildProfileService({
      user: req.user,
      profileId: req.params.id,
    });
     return res.json(data);
  } catch (err) {
    console.error("approveChildProfile error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  }
};

export const rejectChildProfile = async (req, res) => {
  try {
    const data = await rejectChildProfileService({
      user: req.user,
      profileId: req.params.id,
    });
    return res.json(data);
  } catch (err) {
    console.error("rejectChildProfile error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  }
};

export const getChildHistory = async (req, res) => {
  try {
    const data = await getChildHistoryService({
      user: req.user,
      childId: req.params.childId,
    });
    return res.json(data);
  } catch (err) {
    console.error("getChildHistory error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  }
};

export const getChildHistoryOne = async (req, res) => {
  try {
    const data = await getChildHistoryOneService({
      user: req.user,
      childId: req.params.childId,
      historyId: req.params.historyId,
      req,
    });
    return res.json(data);
  } catch (err) {
    console.error("getChildHistoryOne error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  }
};
