// controllers/auth.controller.js
import User, { hashUserPassword, serializePublicUser } from "../models/User.js";
import {
  completeAuthTimingSpan,
  startAuthTimingSpan,
} from "../runtime/timing.js";
import ProfessionalAllowlist from "../models/ProfessionalAllowlist.js";
import { auth as googleAuth } from "googleapis/build/src/apis/oauth2/index.js";
import { generateTokenAndSetCookie } from "../utils/generateTokenAndSetCookie.js";
import { isStrongPassword } from "../utils/passwordPolicy.js";
import { normalizeSingleMailbox } from "../utils/emailAddress.js";
import {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetCodeEmail,
  sendResetSuccessEmail
} from "../utils/email.js";
import Patient from "../models/Patient.js";
import Diagnosis from "../models/Diagnosis.js";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { isCaptchaEnabled } from "../middleware/captcha.js";
const PENDING_SECRET = process.env.PENDING_SECRET;
if (!PENDING_SECRET) {
  throw new Error("Missing required env var: PENDING_SECRET");
}
const COOKIE_PENDING = "g_pending"; // cookie httpOnly para el paso de elegir rol (10 min)
import { v2 as cloudinary } from "cloudinary";

const getReqLang = (req) => {
  const raw = String(req.headers["x-lang"] || "").toLowerCase().trim();
  const short = raw.split(",")[0].split("-")[0]; // "es-MX" -> "es"
  return ["en", "es"].includes(short) ? short : "en";
};

// Helpers para limpiar avatars locales
const isLocalAvatarUrl = (url = "") => {
  try { return new URL(url).pathname.startsWith("/uploads/avatars/"); }
  catch { return typeof url === "string" && url.startsWith("/uploads/avatars/"); }
};
const avatarPathOnDisk = (url = "") => {
  const pathname = (() => {
    try { return new URL(url).pathname; } catch { return url; }
  })();
  // Evita paths absolutos fuera del proyecto en Windows/Linux
  return path.join(process.cwd(), pathname.replace(/^\//, ""));
};
const removeLocalAvatarIfAny = (url = "") => {
  try {
    if (!isLocalAvatarUrl(url)) return;
    fs.unlink(avatarPathOnDisk(url), () => {});
  } catch {}
};

// --- Cloudinary config (avatars / medical images) ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const avatarUploadOptions = {
  folder: "drvips/avatars",
  resource_type: "image",
  timeout: 10000,
};

const uploadAvatarBuffer = (buffer) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { ...avatarUploadOptions, disable_promises: true },
        (err, result) => {
          if (err) return reject(err);
          resolve(result); // { secure_url, public_id, ... }
        }
      )
      .end(buffer);
  });
};

function parseAvatarUrl(input) {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!/^https?:\/\/[^/?#\\\s]/i.test(raw) || !URL.canParse(raw)) return null;
  const url = new URL(raw);
  return url.username || url.password ? null : url;
}


const isProd = process.env.NODE_ENV === "production";

const emailDomain = (email = "") =>
  (email.toLowerCase().split("@")[1] || "");

// SIN usar .env (solo Mongo)
const loadAllowlist = async () => {
  const docs = await ProfessionalAllowlist.find({}).lean();

  const domains = new Set(
    docs
      .filter(d => d.domain)
      .map(d => d.domain.toLowerCase())
  );

  const emails = new Set(
    docs
      .filter(d => d.email)
      .map(d => d.email.toLowerCase())
  );

  return { domains, emails };
};


// Versión asíncrona
const isAllowedProfessional = async (email = "", hdClaim = "") => {
  const { domains, emails } = await loadAllowlist();

  const e  = email.toLowerCase();
  const dom = emailDomain(email);
  const hd = (hdClaim || "").toLowerCase();

  return (
    emails.has(e) ||
    domains.has(dom) ||
    (hd && domains.has(hd))
  );
};

const isProfessionalAllowlistEnforced = () =>
  process.env.PROFESSIONAL_ALLOWLIST_ENFORCED !== "false";

// Helpers para códigos/tokens
const gen6Code = () => crypto.randomInt(100000, 1000000).toString(); // 6 dígitos (CSPRNG)
const hashVerificationCode = (code) =>
  crypto.createHash("sha256").update(String(code)).digest("hex");

// Avoid immediately reissuing the active code, without an unbounded retry loop.
const replacementCode = (previousHash) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = gen6Code();
    if (hashVerificationCode(code) !== previousHash) return code;
  }
  return null;
};

