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
  deleteDiagnosis,
  getMyDiagnosesPortal,
  getMyDiagnosisPortalById
} from "../controllers/diagnosisController.js";
import { writeLimiter, readLimiter } from "../middleware/rateLimit.js";


const router = Router();

// Patient portal (read-only)
router.get("/mine",     protect, requireVerified, requireRole("patient"), readLimiter, getMyDiagnosesPortal);
router.get("/mine/:id", protect, requireVerified, requireRole("patient"), readLimiter, getMyDiagnosisPortalById);

router.post("/", protect, requireVerified, requireRole("doctor"), writeLimiter, createDiagnosis);
router.get("/patient/:patientId", protect, requireVerified, requireRole("doctor"), readLimiter, getDiagnosesByPatient); // ?q=&page=&limit=
router.get("/:id", protect, requireVerified, requireRole("doctor"), readLimiter, getDiagnosisById);
router.put("/:id", protect, requireVerified, requireRole("doctor"), writeLimiter, updateDiagnosis);
router.delete("/:id", protect, requireVerified, requireRole("doctor"), writeLimiter, deleteDiagnosis);



export default router;
