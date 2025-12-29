// routes/auth.route.js
import { Router } from "express";
import {
  register, login, logout, me,
  verifyEmail, resendVerificationCode,
  forgotPassword, resetPassword,
  googleInit, googleCallback,
   getGooglePending, googleFinalizeRole,
  updateProfile, deleteMe, updateAvatar, importAvatarFromUrl, verifyResetCode,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
import { verifyRecaptcha } from "../middleware/recaptcha.js";
import path from "path";
import fs from "fs";
import multer from "multer";
import { authLimiter, forgotLimiter } from "../middleware/rateLimit.js";


const router = Router();
const isProd = process.env.NODE_ENV === "production";
// 1) Pre-paso: valida reCAPTCHA y deja cookie corta
router.post("/google/recaptcha", authLimiter, verifyRecaptcha(), (req, res) => {
  res.cookie("g_captcha", "ok", {
    httpOnly: true,
    sameSite: "lax",
    secure:isProd,
    maxAge: 2 * 60 * 1000, // 2 minutos
    path: "/",
  });
  res.json({ ok: true });
});
router.post("/register", authLimiter, verifyRecaptcha(), register);
router.post("/login",  authLimiter, verifyRecaptcha(), login);
router.post("/logout", logout);
router.get("/me", protect, me);

router.post("/verify-email", protect, verifyEmail);
router.post("/resend-code", protect, forgotLimiter, resendVerificationCode);

router.post("/forgot-password", forgotLimiter, forgotPassword);
router.post("/verify-reset-code", forgotLimiter, verifyResetCode);
router.post("/reset-password/:token", authLimiter, resetPassword);

// Google OAuth (server-side)
router.get("/google/init", googleInit);
router.get("/google/callback", googleCallback);
router.get("/google/pending", getGooglePending);
router.post("/google/finalize", googleFinalizeRole);

// Perfil (ver/editar/borrar cuenta)
router.put("/profile", protect, updateProfile);
router.delete("/me", protect, deleteMe);



const storage = multer.memoryStorage();
const fileFilter = (_req, file, cb) => {
  const ok = /image\/(png|jpe?g|webp|gif)/i.test(file.mimetype);
  cb(ok ? null : new Error("Only image files are allowed"), ok);
};
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

router.put("/profile/avatar", protect, upload.single("avatar"), updateAvatar);
router.post("/profile/avatar-url", protect, importAvatarFromUrl);

export default router;
