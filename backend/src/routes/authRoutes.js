// routes/auth.route.js
import { Router } from "express";
import {
  register, login, logout, me,
  verifyEmail, resendVerificationCode,
  forgotPassword, resetPassword,
  googleInit, googleStart, googleCallback,
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
// Initiate OAuth in the same request that verifies CAPTCHA.
router.post("/google/recaptcha", authLimiter, verifyCaptcha({ expectedAction: "google_oauth" }), googleStart);
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
  const ok = /^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype);
  cb(ok ? null : new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname), ok);
};
const upload = multer({
  storage,
  fileFilter,
  limits: {
    // Busboy signals its byte and part limits as soon as they are reached.
    fileSize: 2 * 1024 * 1024 + 1,
    files: 1,
    fields: 0,
    parts: 2,
    fieldNestingDepth: 1,
  },
});

router.put("/profile/avatar", protect, avatarLimiter, upload.single("avatar"), updateAvatar);
router.post("/profile/avatar-url", protect, avatarLimiter, importAvatarFromUrl);

export default router;
