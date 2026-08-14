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
import { verifyCaptcha } from "../middleware/captcha.js";
import multer from "multer";
import {
  authLimiter,
  avatarLimiter,
  emailActionLimiter,
  verificationLimiter,
} from "../middleware/rateLimit.js";


const router = Router();
const isProd = process.env.NODE_ENV === "production";
// 1) Pre-paso: valida CAPTCHA y deja cookie corta
router.post("/google/recaptcha", authLimiter, verifyCaptcha({ expectedAction: "google_oauth" }), (req, res) => {
  res.cookie("g_captcha", "ok", {
    httpOnly: true,
    sameSite: "lax",
    secure:isProd,
    maxAge: 2 * 60 * 1000, // 2 minutos
    path: "/",
  });
  res.json({ ok: true });
});
router.post("/register", authLimiter, verifyCaptcha({ expectedAction: "register" }), register);
router.post("/login",  authLimiter, verifyCaptcha({ expectedAction: "login" }), login);
router.post("/logout", logout);
router.get("/me", protect, me);

router.post("/verify-email", protect, verificationLimiter, verifyEmail);
router.post("/resend-code", protect, emailActionLimiter, resendVerificationCode);

router.post("/forgot-password", emailActionLimiter, forgotPassword);
router.post("/verify-reset-code", verificationLimiter, verifyResetCode);
router.post("/reset-password/:token", verificationLimiter, resetPassword);

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

router.put("/profile/avatar", protect, avatarLimiter, upload.single("avatar"), updateAvatar);
router.post("/profile/avatar-url", protect, avatarLimiter, importAvatarFromUrl);

export default router;
