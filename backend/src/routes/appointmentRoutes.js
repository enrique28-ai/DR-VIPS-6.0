import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { requireVerified } from "../middleware/requireVerified.js";
import { requireRole } from "../middleware/roles.js";
import { readLimiter, writeLimiter } from "../middleware/rateLimit.js";
import {
  createAppointment,
  getAppointments,
  acceptAppointment,
  deleteAppointment,
} from "../controllers/appointmentController.js";

const router = Router();

router.use(protect, requireVerified);

router.get("/", readLimiter, getAppointments);
router.post("/", requireRole("doctor"), writeLimiter, createAppointment);
router.put("/:id/accept", requireRole("patient"), writeLimiter, acceptAppointment);
router.delete("/:id", writeLimiter, deleteAppointment);

export default router;