const doctorEmailIsReservedByPatient = async (email) => {
  const normalizedEmail = normalizeSingleMailbox(email);
  if (!normalizedEmail) return false;

  const patient = await Patient.findOne({ email: normalizedEmail })
    .select("_id")
    .lean();

  return Boolean(patient);
};

const sendDoctorEmailReserved = (res) => res.status(409).json({
  errorCode: "DOCTOR_EMAIL_RESERVED",
  error: "This email cannot be used for a doctor account.",
});


// POST /api/auth/register
export const register = async (req, res) => {
  const lang = getReqLang(req);
  try {
    const { name, email, password, role } = req.body || {};
    const passwordMissing = password == null || password === "";
    const emailMissing = typeof email !== "string" || !email.trim();
    if (!name?.trim() || emailMissing || passwordMissing) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }
    const normalizedEmail = normalizeSingleMailbox(email);
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        errorCode: "WEAK_PASSWORD",
        error: "Password does not meet security requirements",
      });
    }
    if (!normalizedEmail) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const targetRole = (role === "patient") ? "patient" : "doctor";
 if (
   targetRole === "doctor" &&
   isProfessionalAllowlistEnforced() &&
   !(await isAllowedProfessional(normalizedEmail))
 ) {
   return res.status(403).json({ error: "Use your work email (allowed domain) or an approved email." });
 }


    const exists = await User.findOne({ email: normalizedEmail });
    if (exists){
      if (exists.googleId) {
        return res.status(409).json({ errorCode: "USE_GOOGLE" });
      }
      return res.status(409).json({ error: "User already exists" });
    }

    if (targetRole === "doctor" && await doctorEmailIsReservedByPatient(normalizedEmail)) {
      return sendDoctorEmailReserved(res);
    }

    const verificationCode = gen6Code();
    const verificationTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const user = await User.create({
      name, email: normalizedEmail, password,
      verificationToken: hashVerificationCode(verificationCode),
      verificationTokenExpiresAt,
      isVerified: false,
      isProfessionalVerified: targetRole === "doctor",
      role: targetRole,
    });

    // Set cookie (autologin). Si prefieres exigir verificación antes, quítalo.
    generateTokenAndSetCookie(res, user._id, user.sessionVersion ?? 0);

    // RESPONDE primero (no bloquees por SMTP)
    res.status(201).json({
      user: serializePublicUser(user),
      message: "Registered. Verification code sent to your email."
    });

    // Enviar verificación en background
    sendVerificationEmail(user.email, verificationCode, lang)
      .catch((e) => console.error("Email send failed (register):", e.message));
  } catch (err) {
    console.error("register error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await User.findOne({ email }).select("+password +sessionVersion");

    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    if (user.googleId) {
      return res.status(400).json({ errorCode: "USE_GOOGLE"})
    }

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    if (user.role === "doctor" && !user.isProfessionalVerified) {
   return res.status(403).json({ error: "Professional verification required" });
 }

    generateTokenAndSetCookie(res, user._id, user.sessionVersion ?? 0);

    const safeUser = await User.findById(user._id);
    return res.json({ user: serializePublicUser(safeUser) });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// POST /api/auth/logout
export const logout = async (_req, res) => {

  res.clearCookie("token", {
    httpOnly: true,
    secure: isProd,
    sameSite:  "lax",
    path: "/"
  });
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
 res.set("Pragma", "no-cache");
  return res.json({ success: true, message: "Logged out" });
};

// GET /api/auth/me
export const me = async (req, res) => {
  const controllerStartedAt = startAuthTimingSpan(req);
  let timingStatus = "success";

  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    return res.json({ user: serializePublicUser(req.user) });
  } catch (error) {
    timingStatus = "failed";
    throw error;
  } finally {
    completeAuthTimingSpan(req, "auth_me_controller", controllerStartedAt, timingStatus);
  }
};

// POST /api/auth/verify-email
export const verifyEmail = async (req, res) => {
   const lang = getReqLang(req);
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: "Code is required" });

    const user = await User.findById(req.user._id)
      .select("+verificationToken +verificationTokenExpiresAt");
    if (!user) return res.status(404).json({ error: "User not found" });

    const now = new Date();
    if (!user.verificationToken || !user.verificationTokenExpiresAt || now >= user.verificationTokenExpiresAt) {
      return res.status(400).json({ error: "Verification code expired" });
    }
    if (user.verificationToken !== hashVerificationCode(code)) {
      return res.status(400).json({ error: "Invalid code" });
    }

    const verifiedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        isVerified: false,
        verificationToken: hashVerificationCode(code),
        verificationTokenExpiresAt: { $gt: new Date() },
      },
      {
        $set: { isVerified: true },
        $unset: { verificationToken: 1, verificationTokenExpiresAt: 1 },
      },
      { new: true, runValidators: true }
    );
    if (!verifiedUser) return res.status(400).json({ error: "Invalid code" });

    // Responde ya (no bloquees por SMTP)
    res.json({ success: true, message: "Email verified" });

    // Welcome en background
    sendWelcomeEmail(verifiedUser.email, verifiedUser.name, lang)
      .catch(() => console.error("Email send failed (welcome)"));
  } catch {
    console.error("verifyEmail error");
    return res.status(500).json({ error: "Server error" });
  }
};

