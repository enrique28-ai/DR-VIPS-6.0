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
} from "../services/patients/patientReadService.js";
import {
  approvePatientAccessRequestService,
  createPatientAccessRequestService,
  listDecidablePatientAccessRequestsService,
  listDoctorPatientAccessRequestsService,
  rejectPatientAccessRequestService,
} from "../services/patients/patientAccessRequestService.js";
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
  reassignMinorGuardianService,
  updatePatientService,
} from "../services/patients/patientWriteService.js";

const handlePatientServiceError = ({
  err,
  res,
  next,
  fallbackMessage,
  includeErrorCode = false,
  includePatientId = false,
}) => {
  const status = err?.status;
  if (!Number.isInteger(status) || status < 400 || status > 499) {
    return next(err);
  }

  const body = {};
  if (includeErrorCode && err.errorCode !== undefined) {
    body.errorCode = err.errorCode;
  }
  if (includePatientId && err.patientId !== undefined) {
    body.patientId = err.patientId;
  }
  body.error = err.message || fallbackMessage;

  return res.status(status).json(body);
};

/**
 * Crear paciente
 */
export const createPatient = async (req, res, next) => {
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

    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Server error",
      includeErrorCode: true,
      includePatientId: true,
    });
  }
};

/**
 * Listar mis pacientes (búsqueda + filtros + paginación)
 * GET /api/patients?category=0-12|13-17|18-59|60+&q=&page=&limit=
 */
export const getMyPatients = async (req, res, next) => {
  try {
    const data = await getMyPatientsService({
      user: req.user,
      queryParams: req.query,
    });
     return res.json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Server error",
    });
  }
};

/**
 * Búsqueda Global de Pacientes (excluye los que ya tienes)
 * GET /api/patients/global-search?q=...
 */
export const searchGlobalPatients = async (req, res, next) => {
  try {
    const data = await searchGlobalPatientsService({
      user: req.user,
      term: req.query.q,
    });
    return res.json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Server error",
    });
  }
};

/**
 * Preview (Read-only) para importar
 * GET /api/patients/global/:id
 */
export const getGlobalPatientPreview = async (req, res, next) => {
  try {
    const data = await getGlobalPatientPreviewService({
      user: req.user,
      patientId: req.params.id,
    });
    return res.json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Server error",
    });
  }
};


export const importPatient = async (req, res, next) => {
  try {
    const data = await createPatientAccessRequestService({
      user: req.user,
      patientId: req.params.id,
    });
    return res.status(202).json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Server error",
      includeErrorCode: true,
    });
  }
};

export const createPatientAccessRequest = async (req, res, next) => {
  try {
    const data = await createPatientAccessRequestService({
      user: req.user,
      patientId: req.params.patientId,
    });
    return res.status(202).json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Server error",
      includeErrorCode: true,
    });
  }
};

export const getDoctorPatientAccessRequests = async (req, res, next) => {
  try {
    const data = await listDoctorPatientAccessRequestsService({ user: req.user });
    return res.json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Server error",
      includeErrorCode: true,
    });
  }
};

export const getMyPatientAccessRequests = async (req, res, next) => {
  try {
    const data = await listDecidablePatientAccessRequestsService({ user: req.user });
    return res.json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Server error",
      includeErrorCode: true,
    });
  }
};

export const approvePatientAccessRequest = async (req, res, next) => {
  try {
    const data = await approvePatientAccessRequestService({
      user: req.user,
      requestId: req.params.requestId,
    });
    return res.json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Server error",
      includeErrorCode: true,
    });
  }
};

export const rejectPatientAccessRequest = async (req, res, next) => {
  try {
    const data = await rejectPatientAccessRequestService({
      user: req.user,
      requestId: req.params.requestId,
    });
    return res.json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Server error",
      includeErrorCode: true,
    });
  }
};



/**
 * Obtener paciente por id
 */
