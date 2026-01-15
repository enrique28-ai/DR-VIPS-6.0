import { Router } from "express";
import { protect } from "../middleware/auth.js";
import { requireVerified } from "../middleware/requireVerified.js";
import {
  getMyNotifications,
  markAsRead,
  markAllRead,
} from "../controllers/notificationController.js";

const router = Router();


router.get("/", protect, requireVerified, getMyNotifications);
router.put("/:id/read", protect, requireVerified, markAsRead);
router.put("/read-all", protect, requireVerified, markAllRead);

export default router;
