import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { requireVerified } from "../middleware/requireVerified.js";
import { requireRole } from "../middleware/roles.js";
import {
  createPatient,
  getMyPatients,
  getPatientById,
  updatePatient,
  deletePatient,
  getMyHealthInfo,
  approvePatientProfile,
 rejectPatientProfile,
} from "../controllers/patientController.js";
import { writeLimiter, readLimiter } from "../middleware/rateLimit.js";

const router = Router();

router.post("/",  protect, requireVerified, requireRole("doctor"), writeLimiter, createPatient);
router.get("/",   protect, requireVerified, requireRole("doctor"), readLimiter, getMyPatients);
router.get("/me/health-info", protect, requireVerified, requireRole("patient"), readLimiter, getMyHealthInfo);
router.post("/me/health-info/approve/:id", protect, requireVerified, requireRole("patient"), writeLimiter, approvePatientProfile);
router.post("/me/health-info/reject/:id", protect, requireVerified, requireRole("patient"), writeLimiter, rejectPatientProfile);
router.get("/:id",protect, requireVerified, requireRole("doctor"), readLimiter, getPatientById);
router.put("/:id",protect, requireVerified, requireRole("doctor"), writeLimiter, updatePatient);
router.delete("/:id", protect, requireVerified, requireRole("doctor"), writeLimiter, deletePatient);

export default router;
