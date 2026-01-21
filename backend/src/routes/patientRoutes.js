import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { requireVerified } from "../middleware/requireVerified.js";
import { requireRole } from "../middleware/roles.js";
import {
  createPatient,
  getMyPatients,
  getPatientById,
  updatePatient,
  getMyHealthInfo,
  approvePatientProfile,
 rejectPatientProfile,
 getGlobalPatientPreview,
 searchGlobalPatients,
 importPatient,
 getMyHistory,
getPatientHistory,
getMyHistoryOne,
getPatientHistoryOne,
} from "../controllers/patientController.js";
import { writeLimiter, readLimiter } from "../middleware/rateLimit.js";

const router = Router();

router.post("/",  protect, requireVerified, requireRole("doctor"), writeLimiter, createPatient);
router.get("/",   protect, requireVerified, requireRole("doctor"), readLimiter, getMyPatients);
// ✅ Global Search / Preview / Import (ANTES de /:id)
router.get("/global-search", protect, requireVerified, requireRole("doctor"), readLimiter, searchGlobalPatients);
router.get("/global/:id", protect, requireVerified, requireRole("doctor"), readLimiter, getGlobalPatientPreview);
router.post("/import/:id", protect, requireVerified, requireRole("doctor"), writeLimiter, importPatient);

router.get("/me/health-info", protect, requireVerified, requireRole("patient"), readLimiter, getMyHealthInfo);
router.get("/me/history", protect, requireVerified, requireRole("patient"), readLimiter, getMyHistory);
router.get("/me/history/:historyId", protect, requireVerified, requireRole("patient"), readLimiter, getMyHistoryOne);

router.post("/me/health-info/approve/:id", protect, requireVerified, requireRole("patient"), writeLimiter, approvePatientProfile);
router.post("/me/health-info/reject/:id", protect, requireVerified, requireRole("patient"), writeLimiter, rejectPatientProfile);
router.get("/:id/history", protect, requireVerified, requireRole("doctor"), readLimiter, getPatientHistory);
router.get("/:id/history/:historyId", protect, requireVerified, requireRole("doctor"), readLimiter, getPatientHistoryOne);

router.get("/:id",protect, requireVerified, requireRole("doctor"), readLimiter, getPatientById);
router.put("/:id",protect, requireVerified, requireRole("doctor"), writeLimiter, updatePatient);

export default router;
