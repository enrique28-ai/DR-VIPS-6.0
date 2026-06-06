import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { requireVerified } from "../middleware/requireVerified.js";
import { requireRole } from "../middleware/roles.js";
import {
  createPatient,
  getMyPatients,
  getPatientById,
  reassignPatientGuardian,
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
getMyChildrenHealthInfo,
approveChildProfile,
rejectChildProfile,
getChildHistory,
getChildHistoryOne
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

router.get("/me/children/health-info", protect, requireVerified, requireRole("patient"), readLimiter, getMyChildrenHealthInfo);
router.post("/me/children/health-info/approve/:id", protect, requireVerified, requireRole("patient"), writeLimiter, approveChildProfile);
router.post("/me/children/health-info/reject/:id", protect, requireVerified, requireRole("patient"), writeLimiter, rejectChildProfile);
router.get("/me/children/:childId/history", protect, requireVerified, requireRole("patient"), readLimiter, getChildHistory);
router.get("/me/children/:childId/history/:historyId", protect, requireVerified, requireRole("patient"), readLimiter, getChildHistoryOne);


router.patch("/:id/guardian", protect, requireVerified, requireRole("doctor"), writeLimiter, reassignPatientGuardian);
router.get("/:id",protect, requireVerified, requireRole("doctor"), readLimiter, getPatientById);
router.put("/:id",protect, requireVerified, requireRole("doctor"), writeLimiter, updatePatient);

export default router;
