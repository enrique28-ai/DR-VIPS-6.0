// middleware/auth.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import {
  completeAuthTimingSpan,
  startAuthTimingSpan,
} from "../runtime/timing.js";

export const protect = async (req, res, next) => {
  const protectStartedAt = startAuthTimingSpan(req);
  const completeProtect = (status) =>
    completeAuthTimingSpan(req, "protect", protectStartedAt, status);
  const token = req.cookies?.token; // requiere app.use(cookieParser())
  if (!token){
     completeProtect("unauthenticated");
     return res.status(401).json({ error: "Not authenticated" });
  }

  if (!process.env.JWT_SECRET) {
    completeProtect("failed");
    return res.status(500).json({ error: "Server config error" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    completeProtect("unauthenticated");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const userId = decoded?.userId;
  if (!userId) {
    completeProtect("unauthenticated");
    return res.status(401).json({ error: "Invalid token" });
  }

  const hasSessionVersion = Object.hasOwn(decoded, "sessionVersion");
  const tokenSessionVersion = hasSessionVersion ? decoded.sessionVersion : 0;
  if (!Number.isSafeInteger(tokenSessionVersion) || tokenSessionVersion < 0) {
    completeProtect("unauthenticated");
    return res.status(401).json({ error: "Invalid token" });
  }

  let user;
  const userLookupStartedAt = startAuthTimingSpan(req);
  try {
    user = await User.findById(userId).select("+sessionVersion");
    completeAuthTimingSpan(req, "user_lookup", userLookupStartedAt, "success");
  } catch (err) {
    completeAuthTimingSpan(req, "user_lookup", userLookupStartedAt, "failed");
    if (err?.name === "CastError") {
      completeProtect("unauthenticated");
      return res.status(401).json({ error: "Invalid token" });
    }
    completeProtect("operational_error");
    return next(err);
  }

  if (!user){
     completeProtect("unauthenticated");
     return res.status(401).json({ error: "User not found" });
  }

  const currentSessionVersion = user.sessionVersion ?? 0;
  if (
    !Number.isSafeInteger(currentSessionVersion) ||
    currentSessionVersion < 0 ||
    tokenSessionVersion !== currentSessionVersion
  ) {
    completeProtect("unauthenticated");
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.user = user;
  completeProtect("success");
  next();
};
