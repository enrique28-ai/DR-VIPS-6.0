// src/stores/authStore.js
import { create } from "zustand";
import api from "../lib/axios.js";
import toast from "react-hot-toast";
import { queryClient } from "../lib/queryClient.js";
import { persist, createJSONStorage } from "zustand/middleware";
import i18n from "../i18n"; 


const API = import.meta.env.MODE === "development" ? "http://localhost:5001/api/auth" : "/auth";
api.defaults.withCredentials = true;

if (!api.__drvipsLangInterceptor) {
  api.__drvipsLangInterceptor = true;

  api.interceptors.request.use((config) => {
    const lang = localStorage.getItem("lang") || "en";
    config.headers = config.headers || {};
    config.headers["x-lang"] = lang;
    return config;
  });
}

const msgFromCode = (code, fallback, backendMsg) => {
  const map = {
    USE_GOOGLE: i18n.t("auth.toasts.useGoogle"),
    USE_PASSWORD: i18n.t("auth.toasts.usePassword"),
    GOOGLE_MISMATCH: i18n.t("auth.toasts.googleMismatch"),
    USER_EXISTS: i18n.t("auth.toasts.userExists"),
  };

  return map[code] || backendMsg || fallback;
};

const extract = (err, fallback) => {
  const code = err?.response?.data?.errorCode;
  const backendMsg = err?.response?.data?.error;

  if (backendMsg && (
      backendMsg.includes("Invalid") || 
      backendMsg.includes("expired") || 
      backendMsg.includes("incorrect")
  )) {
    return fallback;
  }

  if (!code) return backendMsg || fallback;
  return msgFromCode(code, fallback, backendMsg);
};

const toastAuthError = (code) => {
  toast.error(msgFromCode(code, i18n.t("auth.toasts.loginFailed")));
};

const consumeAuthError = () => {
  if (typeof window === "undefined") return null;

  const url = new URL(window.location.href);
  const code = url.searchParams.get("authError");
  if (!code) return null;

  // quitarlo para que no se repita al refrescar
  url.searchParams.delete("authError");
  const qs = url.searchParams.toString();

  window.history.replaceState(
    {},
    "",
    `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`
  );

  return code; // ejemplo: "USE_PASSWORD"
};


// 🔔 Toast estándar para rate limit (lee Retry-After / RateLimit-Reset si vienen)
const rateToast = (err) => {
  const h = err?.response?.headers || {};
  const secs = parseInt(h["ratelimit-reset"] || h["retry-after"] || "", 10) || 0;
  toast.error(
    secs
      ? `${i18n.t("auth.toasts.rateLimitedWithTime")} ${secs}s.`
      : i18n.t("auth.toasts.rateLimitedShort")
  );
  return secs;
};

