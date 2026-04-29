// controllers/patient.controller.js
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
      const isPhoneDup = !!err?.keyPattern?.phoneDigits || !!err?.keyValue?.phoneDigits;

      return res.status(409).json({
        errorCode: isEmailDup
          ? "PATIENT_EMAIL_EXISTS"
          : isPhoneDup
            ? "PATIENT_PHONE_EXISTS"
            : "PATIENT_DUPLICATE",
        error: isEmailDup
          ? "A patient with this email already exists."
          : isPhoneDup
            ? "A patient with this phone already exists."
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
      const isEmailDup = !!err?.keyPattern?.email || !!err?.keyValue?.email;
      const isPhoneDup = !!err?.keyPattern?.phoneDigits || !!err?.keyValue?.phoneDigits;

      return res.status(409).json({
        errorCode: isEmailDup
          ? "PATIENT_EMAIL_EXISTS"
          : isPhoneDup
            ? "PATIENT_PHONE_EXISTS"
            : "PATIENT_DUPLICATE",
        error: isEmailDup
          ? "A patient with this email already exists."
          : isPhoneDup
            ? "A patient with this phone already exists."
            : "Duplicate patient data.",
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