// POST /api/auth/resend-code
export const resendVerificationCode = async (req, res) => {
   const lang = getReqLang(req);
  try {
    const user = await User.findById(req.user._id)
      .select("+verificationToken +verificationTokenExpiresAt");
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.isVerified) return res.status(400).json({ error: "Already verified" });

    const verificationCode = replacementCode(user.verificationToken);
    if (!verificationCode) return res.status(503).json({ error: "Could not generate a verification code" });
    const issued = await User.findOneAndUpdate(
      {
        _id: user._id,
        isVerified: false,
        verificationToken: user.verificationToken ?? null,
        verificationTokenExpiresAt: user.verificationTokenExpiresAt ?? null,
      },
      {
        $set: {
          verificationToken: hashVerificationCode(verificationCode),
          verificationTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      },
      { new: true, runValidators: true }
    );
    if (!issued) return res.status(409).json({ error: "Verification state changed. Request a new code." });

    // Enviar verificación (crítico — el usuario pidió el código explícitamente)
    try {
      await sendVerificationEmail(issued.email, verificationCode, lang);
    } catch {
      console.error("Email send failed (resend)");
      return res.status(500).json({ error: "Could not send verification email" });
    }

    res.json({ success: true, message: "Verification code resent" });
  } catch {
    console.error("resendVerificationCode error");
    return res.status(500).json({ error: "Server error" });
  }
};