export const getPatientById = async (req, res, next) => {
  try {
    const data = await getPatientByIdService({
      user: req.user,
      patientId: req.params.id,
      lang: (req.query.lang || "").trim(),
    });
    return res.json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Server error",
    });
  }
};

/**
 * Actualizar paciente
 */
export const updatePatient = async (req, res, next) => {
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

    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Server error",
      includeErrorCode: true,
      includePatientId: true,
    });
  }
};

export const reassignPatientGuardian = async (req, res, next) => {
  try {
    const data = await reassignMinorGuardianService({
      user: req.user,
      patientId: req.params.id,
      body: req.body,
    });
    return res.json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Server error",
      includeErrorCode: true,
      includePatientId: true,
    });
  }
};



// === GET /api/patients/me/health-info ===
export const getMyHealthInfo = async (req, res, next) => {
  try {
    const data = await getMyHealthInfoService({
      user: req.user,
      req,
    });
    return res.json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Internal server error",
    });
  }
};


/**
 * Paciente APRUEBA la versión de un doctor.
 * POST /api/patients/me/health-info/approve/:id
 */
export const approvePatientProfile = async (req, res, next) => {
  try {
   const data = await approvePatientProfileService({
      user: req.user,
      profileId: req.params.id,
    });
    return res.json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Internal server error",
    });
  }
};


export const rejectPatientProfile = async (req, res, next) => {
  try {
   const data = await rejectPatientProfileService({
      user: req.user,
      profileId: req.params.id,
    });
    return res.json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Internal server error",
    });
  }
};



/**
 * GET /api/patients/me/history  (paciente)
 */
export const getMyHistory = async (req, res, next) => {
  try {
    const data = await getMyHistoryService({ user: req.user });
    return res.json(data);

  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Server error fetching history",
    });
  }
};

/**
 * GET /api/patients/:id/history  (doctor)
 */
export const getPatientHistory = async (req, res, next) => {
  try {
    const data = await getPatientHistoryService({
      user: req.user,
      patientId: req.params.id,
    });
    return res.json(data);

  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Server error fetching history",
    });
  }
};

// GET /api/patients/:id/history/:historyId?lang=xx  (doctor)
export const getPatientHistoryOne = async (req, res, next) => {
  try {
    const data = await getPatientHistoryOneService({
      user: req.user,
      patientId: req.params.id,
      historyId: req.params.historyId,
      req,
    });
    return res.json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Server error",
    });
  }
};

// GET /api/patients/me/history/:historyId?lang=xx  (patient)
export const getMyHistoryOne = async (req, res, next) => {
  try {
    const data = await getMyHistoryOneService({
      user: req.user,
      historyId: req.params.historyId,
      req,
    });
    return res.json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Server error",
    });
  }
};

export const getMyChildrenHealthInfo = async (req, res, next) => {
  try {
   const data = await getMyChildrenHealthInfoService({
      user: req.user,
      req,
    });
    return res.json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Internal server error",
    });
  }
};

export const approveChildProfile = async (req, res, next) => {
  try {
    const data = await approveChildProfileService({
      user: req.user,
      profileId: req.params.id,
    });
     return res.json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Internal server error",
    });
  }
};

export const rejectChildProfile = async (req, res, next) => {
  try {
    const data = await rejectChildProfileService({
      user: req.user,
      profileId: req.params.id,
    });
    return res.json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Internal server error",
    });
  }
};

export const getChildHistory = async (req, res, next) => {
  try {
    const data = await getChildHistoryService({
      user: req.user,
      childId: req.params.childId,
    });
    return res.json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Internal server error",
    });
  }
};

export const getChildHistoryOne = async (req, res, next) => {
  try {
    const data = await getChildHistoryOneService({
      user: req.user,
      childId: req.params.childId,
      historyId: req.params.historyId,
      req,
    });
    return res.json(data);
  } catch (err) {
    return handlePatientServiceError({
      err,
      res,
      next,
      fallbackMessage: "Internal server error",
    });
  }
};
