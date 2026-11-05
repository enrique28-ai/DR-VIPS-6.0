// src/stores/authStore.js
import { create } from "zustand";
import api from "../lib/axios.js";
import toast from "react-hot-toast";
import { queryClient } from "../lib/queryClient.js";
import { persist, createJSONStorage } from "zustand/middleware";
import { identityGeneration, isCurrentIdentity, invalidateIdentity, validationRound,
  ownsValidation, finishValidation, queueSessionMutation, pendingSessionMutation, ownsMutation, supersedeValidation } from "../lib/authSession.js";
import i18n from "../i18n";


const API = import.meta.env.MODE === "development" ? "http://localhost:5001/api/auth" : "/auth";
let googleStartPromise;


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

const superseded = () => Object.assign(new Error("Auth operation superseded"), { code: "AUTH_SUPERSEDED" });
const validUser = (user) => user && typeof user === "object" && !Array.isArray(user) &&
  typeof (user._id || user.id) === "string" && Boolean(user._id || user.id) &&
  ["doctor", "patient"].includes(user.role) && typeof user.isVerified === "boolean";

export const useAuthStore = create(persist((set, get) => {
  let logoutFlight = null;
  const cleared = { user: null, isAuthenticated: false, isCheckingAuth: false };
  const validate = (options) => {
    const record = validationRound(options);
    if (record.promise) return record.promise;
    // Install the Promise before set() notifies subscribers/reentrant callers.
    record.promise = Promise.resolve().then(async () => {
      try {
        const { data } = await api.get(`${API}/me`);
        if (!ownsValidation(record)) return { status: "superseded" };
        if (!validUser(data?.user)) throw new Error("Invalid auth response");
        set({ user: data.user, isAuthenticated: true, isCheckingAuth: false });
        return { status: "authenticated", user: data.user, record };
      } catch (error) {
        if (!ownsValidation(record)) return { status: "superseded" };
        set(cleared);
        return { status: error?.response?.status === 401 ? "unauthenticated" : "unavailable", error };
      } finally {
        finishValidation(record);
      }
    });
    set({ isCheckingAuth: true, error: null });
    return record.promise;
  };
  const postWriteUser = async (owner) => {
    if (!ownsMutation(owner)) throw superseded();
    const result = await validate({ fresh: true });
    if (!ownsMutation(owner) || result.status === "superseded") throw superseded();
    if (result.status !== "authenticated") throw result.error || new Error("Authentication unavailable");
    owner.validation = result.record;
    return { data: { user: result.user } };
  };
  const sessionAction = (work, { logout = false, preserve = false } = {}) => {
    if (logout && logoutFlight && ownsMutation(logoutFlight.owner)) return logoutFlight.promise;
    const hadPendingValidation = get().isCheckingAuth;
    const record = queueSessionMutation(async (owner) => {
      const guardedSet = (state) => { if (ownsMutation(owner)) set(state); };
      try {
        return await work(guardedSet, owner);
      } catch (error) {
        if (ownsMutation(owner) && error?.response?.status === 401) get().invalidateSession(owner.generation);
        else if (ownsMutation(owner) && !preserve) set(cleared);
        throw error;
      } finally {
        if (ownsMutation(owner)) set({ isLoading: false });
      }
    }, !preserve);
    record.owner.logout = logout;
    set(preserve && !hadPendingValidation
      ? { isLoading: true, error: null }
      : { ...cleared, isCheckingAuth: !logout && !preserve, isLoading: !logout, error: null });
    if (logout) {
      queryClient.clear();
      logoutFlight = record;
      record.promise.finally(() => { if (logoutFlight === record) logoutFlight = null; }).catch(() => {});
    }
    return record.promise;
  };
  return {
  user: null,
  isAuthenticated: false,
  isCheckingAuth: true,
  isLoading: false,
  error: null,

  invalidateSession: (owner) => {
    if (!isCurrentIdentity(owner)) return;
    invalidateIdentity();
    queryClient.clear();
    set({ ...cleared, isLoading: false });
  },

  checkAuth: (options) => {
    const authErr = consumeAuthError();
    if (authErr && window.location.pathname.startsWith("/login")) toastAuthError(authErr);
    const pending = pendingSessionMutation();
    if (pending) {
      if (!ownsMutation(pending.owner)) return Promise.resolve({ status: "superseded" });
      // Waiters belong to the lifecycle they observed, never its replacement.
      const revalidate = () => ownsMutation(pending.owner)
        ? get().checkAuth({ ...options, fresh: true })
        : { status: "superseded" };
      if (pending.owner.logout) {
        pending.validationWait ||= pending.promise.then(() => ({
          status: ownsMutation(pending.owner) ? "unauthenticated" : "superseded",
        }));
        return pending.validationWait;
      }
      if (options?.fresh) {
        supersedeValidation();
        set({ isCheckingAuth: true });
        return pending.promise.catch(() => {}).then(revalidate);
      }
      // A preserved pre-mutation user is not validation for a new navigation.
      // Only this operation's successful post-write /me can satisfy the waiter.
      set({ isCheckingAuth: true });
      pending.validationWait ||= pending.promise.then(
        () => {
          if (ownsMutation(pending.owner) && ownsValidation(pending.owner.validation)) {
            set({ isCheckingAuth: false });
            return { status: "authenticated", user: get().user };
          }
          return revalidate();
        },
        revalidate,
      );
      return pending.validationWait;
    }
    return validate(options);
  },

  login: (email, password, captchaToken) => sessionAction(async (set, owner) => {
    set({ isLoading: true, error: null });
    try {
      await api.post(`${API}/login`, { email, password, captchaToken });
      if (!ownsMutation(owner)) throw superseded();
      queryClient.clear();
      const { data } = await postWriteUser(owner);
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      toast.success(i18n.t("auth.toasts.loginSuccess"));
      return data.user;
    } catch (err) {
      if (!ownsMutation(owner)) throw superseded();
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
  }),

  signup: (name, email, password, captchaToken, role = "doctor") => sessionAction(async (set, owner) => {
    set({ isLoading: true, error: null });
    try {
      await api.post(`${API}/register`, { name, email, password, captchaToken, role });
      if (!ownsMutation(owner)) throw superseded();
      queryClient.clear();
      const { data } = await postWriteUser(owner);
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      toast.success(i18n.t("auth.toasts.signupSuccess"));
      return data.user;
    } catch (err) {
      if (!ownsMutation(owner)) throw superseded();
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
  }),

  logout: () => sessionAction(async (_set, owner) => {
    try { await api.post(`${API}/logout`); } catch {}
    if (!ownsMutation(owner)) return;
    toast.success(i18n.t("auth.toasts.logout"));
  }, { logout: true }),

  verifyEmail: (code) => sessionAction(async (set, owner) => {
    set({ isLoading: true, error: null });
    try {
      await api.post(`${API}/verify-email`, { code });
      const { data } = await postWriteUser(owner);
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      toast.success(i18n.t("auth.toasts.emailVerified"));
      return true;
    } catch (err) {
      if (!ownsMutation(owner)) throw superseded();
      set({ isLoading: false, error: null });
      toast.error(extract(err, i18n.t("auth.toasts.verificationFailed")));
      throw err;
    }
  }, { preserve: true }),

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


  resetPassword: (token, password) => sessionAction(async (set, owner) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post(`${API}/reset-password/${token}`, { password });
      if (!ownsMutation(owner)) throw superseded();
      get().invalidateSession(owner.generation);
      set({ isLoading: false });
      toast.success(i18n.t("auth.toasts.passwordUpdated"));
      return data;
    } catch (err) {
      if (!ownsMutation(owner)) throw superseded();
      set({ isLoading: false, error: null });
      if (err?.response?.status === 429) {  rateToast(err);  throw err; }
      toast.error(extract(err, i18n.t("auth.toasts.resetFailed")));
      throw err;
    }
  }, { preserve: true }),

 googleStart: (captchaToken) => {
    if (googleStartPromise) return googleStartPromise;
    googleStartPromise = (async () => {
      try {
        const { data } = await api.post(`${API}/google/recaptcha`, { captchaToken });
        const target = new URL(data?.url);
        if (target.origin !== "https://accounts.google.com" || target.pathname !== "/o/oauth2/v2/auth") {
          throw new Error("Invalid Google authorization URL");
        }
        window.location.href = target.href;
      } catch (err) {
        if (err?.response?.status === 429) { rateToast(err); throw err; }
        toast.error(extract(err, i18n.t("auth.toasts.googleFailed")));
        throw err;
      } finally {
        googleStartPromise = undefined;
      }
    })();
    return googleStartPromise;
  },

   // Paso intermedio: leer datos "pending" (email, foto, allowDoctor)
  getGooglePending: async () => {
    const { data } = await api.get(`${API}/google/pending`);
    return data; // { email, name, picture, allowDoctor }
  },

  // Finalizar elección de rol y quedar logueado
  finalizeGoogleRole: (role) => sessionAction(async (set, owner) => {
    try {
      await api.post(`${API}/google/finalize`, { role });
      if (!ownsMutation(owner)) throw superseded();
      queryClient.clear();
      const { data } = await postWriteUser(owner);
      set({ user: data.user, isAuthenticated: true });
      return data.user;
    } catch (err) {
      if (!ownsMutation(owner)) throw superseded();
      if (err?.response?.status === 429) { rateToast(err); throw err; }
      throw err;
    }
  }),

   updateProfile: async (payload) => {
    const owner = identityGeneration();
    try {
      const { data } = await api.put(`${API}/profile`, payload);
      // Actualiza el store con lo devuelto por el backend
      if (!isCurrentIdentity(owner) || !get().isAuthenticated) throw superseded();
      set({ user: data.user });
      toast.success(i18n.t("auth.toasts.profileUpdated"));
      return data.user;
    } catch (err) {
      if (!isCurrentIdentity(owner) || !get().isAuthenticated) throw superseded();
      toast.error(i18n.t("auth.toasts.updateFailed"));
      throw err;
    }
  },

  deleteMe: () => sessionAction(async (set, owner) => {
    try {
      await api.delete(`${API}/me`);
      if (!ownsMutation(owner)) throw superseded();
      get().invalidateSession(owner.generation);
      // Limpia estado local
      set({ user: null, isAuthenticated: false });
      toast.success(i18n.t("auth.toasts.accountDeleted"));
      // Opcional: navigate home
      window.location.href = "/login";
    } catch (err) {
      if (!ownsMutation(owner)) throw superseded();
      toast.error(i18n.t("auth.toasts.deleteFailed"));
      throw err;
    }
  }, { preserve: true }),

  uploadAvatar: async (file) => {
    const owner = identityGeneration();
    const fd = new FormData();
    fd.append("avatar", file);
    try {
      const { data } = await api.put(`${API}/profile/avatar`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (!isCurrentIdentity(owner) || !get().isAuthenticated) throw superseded();
      set({ user: data.user });
      toast.success(i18n.t("auth.toasts.photoUpdated"));
      return data.user;
    } catch (err) {
      if (!isCurrentIdentity(owner) || !get().isAuthenticated) throw superseded();
      toast.error(i18n.t("auth.toasts.uploadFailed"));
      throw err;
    }
  },

  importAvatarByUrl: async (url) => {
    const owner = identityGeneration();
    try {
      const { data } = await api.post(`${API}/profile/avatar-url`, { url });
      if (!isCurrentIdentity(owner) || !get().isAuthenticated) throw superseded();
      set({ user: data.user });
      toast.success(i18n.t("auth.toasts.photoUpdated"));
      return data.user;
    } catch (err) {
      if (!isCurrentIdentity(owner) || !get().isAuthenticated) throw superseded();
      toast.error(i18n.t("auth.toasts.importFailed"));
      throw err;
    }
  }
};
},

{
  name: "drvips-auth",
  storage: createJSONStorage(() => localStorage),
  // guarda solo lo que importa para hidratar rápido
  partialize: (s) => ({ user: s.user, isAuthenticated: s.isAuthenticated }),
}
));