// POST /api/auth/forgot-password   { email }
export const forgotPassword = async (req, res) => {
   const lang = getReqLang(req);
  try {
    const { email } = req.body || {};
    const user = await User.findOne({ email })
      .select("+resetPasswordToken +resetPasswordExpiresAt +sessionVersion")
      .lean();
    // Respuesta genérica para no filtrar si existe o no
    if (!user) return res.json({ success: true, message: "If the email exists, we sent a code" });
    if (user.googleId) {
    return res.status(400).json({ errorCode: "USE_GOOGLE" });
    }

    const code = replacementCode(user.resetPasswordToken);
    if (!code) return res.json({ success: true, message: "If the email exists, we sent a code" });
    const issued = await User.findOneAndUpdate(
      {
        _id: user._id,
        googleId: user.googleId ?? null,
        // Fence an old empty-token snapshot after a complete password reset.
        // lean() preserves a legacy absent version instead of applying defaults.
        sessionVersion: user.sessionVersion ?? null,
        resetPasswordToken: user.resetPasswordToken ?? null,
        resetPasswordExpiresAt: user.resetPasswordExpiresAt ?? null,
      },
      {
        $set: {
          resetPasswordToken: hashVerificationCode(code),
          resetPasswordExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      },
      { new: true, runValidators: true }
    );

    // A concurrent change wins. Do not overwrite it, send a stale code or expose
    // an account-specific conflict through this public endpoint.
    if (!issued) return res.json({ success: true, message: "If the email exists, we sent a code" });

    // Responde primero
    res.json({ success: true, message: "If the email exists, we sent a code" });

    // Envío en background
    sendPasswordResetCodeEmail(issued.email, code, lang)
      .catch(() => console.error("Email send failed (forgot)"));
  } catch {
    console.error("forgotPassword error");
    return res.status(500).json({ error: "Server error" });
  }
};

// POST /api/auth/reset-password/:token   { password }
export const resetPassword = async (req, res) => {
  const lang = getReqLang(req);
  try {
    const { token } = req.params || {};
    const { password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: "Invalid payload" });

    const tokenStr = String(token || "").trim();
    const isHex64 = /^[a-f0-9]{64}$/i.test(tokenStr);
    if (!isHex64) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        errorCode: "WEAK_PASSWORD",
        error: "Password does not meet security requirements",
      });
    }

    const hashedToken = crypto.createHash("sha256").update(tokenStr).digest("hex");
    const passwordHash = await hashUserPassword(password);
    const user = await User.findOneAndUpdate(
      {
        resetPasswordToken: hashedToken,
        resetPasswordExpiresAt: { $gt: new Date() },
      },
      {
        $set: {
          password: passwordHash,
          isVerified: true,
        },
        $unset: {
          resetPasswordToken: 1,
          resetPasswordExpiresAt: 1,
          verificationToken: 1,
          verificationTokenExpiresAt: 1,
        },
        $inc: { sessionVersion: 1 },
      },
      { new: true, runValidators: true }
    );

    if (!user) return res.status(400).json({ error: "Invalid or expired reset code" });

    // Responde primero
    res.json({ success: true, message: "Password updated" });

    // Notificación en background
    sendResetSuccessEmail(user.email, lang)
      .catch((e) => console.error("Email send failed (reset-success):", e.message));
  } catch (err) {
    console.error("resetPassword error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};


// POST /api/auth/verify-reset-code  { email, code }
export const verifyResetCode = async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const e = String(email || "").toLowerCase().trim();
    const c = String(code || "").trim();

    if (!e || !c) return res.status(400).json({ error: "Invalid payload" });
    if (!/^\d{6}$/.test(c)) {
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    const user = await User.findOne({ email: e })
      .select("+resetPasswordToken +resetPasswordExpiresAt");
    // genérico para no filtrar
    if (!user) return res.status(400).json({ error: "Invalid or expired code" });

    if (user.googleId) {
      return res.status(400).json({ errorCode: "USE_GOOGLE" });
    }

    const now = new Date();
    if (!user.resetPasswordToken || !user.resetPasswordExpiresAt || now > user.resetPasswordExpiresAt) {
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    const hashedCode = crypto.createHash("sha256").update(c).digest("hex");
    if (hashedCode !== user.resetPasswordToken) {
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    // Intercambia código → token largo (para usar /reset-password/:token)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    const exchanged = await User.findOneAndUpdate(
      {
        _id: user._id,
        resetPasswordToken: hashedCode,
        resetPasswordExpiresAt: { $gt: now },
      },
      {
        $set: {
          resetPasswordToken: hashedToken,
          resetPasswordExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      }
    );

    if (!exchanged) {
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    return res.json({ success: true, token: rawToken });
  } catch (err) {
    console.error("verifyResetCode error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};


const SERVER_REDIRECT =
  process.env.API_GOOGLE_REDIRECT_URI || "http://localhost:5001/api/auth/google/callback";

const oauth2 = new googleAuth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  SERVER_REDIRECT
);


// GET /api/auth/google/init
const googleAuthorizationUrl = (res, captchaVerified = false) => {
  const state = nanoid(24);
  const stateCookie = jwt.sign(
    { purpose: "google-oauth-state", state, captchaVerified },
    PENDING_SECRET,
    { algorithm: "HS256", expiresIn: "10m" },
  );
  res.cookie("g_state", stateCookie, {
    httpOnly: true, sameSite: "lax", secure: isProd,
    maxAge: 10 * 60 * 1000, path: "/",
  });
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  return oauth2.generateAuthUrl({
    access_type: "online", prompt: "select_account",
    scope: ["openid", "email", "profile"], state,
  });
};

// Called after verifyCaptcha on the POST route; no intermediate grant cookie.
export const googleStart = (req, res) => {
  if (isCaptchaEnabled() && req.captcha?.success !== true) {
    return res.status(400).json({ error: "Captcha required" });
  }
  return res.json({ url: googleAuthorizationUrl(res, req.captcha?.success === true) });
};

// Retain direct navigation for CAPTCHA-disabled development only.
export const googleInit = (_req, res) => {
  if (isCaptchaEnabled()) return res.status(400).send("Captcha required");
  return res.redirect(googleAuthorizationUrl(res));
};

// GET /api/auth/google/callback
export const googleCallback = async (req, res) => {
  const backTo = process.env.CLIENT_URL || "http://localhost:5173";
  try {
    const { code, state, error } = req.query;

    if (error) {
     res.clearCookie("g_state");
     // evita que el navegador cachee este paso en el historial
     res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
     res.set("Pragma", "no-cache");
     return res.redirect(backTo);     // o `${backTo}/login` si prefieres
  }

    if (!code || !state) return res.status(400).send("Missing code/state");

    // Authenticate server-issued initiation as well as the browser's CSRF nonce.
    let issuedState;
    try {
      issuedState = jwt.verify(req.cookies?.g_state, PENDING_SECRET, { algorithms: ["HS256"] });
    } catch {
      res.clearCookie("g_state", { path: "/" });
      return res.status(400).send("Bad state");
    }
    if (
      issuedState.purpose !== "google-oauth-state" ||
      typeof state !== "string" || state !== issuedState.state ||
      (isCaptchaEnabled() && issuedState.captchaVerified !== true)
    ) {
      res.clearCookie("g_state", { path: "/" });
      return res.status(400).send("Bad state");
    }

    // tampoco caches el callback exitoso (para que el “atrás” no re-eje cute el login)
   res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
   res.set("Pragma", "no-cache");

    const { tokens } = await oauth2.getToken({ code, redirect_uri: SERVER_REDIRECT });
    const ticket = await oauth2.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const p = ticket.getPayload(); // { sub, email, name, picture, email_verified }

    if (!p?.email || !p.email_verified) {
      res.clearCookie("g_state");
      return res.status(401).send("Google email not verified");
    }

    const googleId = p.sub;
    const email = p.email.toLowerCase();
    const name = p.name || "User";
    const avatar = p.picture || null;
    const hd = (p.hd || "").toLowerCase();



    let user = await User.findOne({ email }).select("+sessionVersion");
    if (user) {
      // Login directo con el rol ya guardado
      if (!user.googleId) {
      res.clearCookie("g_state");
      return res.redirect(`${backTo}/login?authError=USE_PASSWORD`);
    }

  // Si es cuenta Google pero con otro sub (raro, pero posible)
    if (user.googleId !== googleId) {
      res.clearCookie("g_state");
      return res.redirect(`${backTo}/login?authError=GOOGLE_MISMATCH`);
    }

      if (avatar && (!user.avatar || user.avatar.includes("googleusercontent"))) user.avatar = avatar;
      user.isVerified = true;
      await user.save();
      generateTokenAndSetCookie(res, user._id, user.sessionVersion ?? 0);
      res.clearCookie("g_state");
      return res.redirect(backTo);
    }

    // No existe: guardamos dato "pending" en cookie httpOnly (10 min) y mandamos a /choose-role
    const pendingToken = jwt.sign(
      { email, name, picture: avatar, hd, googleId },
      PENDING_SECRET,
      { expiresIn: "10m" }
    );
    res.cookie(COOKIE_PENDING, pendingToken, {
      httpOnly: true, sameSite: "lax", secure: isProd, maxAge: 10 * 60 * 1000, path: "/",
    });
    res.clearCookie("g_state");
    return res.redirect(`${backTo}/choose-role`);
  } catch (err) {
    console.error("Google callback error");
    res.clearCookie("g_state");
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    return res.status(500).send("OAuth error");
  }
};
 // GET /api/auth/google/pending  → { email, name, picture, allowDoctor }
 export const getGooglePending = async (req, res) => {
   try {
     const token = req.cookies?.[COOKIE_PENDING];
     if (!token) return res.status(404).json({ error: "No pending" });
     const payload = jwt.verify(token, PENDING_SECRET);
     const email = String(payload.email || "").toLowerCase();
     const allowDoctor = !isProfessionalAllowlistEnforced() ||
       await isAllowedProfessional(email, payload.hd || "");
     return res.json({
       email,
       name: payload.name || "",
       picture: payload.picture || "",
       allowDoctor,
     });
   } catch {
     return res.status(404).json({ error: "No pending" });
   }
 };

 // POST /api/auth/google/finalize  { role: "patient" | "doctor" }
 export const googleFinalizeRole = async (req, res) => {
   try {
     const token = req.cookies?.[COOKIE_PENDING];
     if (!token) return res.status(400).json({ error: "Session expired" });
     const { role } = req.body || {};
     if (!["patient", "doctor"].includes(role)) {
       return res.status(400).json({ error: "Invalid role" });
     }
     const payload = jwt.verify(token, PENDING_SECRET);
     const email = normalizeSingleMailbox(payload.email);
     if (!email) return res.status(400).json({ error: "Finalize failed" });
     const hd    = String(payload.hd || "").toLowerCase();
     if (
       role === "doctor" &&
       isProfessionalAllowlistEnforced() &&
       !(await isAllowedProfessional(email, hd))
     ) {
       return res.status(403).json({ error: "Doctor role requires an authorized domain/email" });
     }
     if (role === "doctor" && await doctorEmailIsReservedByPatient(email)) {
       return sendDoctorEmailReserved(res);
     }
     // Crear usuario ya verificado por Google
     const user = await User.create({
       email,
       name: payload.name || email.split("@")[0],
       avatar: payload.picture || "",
       googleId: payload.googleId || undefined,
       isVerified: true,
       isProfessionalVerified: role === "doctor",
       role,
     });
     res.clearCookie(COOKIE_PENDING, { path: "/" });
     generateTokenAndSetCookie(res, user._id, user.sessionVersion ?? 0);
     return res.json({
       ok: true,
       user: serializePublicUser(user)
     });
   } catch (e) {
     console.error("googleFinalizeRole error", e);
     return res.status(400).json({ error: "Finalize failed" });
   }
 };

// PUT /api/auth/profile
export const updateProfile = async (req, res) => {
  try {
    const { name, avatar } = req.body || {};
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // No permitas cambiar email aquí
    if (typeof name === "string") {
      const n = name.trim();
      if (!n) return res.status(400).json({ error: "Name is required" });
      user.name = n;
    }
    if (typeof avatar === "string") {
      if (avatar.trim() === "") {
        removeLocalAvatarIfAny(user.avatar); // ← borra archivo anterior si era local
        user.avatar = "";
      } else {
      let val = avatar.trim();
  if (val.startsWith("/uploads/")) {
    const base = `${req.protocol}://${req.get("host")}`;
    val = `${base}${val}`;
    }
    user.avatar = val;
    }
  }

    await user.save();
    return res.json({ user: serializePublicUser(user) });
  } catch (err) {
    console.error("updateProfile error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// DELETE /api/auth/me  (borrado en cascada)
export const deleteMe = async (req, res) => {
  try {
    const uid = req.user._id;
    const u = await User.findById(uid);
    // limpia el avatar si era local (antes de borrar al usuario)
    if (u) removeLocalAvatarIfAny(u.avatar);

    // Borra al usuario
    await User.deleteOne({ _id: uid });

    // 4) Limpia cookie de sesión
    res.clearCookie("token", {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      path: "/",
    });

    return res.status(204).end();
  } catch (err) {
    console.error("deleteMe error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};


function avatarProviderFailure(res, error, importing) {
  const providerError = error?.error ?? error;
  const providerStatus = providerError?.http_code;
  if ([408, 499, 504].includes(providerStatus) ||
      ["ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(providerError?.code)) {
    return res.status(504).json({ error: "Image upload timed out", errorCode: "AVATAR_TIMEOUT" });
  }
  if ([400, 404, 422].includes(providerStatus)) {
    return res.status(422).json(importing
      ? { error: "Image URL could not be imported", errorCode: "AVATAR_URL_UNAVAILABLE" }
      : { error: "Image file could not be processed", errorCode: "AVATAR_INVALID_IMAGE" });
  }
  console.error("[avatar] provider failure", {
    status: Number.isInteger(providerStatus) ? providerStatus : undefined,
  });
  return res.status(502).json({ error: "Image service unavailable" });
}

async function saveAvatar(req, res, upload, { importing = false } = {}) {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found" });

    let avatar;
    try {
      const result = await upload();
      const url = parseAvatarUrl(result?.secure_url);
      if (url?.protocol !== "https:") throw new Error("Missing secure image URL");
      avatar = url.href;
    } catch (error) {
      return avatarProviderFailure(res, error, importing);
    }

    const previousAvatar = user.avatar;
    user.avatar = avatar;
    await user.save();
    removeLocalAvatarIfAny(previousAvatar);

    return res.json({ user: serializePublicUser(user) });
  } catch {
    console.error("[avatar] persistence failure");
    return res.status(500).json({ error: "Server error" });
  }
}

// PUT /api/auth/profile/avatar (multipart/form-data, field: "avatar")
export const updateAvatar = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  return saveAvatar(req, res, () => uploadAvatarBuffer(req.file.buffer));
};

export const importAvatarFromUrl = async (req, res) => {
  const url = parseAvatarUrl(req.body?.url);
  if (!url) return res.status(400).json({ error: "Invalid URL", errorCode: "AVATAR_INVALID_URL" });
  // Cloudinary retrieves the remote image. The backend never fetches the source URL.
  return saveAvatar(req, res, () => cloudinary.uploader.upload(url.href, avatarUploadOptions), { importing: true });
};
