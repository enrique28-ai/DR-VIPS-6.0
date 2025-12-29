import axios from "axios";
import { toast } from "react-hot-toast";
const api = axios.create({
  baseURL: import.meta.env.MODE === "development" ? "http://localhost:5001/api" : "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

// 🔔 Mostrar toast cuando el servidor responda 429 (rate limit)

// ✅ ADD: send selected language
api.interceptors.request.use((config) => {
  const lang = localStorage.getItem("lang") || "en"; // i18n lo guarda ahí :contentReference[oaicite:6]{index=6}
  config.headers = config.headers || {};
  config.headers["x-lang"] = lang;
  return config;
});


api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    if (status === 429) {
      const h = err.response.headers || {};
      const secs = parseInt(h["ratelimit-reset"] || h["retry-after"] || "", 10) || 0;
      toast.error(
        secs ? `Too many requests. Try again in ${secs}s.` : "Too many requests. Try again later."
      );
    }
    return Promise.reject(err);
  }
);

export default api;
