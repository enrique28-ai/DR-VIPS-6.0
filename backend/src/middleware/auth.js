// middleware/auth.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  try {

    const token = req.cookies?.token; // requiere app.use(cookieParser())
    if (!token){
       return res.status(401).json({ error: "Not authenticated" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: "Server config error" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded?.userId;
    if (!userId) return res.status(401).json({ error: "Invalid token" });

    const hasSessionVersion = Object.hasOwn(decoded, "sessionVersion");
    const tokenSessionVersion = hasSessionVersion ? decoded.sessionVersion : 0;
    if (!Number.isSafeInteger(tokenSessionVersion) || tokenSessionVersion < 0) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const user = await User.findById(userId).select("+sessionVersion");
    if (!user){
       return res.status(401).json({ error: "User not found" });
    }

    const currentSessionVersion = user.sessionVersion ?? 0;
    if (
      !Number.isSafeInteger(currentSessionVersion) ||
      currentSessionVersion < 0 ||
      tokenSessionVersion !== currentSessionVersion
    ) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("protect error:", err);
    return res.status(401).json({ error: "Unauthorized" });
  }
};
