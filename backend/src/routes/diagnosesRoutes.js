// controllers/diagnosis.controller.js
// routes/diagnosis.routes.js
import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { requireVerified } from "../middleware/requireVerified.js";
import { requireRole } from "../middleware/roles.js";
import {
  createDiagnosis,
  getDiagnosesByPatient,
  getDiagnosisById,
  updateDiagnosis,
  getMyDiagnosesPortal,
  getMyDiagnosisPortalById,
  getDiagnosisHistory,
  getDiagnosisHistoryOne,
  getMyChildDiagnosesPortal,
  getMyChildDiagnosisPortalById,
  getMyChildDiagnosisHistory,
  getMyChildDiagnosisHistoryOne
} from "../controllers/diagnosisController.js";
import { writeLimiter, readLimiter } from "../middleware/rateLimit.js";


const router = Router();

// Patient portal (read-only)
router.get("/mine",     protect, requireVerified, requireRole("patient"), readLimiter, getMyDiagnosesPortal);
router.get("/mine/:id", protect, requireVerified, requireRole("patient"), readLimiter, getMyDiagnosisPortalById);

router.get("/children/:childId/mine", protect, requireVerified, requireRole("patient"), readLimiter, getMyChildDiagnosesPortal);
router.get( "/children/:childId/mine/:id", protect, requireVerified, requireRole("patient"), readLimiter, getMyChildDiagnosisPortalById);
router.get("/children/:childId/mine/:id/history", protect, requireVerified, requireRole("patient"), readLimiter, getMyChildDiagnosisHistory);
router.get("/children/:childId/mine/:id/history/:historyId", protect, requireVerified, requireRole("patient"), readLimiter, getMyChildDiagnosisHistoryOne);

router.post("/", protect, requireVerified, requireRole("doctor"), writeLimiter, createDiagnosis);
router.get("/patient/:patientId", protect, requireVerified, requireRole("doctor"), readLimiter, getDiagnosesByPatient); // ?q=&page=&limit=

router.get("/:id/history/:historyId", protect, requireVerified, readLimiter, getDiagnosisHistoryOne);

router.get("/:id/history", protect, requireVerified, readLimiter, getDiagnosisHistory);

router.get("/:id", protect, requireVerified, requireRole("doctor"), readLimiter, getDiagnosisById);
router.put("/:id", protect, requireVerified, requireRole("doctor"), writeLimiter, updateDiagnosis);



export default router;
