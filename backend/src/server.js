import express from 'express';
import dotenv from 'dotenv';
import cors from "cors";
import cookieParser from "cookie-parser";
import { connectDB } from "./config/db.js"
import authRoutes from "./routes/authRoutes.js";
import patientRoutes from "./routes/patientRoutes.js"
import diagnosisRoutes from "./routes/diagnosesRoutes.js"
import path from "path";
import { apiLimiter } from "./middleware/rateLimit.js";



dotenv.config();
const app = express();
const PORT = process.env.PORT || 5001;
const __dirname = path.resolve();

app.set("trust proxy", 1);

const allowed = [process.env.CLIENT_URL, "http://localhost:5173"].filter(Boolean);
app.use(cors({
  origin: allowed,
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization", "x-lang"]
}));
app.use(express.json());
app.use(cookieParser());
// Limita todo lo que pase por /api (300 req / 15 min por IP)
app.use("/api", apiLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/diagnoses", diagnosisRoutes);
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "frontend", "dist");
  app.use(express.static(distPath));

  app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
}
 
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
});