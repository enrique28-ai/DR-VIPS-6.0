import jwt from "jsonwebtoken";

export const generateTokenAndSetCookie = (res, userId, sessionVersion) => {
  if (!Number.isSafeInteger(sessionVersion) || sessionVersion < 0) {
    throw new TypeError("Invalid sessionVersion for authentication token");
  }

  const token = jwt.sign(
    { userId, sessionVersion },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );

  const isProd = process.env.NODE_ENV === "production";

  res.cookie("token", token, {
    httpOnly: true,
    secure: isProd,                 // Render usa HTTPS → true en prod
    sameSite: "lax", // Ajuste de SameSite según el entorno
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  return token;
};
