// middleware/auth.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  try {

    console.log("🔍 [Auth Debug] Headers recibidos:", req.headers.cookie ? "Sí" : "No");
    console.log("🍪 [Auth Debug] Cookies parseadas:", req.cookies);

    const token = req.cookies?.token; // requiere app.use(cookieParser())
    if (!token){
      console.log("❌ [Auth Debug] FALLO: No se encontró la cookie 'token'");
       return res.status(401).json({ error: "Not authenticated" });
    }

    if (!process.env.JWT_SECRET) {
      console.error("🔥 [Auth Debug] ERROR CRÍTICO: Faltan variable JWT_SECRET en Render");
      return res.status(500).json({ error: "Server config error" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded?.userId;
    if (!userId) return res.status(401).json({ error: "Invalid token" });

    const user = await User.findById(userId);
    if (!user){
      console.log("❌ [Auth Debug] FALLO: El usuario ya no existe en la BD (¿Borrado?)");
       return res.status(401).json({ error: "User not found" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("❌ [Auth Debug] EXCEPCIÓN:", err.message);
    console.error("protect error:", err);
    return res.status(401).json({ error: "Unauthorized" });
  }
};
