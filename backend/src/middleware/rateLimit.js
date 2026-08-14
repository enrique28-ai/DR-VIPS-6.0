// middleware/rateLimit.js
import rateLimit from "express-rate-limit";

// Cabeceras estándar (RateLimit-*) y respuesta JSON
const base = (opts) =>
  rateLimit({
    standardHeaders: true,   // X-RateLimit-* (draft) -> RateLimit-*
    legacyHeaders: false,    // quita X-RateLimit-*
    message: { error: "Too many requests, try again later." },
    ...opts,
  });

// Global API: 300 req / 15 min por IP
export const apiLimiter = base({
  windowMs: 15 * 60 * 1000,
  max: 300,
});

// Login, registro y pre-paso de Google reCAPTCHA: 10 req / 15 min por IP
export const authLimiter = base({
  windowMs: 15 * 60 * 1000,
  max: 10,
});

// Operaciones de avatar: 10 / 15 min por usuario autenticado, compartidas por ruta
export const avatarLimiter = base({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => {
    const userId = req.user?._id;
    if (userId == null) {
      throw new Error("Authenticated user ID required for avatar rate limit");
    }
    return `user:${String(userId)}`;
  },
});

// Forgot/Resend: 3 req / hora por IP
export const emailActionLimiter = base({
  windowMs: 60 * 60 * 1000,
  max: 3,
});

// Verification attempts: 10 req / 15 min por IP
export const verificationLimiter = base({
  windowMs: 15 * 60 * 1000,
  max: 10,
});

// Opcional para escritura (POST/PUT/DELETE): 60 req / 15 min
export const writeLimiter = base({
  windowMs: 15 * 60 * 1000,
  max: 60,
});

export const readLimiter = base({
  windowMs: 60 * 1000, // 1 minuto
  max: 120,            // hasta ~2 req/seg por IP/usuario
});