export const useAuthStore = create(persist((set) => ({
  user: null,
  isAuthenticated: false,
  isCheckingAuth: true,
  isLoading: false,
  // puedes eliminar 'error' si ya no lo usas en el UI
  error: null,

  checkAuth: async () => {

    const authErr = consumeAuthError();
  if (authErr && window.location.pathname.startsWith("/login")) {
    toastAuthError(authErr);
  }
    set({ isCheckingAuth: true, error: null });
    try {
      const { data } = await api.get(`${API}/me`);
      set({ user: data.user, isAuthenticated: true, isCheckingAuth: false });
    } catch {
      set({ user: null, isAuthenticated: false, isCheckingAuth: false });
    }
  },

  login: async (email, password, recaptchaToken) => {
    set({ isLoading: true, error: null });
    try {
      await api.post(`${API}/login`, { email, password, recaptchaToken });
      const { data } = await api.get(`${API}/me`);
      queryClient.clear();         
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      toast.success(i18n.t("auth.toasts.loginSuccess"));
      return data.user;
    } catch (err) {
      set({ isLoading: false, error: null });
      if (err?.response?.status === 403) {
       toast.error(i18n.t("auth.toasts.accessRestricted"));
       window.location.href = "/eligibility?need=domain";
       } else if (err?.response?.status === 429) {
      // Deja que el componente maneje el 429 (toast + cooldown)
       rateToast(err); 
     throw err;
     } else {
       toast.error(extract(err,  i18n.t("auth.toasts.loginFailed")));
     }
      throw err;
    }
  },

  signup: async (name, email, password, recaptchaToken, role = "doctor") => {
    set({ isLoading: true, error: null });
    try {
      await api.post(`${API}/register`, { name, email, password, recaptchaToken, role });
      const { data } = await api.get(`${API}/me`);
      queryClient.clear();         
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      toast.success(i18n.t("auth.toasts.signupSuccess"));
      return data.user;
    } catch (err) {
      set({ isLoading: false, error: null });
      if (err?.response?.status === 403) {
       toast.error(i18n.t("auth.toasts.accessRestricted"));
       window.location.href = "/eligibility?need=domain";
     } else if (err?.response?.status === 409) {
       toast.error(extract(err, i18n.t("auth.toasts.userExists")));
       } else if (err?.response?.status === 429) {
      // Deja que el componente maneje el 429 (toast + cooldown)
        rateToast(err);
      throw err;
     } else {
       toast.error(extract(err,  i18n.t("auth.toasts.signupFailed")));
     }
      throw err;
    }
  },

  logout: async () => {
    try { await api.post(`${API}/logout`); } catch {}
    queryClient.clear();         
    set({ user: null, isAuthenticated: false });
    toast.success(i18n.t("auth.toasts.logout"));
  },

  verifyEmail: async (code) => {
    set({ isLoading: true, error: null });
    try {
      await api.post(`${API}/verify-email`, { code });
      const { data } = await api.get(`${API}/me`);
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      toast.success(i18n.t("auth.toasts.emailVerified"));
      return true;
    } catch (err) {
      set({ isLoading: false, error: null });
      toast.error(extract(err, i18n.t("auth.toasts.verificationFailed")));
      throw err;
    }
  },

  resendCode: async () => {
    try {
      await api.post(`${API}/resend-code`);
      toast.success(i18n.t("auth.toasts.codeResent"));
      return true;
    } catch (err) {
      if (err?.response?.status === 429){  rateToast(err);  throw err; } 
      toast.error(extract(err, i18n.t("auth.toasts.codeResendFailed")));
      throw err;
    }
  },

  forgotPassword: async (email) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post(`${API}/forgot-password`, { email });
      set({ isLoading: false });
      toast.success(i18n.t("auth.toasts.forgotSent"));
      return data;
    } catch (err) {
      set({ isLoading: false, error: null });
      if (err?.response?.status === 429) {  rateToast(err);  throw err; } 
      toast.error(extract(err, i18n.t("auth.toasts.forgotFailed")));
      throw err;
    }
  },

  verifyResetCode: async (email, code) => {
  set({ isLoading: true, error: null });
  try {
    const { data } = await api.post(`${API}/verify-reset-code`, { email, code });
    set({ isLoading: false });
    return data; // { success, token }
  } catch (err) {
    set({ isLoading: false, error: null });
    if (err?.response?.status === 429) { rateToast(err); throw err; }
    toast.error(extract(err, i18n.t("auth.toasts.verificationFailed")));
    throw err;
  }
},


  resetPassword: async (token, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post(`${API}/reset-password/${token}`, { password });
      set({ isLoading: false });
      toast.success(i18n.t("auth.toasts.passwordUpdated"));
      return data;
    } catch (err) {
      set({ isLoading: false, error: null });
      if (err?.response?.status === 429) {  rateToast(err);  throw err; }
      toast.error(extract(err, i18n.t("auth.toasts.resetFailed")));
      throw err;
    }
  },
  // Nueva: valida captcha -> deja cookie -> redirige a Google
 /* googleStart: async (recaptchaToken) => {
    try{
    await api.post(`${API}/google/recaptcha`, { recaptchaToken });
    window.location.href = `${API}/google/init`;
    } catch (err) {
      if (err?.response?.status === 429) {  rateToast(err);  throw err; }
      toast.error(extract(err, i18n.t("auth.toasts.googleFailed")));
      throw err;
    }
  },*/

  // src/stores/authStore.js

 googleStart: async (recaptchaToken) => {
    try {
      // 1. Validar captcha con Axios (Usa la variable API correctamente)
      await api.post(`${API}/google/recaptcha`, { recaptchaToken });

      // 2. Redirigir a Google (Necesitamos la ruta ABSOLUTA del backend)
      // En local es el puerto 5001, en Render es "/api"
      const target = import.meta.env.MODE === "development"
        ? "http://localhost:5001/api/auth/google/init"
        : "/api/auth/google/init"; // <--- ¡AQUÍ ESTÁ LA CLAVE! (Faltaba el /api)

      window.location.href = target;
    } catch (err) {
      if (err?.response?.status === 429) { rateToast(err); throw err; }
      toast.error(extract(err, i18n.t("auth.toasts.googleFailed")));
      throw err;
    }
  },

   // Paso intermedio: leer datos "pending" (email, foto, allowDoctor)
  getGooglePending: async () => {
    const { data } = await api.get(`${API}/google/pending`);
    return data; // { email, name, picture, allowDoctor }
  },

  // Finalizar elección de rol y quedar logueado
  finalizeGoogleRole: async (role) => {
    try {
      await api.post(`${API}/google/finalize`, { role });
      const { data } = await api.get(`${API}/me`);
      queryClient.clear();
      set({ user: data.user, isAuthenticated: true });
      return data.user;
    } catch (err) {
      if (err?.response?.status === 429) { rateToast(err); throw err; }
      throw err;
    }
  },
  
   updateProfile: async (payload) => {
    try {
      const { data } = await api.put(`${API}/profile`, payload);
      // Actualiza el store con lo devuelto por el backend
      set({ user: data.user });
      toast.success(i18n.t("auth.toasts.profileUpdated"));
      return data.user;
    } catch (err) {
      toast.error(i18n.t("auth.toasts.updateFailed"));
      throw err;
    }
  },

  deleteMe: async () => {
    try {
      await api.delete(`${API}/me`);
      // Limpia estado local
      set({ user: null, isAuthenticated: false });
      toast.success(i18n.t("auth.toasts.accountDeleted"));
      // Opcional: navigate home
      window.location.href = "/login";
    } catch (err) {
      toast.error(i18n.t("auth.toasts.deleteFailed"));
      throw err;
    }
  },

  uploadAvatar: async (file) => {
    const fd = new FormData();
    fd.append("avatar", file);
    try {
      const { data } = await api.put(`${API}/profile/avatar`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      set({ user: data.user });
      toast.success(i18n.t("auth.toasts.photoUpdated"));
      return data.user;
    } catch (err) {
      toast.error(i18n.t("auth.toasts.uploadFailed"));
      throw err;
    }
  },

  importAvatarByUrl: async (url) => {
    try {
      const { data } = await api.post(`${API}/profile/avatar-url`, { url });
      set({ user: data.user });
      toast.success(i18n.t("auth.toasts.photoUpdated"));
      return data.user;
    } catch (err) {
      toast.error(i18n.t("auth.toasts.importFailed"));
      throw err;
    }
  }
}),

{
  name: "drvips-auth",
  storage: createJSONStorage(() => localStorage),
  // guarda solo lo que importa para hidratar rápido
  partialize: (s) => ({ user: s.user, isAuthenticated: s.isAuthenticated }),
}
));
