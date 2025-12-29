// controllers/auth.controller.js
import User from "../models/User.js";
import ProfessionalAllowlist from "../models/ProfessionalAllowlist.js";
import { google } from "googleapis";
import { generateTokenAndSetCookie } from "../utils/generateTokenAndSetCookie.js";
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
const PENDING_SECRET = process.env.PENDING_SECRET || "pending_dev_secret";
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

// Helpers para subir a Cloudinary
const uploadAvatarBuffer = (buffer, folder = "drvips/avatars") => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder,
          resource_type: "image",
        },
        (err, result) => {
          if (err) return reject(err);
          resolve(result); // { secure_url, public_id, ... }
        }
      )
      .end(buffer);
  });
};

const uploadAvatarFromUrl = (url, folder = "drvips/avatars") => {
  return cloudinary.uploader.upload(url, {
    folder,
    resource_type: "image",
  });
};


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
// Helpers para códigos/tokens
const gen6Code = () => (Math.floor(100000 + Math.random() * 900000)).toString(); // 6 dígitos


// POST /api/auth/register
export const register = async (req, res) => {
  const lang = getReqLang(req);
  try {
    const { name, email, password, role } = req.body || {};
    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }

    const targetRole = (role === "patient") ? "patient" : "doctor";
 if (targetRole === "doctor" && !(await isAllowedProfessional(email))) {
   return res.status(403).json({ error: "Use your work email (allowed domain) or an approved email." });
 }


    const exists = await User.findOne({ email });
    if (exists){
      if (exists.googleId) {
        return res.status(409).json({ errorCode: "USE_GOOGLE" });
      }
      return res.status(409).json({ error: "User already exists" });
    }

    const verificationToken = gen6Code();
    const verificationTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const user = await User.create({
      name, email, password,
      verificationToken,
      verificationTokenExpiresAt,
      isVerified: false,
      isProfessionalVerified: targetRole === "doctor",
      role: targetRole,
    });

    // Set cookie (autologin). Si prefieres exigir verificación antes, quítalo.
    generateTokenAndSetCookie(res, user._id);

    // RESPONDE primero (no bloquees por SMTP)
    res.status(201).json({
      user,
      message: "Registered. Verification code sent to your email."
    });

    // Enviar verificación en background
    await sendVerificationEmail(user.email, user.verificationToken, lang);
  } catch (err) {
    console.error("register error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await User.findOne({ email }).select("+password");

    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    if (user.googleId) {
      return res.status(400).json({ errorCode: "USE_GOOGLE"})
    }

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    if (user.role === "doctor" && !user.isProfessionalVerified) {
   return res.status(403).json({ error: "Professional verification required" });
 }

    generateTokenAndSetCookie(res, user._id);

    const safeUser = await User.findById(user._id);
    return res.json({ user: safeUser });
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
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
 res.set("Pragma", "no-cache");
  return res.json({ user: req.user });
};

// POST /api/auth/verify-email
export const verifyEmail = async (req, res) => {
   const lang = getReqLang(req);
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: "Code is required" });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const now = new Date();
    if (!user.verificationToken || !user.verificationTokenExpiresAt || now > user.verificationTokenExpiresAt) {
      return res.status(400).json({ error: "Verification code expired" });
    }
    if (user.verificationToken !== code) {
      return res.status(400).json({ error: "Invalid code" });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpiresAt = undefined;
    await user.save();

    // Responde ya (no bloquees por SMTP)
    res.json({ success: true, message: "Email verified" });

    // Welcome en background
    await sendWelcomeEmail(user.email, user.name, lang);
  } catch (err) {
    console.error("verifyEmail error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// POST /api/auth/resend-code
export const resendVerificationCode = async (req, res) => {
   const lang = getReqLang(req);
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.isVerified) return res.status(400).json({ error: "Already verified" });

    user.verificationToken = gen6Code();
    user.verificationTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    // Responde primero
    res.json({ success: true, message: "Verification code resent" });

    // Envío en background
    await sendVerificationEmail(user.email, user.verificationToken, lang);
  } catch (err) {
    console.error("resendVerificationCode error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// POST /api/auth/forgot-password   { email }
export const forgotPassword = async (req, res) => {
   const lang = getReqLang(req);
  try {
    const { email } = req.body || {};
    const user = await User.findOne({ email });
    // Respuesta genérica para no filtrar si existe o no
    if (!user) return res.json({ success: true, message: "If the email exists, we sent a link" });
    if (user.googleId) {
    return res.status(400).json({ errorCode: "USE_GOOGLE" });
    }


    // Token largo y aleatorio sin crypto
   // const rawToken = nanoid(64); // ~64 chars url-safe
    //user.resetPasswordToken = rawToken; // almacenado en claro (válido en apps pequeñas)

    const code = gen6Code();
   const hashedCode   = crypto.createHash("sha256").update(code).digest("hex");
   user.resetPasswordToken = hashedCode;     // guardar SOLO el hash
    user.resetPasswordExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 1h
    await user.save();

    //const resetURL = `${process.env.CLIENT_URL || "http://localhost:5173"}/reset-password/${rawToken}`;

    // Responde primero
    res.json({ success: true, message: "If the email exists, we sent a code" });

    // Envío en background
    await sendPasswordResetCodeEmail(user.email, code, lang);
  } catch (err) {
    console.error("forgotPassword error:", err);
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

    // Como guardamos el token en claro, lo buscamos directo
    //const user = await User.findOne({
      //resetPasswordToken: token,
    const tokenStr = String(token || "").trim();
    const isHex64 = /^[a-f0-9]{64}$/i.test(tokenStr);
    if (!isHex64) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const hashed = crypto.createHash("sha256").update(tokenStr).digest("hex");
    const user = await User.findOne({
      resetPasswordToken: hashed,
      resetPasswordExpiresAt: { $gt: new Date() }
    }).select("+password");

    if (!user) return res.status(400).json({ error: "Invalid or expired reset code" });

    user.password = password;               // se hashea en pre('save') del modelo
    user.resetPasswordToken = undefined;
    user.resetPasswordExpiresAt = undefined;
    await user.save();

    // Responde primero
    res.json({ success: true, message: "Password updated" });

    // Notificación en background
    await sendResetSuccessEmail(user.email, lang);
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

    const user = await User.findOne({ email: e });
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

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 1h para cambiar password
    await user.save();

    return res.json({ success: true, token: rawToken });
  } catch (err) {
    console.error("verifyResetCode error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};


const SERVER_REDIRECT =
  process.env.API_GOOGLE_REDIRECT_URI || "http://localhost:5001/api/auth/google/callback";

const oauth2 = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  SERVER_REDIRECT
);


// GET /api/auth/google/init
export const googleInit = (req, res) => {

    // Exige haber pasado por /google/recaptcha recientemente
  if (req.cookies?.g_captcha !== "ok") {
    return res.status(400).send("Captcha required");
  }
  // Consúmela para que no se re-use
  res.clearCookie("g_captcha");

  const state = nanoid(24);
    res.cookie("g_state", state, {
      httpOnly:true,
      sameSite: "lax",
      secure:isProd,
      maxAge:10*60*1000
    });

  const url = oauth2.generateAuthUrl({
    access_type: "online",            // no necesitas refresh token para login
    prompt: "select_account",
    scope: ["openid", "email", "profile"],
    state,
  });

  return res.redirect(url);
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

    // valida CSRF con cookie
    if (state !== req.cookies.g_state) {
      res.clearCookie("g_state");
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

    

    let user = await User.findOne({ email });
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
      generateTokenAndSetCookie(res, user._id);
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
    console.error("Google callback error:", err);
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
     const allowDoctor = await isAllowedProfessional(email, payload.hd || "");
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
     const email = String(payload.email || "").toLowerCase();
     const hd    = String(payload.hd || "").toLowerCase();
     if (role === "doctor" && !(await isAllowedProfessional(email, hd))) {
       return res.status(403).json({ error: "Doctor role requires an authorized domain/email" });
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
     generateTokenAndSetCookie(res, user._id);
     return res.json({
       ok: true,
       user: { _id: user._id, email: user.email, role: user.role, isVerified: user.isVerified }
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
    // Responde un objeto seguro (sin password)
    return res.json({
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        isVerified: user.isVerified,
        isProfessionalVerified: user.isProfessionalVerified,
      }
    });
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

    // 1) Borra todos los diagnósticos creados por el usuario
    await Diagnosis.deleteMany({ createdBy: uid });

    // 2) Borra todos los pacientes creados por el usuario
    //    (si tu modelo Diagnosis también referencia patient, con el paso 1 ya limpiaste diagnósticos)
    await Patient.deleteMany({ createdBy: uid });

    // 3) Borra al usuario
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


// PUT /api/auth/profile/avatar (multipart/form-data, field: "avatar")
export const updateAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // limpia el avatar anterior si era local
    removeLocalAvatarIfAny(user.avatar);


    // Subir buffer a Cloudinary
    const result = await uploadAvatarBuffer(req.file.buffer, "drvips/avatars");

    // Guardar URL segura de Cloudinary
    user.avatar = result.secure_url;
    await user.save();

    return res.json({ user });
  } catch (err) {
    console.error("updateAvatar error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

export const importAvatarFromUrl = async (req, res) => {
  try {
    let { url } = req.body || {};
    if (typeof url !== "string" || !/^https?:\/\//i.test(url.trim())) {
      return res.status(400).json({ error: "Invalid URL" });
    }
    url = url.trim();

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found" });
    // limpia el avatar anterior si era local
    removeLocalAvatarIfAny(user.avatar);
     // Cloudinary baja la imagen desde la URL y la guarda
    const result = await uploadAvatarFromUrl(url, "drvips/avatars");

    user.avatar = result.secure_url;
    await user.save();

    return res.json({ user });
  } catch (err) {
    console.error("importAvatarFromUrl error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
