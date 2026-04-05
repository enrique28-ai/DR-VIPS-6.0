import axios from "axios";
const api = axios.create({
  baseURL: import.meta.env.MODE === "development" ? "http://localhost:5001/api" : "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

// 🔔 Mostrar toast cuando el servidor responda 429 (rate limit)

// ✅ ADD: send selected language
api.interceptors.request.use((config) => {
  const lang = localStorage.getItem("lang") || "en"; 
  config.headers = config.headers || {};
  config.headers["x-lang"] = lang;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const url = err.config?.url || "";
    if (
      err?.response?.status === 401 &&
      !url.includes("/auth/me") &&
      !url.includes("/auth/logout")
    ) {
      const { useAuthStore } = await import("../stores/authStore.js");
      const store = useAuthStore.getState();
      if (store.isAuthenticated) store.logout();
    }
    return Promise.reject(err);
  }
);

export default api;
