import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { requireVerified } from "../middleware/requireVerified.js";
import { readLimiter, writeLimiter } from "../middleware/rateLimit.js";
import {
  getMyNotifications,
  markAsRead,
  markAllRead,
} from "../controllers/notificationController.js";

const router = Router();


router.get("/", protect, requireVerified, readLimiter, getMyNotifications);
router.put("/:id/read", protect, requireVerified, writeLimiter, markAsRead);
router.put("/read-all", protect, requireVerified, writeLimiter, markAllRead);

export default router;
