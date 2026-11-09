// src/stores/authStore.js
import { create } from "zustand";
import api from "../lib/axios.js";
import toast from "react-hot-toast";
import { queryClient } from "../lib/queryClient.js";
import { persist, createJSONStorage } from "zustand/middleware";
import { identityGeneration, isCurrentIdentity, invalidateIdentity, validationRound,
  ownsValidation, finishValidation, replaceValidationIdentity, queueSessionMutation, pendingSessionMutation, ownsMutation, supersedeValidation } from "../lib/authSession.js";
import i18n from "../i18n";
import { announceSessionChange, sessionEventKey } from "../lib/sessionSync.js";


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

const avatarErrorToast = (err, fallback) => {
  const status = err?.response?.status;
  if (status === 429) return rateToast(err);
  const errors = {
    AVATAR_INVALID_URL: "auth.profile.errors.invalidAvatarUrl",
    AVATAR_URL_UNAVAILABLE: "auth.profile.errors.avatarUrlUnavailable",
    AVATAR_INVALID_IMAGE: "auth.profile.errors.invalidImage",
    AVATAR_TIMEOUT: "auth.profile.errors.avatarTimeout",
  };
  const code = err?.response?.data?.errorCode;
  const timeout = ["ECONNABORTED", "ETIMEDOUT"].includes(err?.code);
  const key = status === 413 ? "auth.profile.errors.maxSize" :
    timeout ? errors.AVATAR_TIMEOUT : Object.hasOwn(errors, code) ? errors[code] : fallback;
  toast.error(i18n.t(key));
};

const superseded = () => Object.assign(new Error("Auth operation superseded"), { code: "AUTH_SUPERSEDED" });
const validUser = (user) => user && typeof user === "object" && !Array.isArray(user) &&
  typeof (user._id || user.id) === "string" && Boolean(user._id || user.id) &&
  ["doctor", "patient"].includes(user.role) && typeof user.isVerified === "boolean";
const sameIdentity = (a, b) => a && b && (a._id || a.id) === (b._id || b.id) && a.role === b.role;
const guardianQueries = new Set([
  "my-children-health-info", "child-history", "child-diagnoses", "child-diagnosis", "child-diagnosis-history",
  "appointments", "my-patient-access-requests",
]);
const logoutKey = "drvips-logout-unconfirmed";
let logoutBlocked = false;
let logoutStorageWriteFailed = false;
const hasLogoutIntent = () => {
  if (!logoutStorageWriteFailed) {
    try { logoutBlocked = sessionStorage.getItem(logoutKey) === "1"; }
    catch { /* Keep the last known intent when storage is unavailable. */ }
  }
  return logoutBlocked;
};
const setLogoutIntent = (blocked) => {
  logoutBlocked = blocked;
  try {
    if (blocked) sessionStorage.setItem(logoutKey, "1");
    else sessionStorage.removeItem(logoutKey);
    logoutStorageWriteFailed = false;
  } catch {
    // Keep the current document blocked even when tab storage is unavailable.
    logoutStorageWriteFailed = true;
  }
};

export const useAuthStore = create(persist((set, get) => {
  let logoutFlight = null;
  let sessionSync = null;
  let avatarRevision = 0;
  const syncEvents = new WeakMap();
  const guardianRestores = new WeakSet();
  const cleared = { user: null, isAuthenticated: false, isCheckingAuth: false };
  const closeForLogout = () => {
    sessionSync = null;
    const { user, isAuthenticated, isCheckingAuth } = get();
    if (user || isAuthenticated) {
      invalidateIdentity();
      queryClient.clear();
    }
    if (user || isAuthenticated || isCheckingAuth) set({ ...cleared, isLoading: false });
    return { status: "unauthenticated" };
  };
  const validate = (options) => {
    const record = validationRound(options);
    if (record.promise) return record.promise;
    const startedAvatarRevision = avatarRevision;
    // Install the Promise before set() notifies subscribers/reentrant callers.
    record.promise = Promise.resolve().then(async () => {
      try {
        const { data } = await api.get(`${API}/me`);
        if (!ownsValidation(record)) return { status: "superseded" };
        if (hasLogoutIntent() && !options?.newLogin) return closeForLogout();
        if (!validUser(data?.user)) throw new Error("Invalid auth response");
        const previous = get().user;
        const identityChanged = previous && (!sameIdentity(previous, data.user) ||
          (previous.isVerified && !data.user.isVerified));
        if (identityChanged) {
          if (!replaceValidationIdentity(record)) return { status: "superseded" };
          queryClient.clear();
        }
        if (options?.newLogin && ownsMutation(options.newLogin)) setLogoutIntent(false);
        // A same-account read started before a confirmed avatar write may carry the old photo.
        const user = previous && !identityChanged && startedAvatarRevision !== avatarRevision
          ? { ...data.user, avatar: previous.avatar }
          : data.user;
        set({ user, isAuthenticated: true, isCheckingAuth: Boolean(sessionSync && options?.sessionSync !== sessionSync),
          ...(identityChanged ? { isLoading: false } : {}) });
        return { status: "authenticated", user, record };
      } catch (error) {
        if (!ownsValidation(record)) return { status: "superseded" };
        if (get().user || get().isAuthenticated) replaceValidationIdentity(record);
        queryClient.clear();
        set({ ...cleared, isCheckingAuth: Boolean(sessionSync && options?.sessionSync !== sessionSync), isLoading: false });
        return { status: error?.response?.status === 401 ? "unauthenticated" : "unavailable", error };
      } finally {
        finishValidation(record);
      }
    });
    set({ isCheckingAuth: true, error: null });
    return record.promise;
  };
  const postWriteUser = async (owner, newLogin = false) => {
    if (!ownsMutation(owner)) throw superseded();
    if (hasLogoutIntent() && !newLogin) throw superseded();
    const result = await validate({ fresh: true, newLogin: newLogin ? owner : undefined });
    if (!ownsMutation(owner) || result.status === "superseded") throw superseded();
    if (result.status !== "authenticated") throw result.error || new Error("Authentication unavailable");
    owner.validation = result.record;
    return { data: { user: result.user } };
  };
  const sessionAction = (work, { logout = false, preserve = false } = {}) => {
    if (logout && logoutFlight && ownsMutation(logoutFlight.owner)) return logoutFlight.promise;
    // A hint received before explicit logout must not start another login check.
    if (logout) {
      setLogoutIntent(true);
      sessionSync = null;
    }
    const hadPendingValidation = get().isCheckingAuth;
    const discardIdentity = !preserve || hadPendingValidation;
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
    }, discardIdentity);
    record.owner.logout = logout;
    if (discardIdentity) queryClient.clear();
    set(!discardIdentity
      ? { isLoading: true, error: null }
      : { ...cleared, isCheckingAuth: !logout && !preserve, isLoading: !logout, error: null });
    if (logout) {
      logoutFlight = record;
      record.promise.finally(() => { if (logoutFlight === record) logoutFlight = null; }).catch(() => {});
    }
    return record.promise;
  };
  const checkSnapshot = (owner, user) => {
    if (!isCurrentIdentity(owner) || !get().isAuthenticated) throw superseded();
    if (!validUser(user) || !sameIdentity(get().user, user) || get().user.isVerified !== user.isVerified) {
      void get().syncSession();
      throw superseded();
    }
  };
  const publishProfileUser = (owner, user, { avatarRequired = false } = {}) => {
    checkSnapshot(owner, user);
    if (avatarRequired && (typeof user.avatar !== "string" || !user.avatar)) {
      throw new Error("Avatar is missing from profile response");
    }
    if (avatarRequired || user.avatar !== get().user.avatar) avatarRevision += 1;
    set({ user });
  };
  const saveAvatar = async (request, fallback) => {
    const owner = identityGeneration();
    try {
      const { data } = await request();
      publishProfileUser(owner, data.user, { avatarRequired: true });
      toast.success(i18n.t("auth.toasts.photoUpdated"));
      return data.user;
    } catch (err) {
      if (!isCurrentIdentity(owner) || !get().isAuthenticated) throw superseded();
      if (err?.code !== "AUTH_SUPERSEDED") avatarErrorToast(err, fallback);
      throw err;
    }
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
    set({ ...cleared, isCheckingAuth: Boolean(sessionSync), isLoading: false });
  },

  checkAuth: (options) => {
    const authErr = consumeAuthError();
    if (authErr && window.location.pathname.startsWith("/login")) toastAuthError(authErr);
    const pending = pendingSessionMutation();
    if (hasLogoutIntent() && (!pending || pending.owner.logout)) return Promise.resolve(closeForLogout());
    if (sessionSync && options?.sessionSync !== sessionSync) return sessionSync.promise;
    if (pending) {
      if (!ownsMutation(pending.owner)) return Promise.resolve({ status: "superseded" });
      // Waiters belong to the lifecycle they observed, never its replacement.
      const revalidate = () => ownsMutation(pending.owner)
        ? get().checkAuth({ ...options, fresh: true })
        : { status: "superseded" };
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
          if (sessionSync) return sessionSync.promise;
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

  syncSession: ({ event, ...options } = {}) => {
    const pending = pendingSessionMutation();
    if (hasLogoutIntent() && (!pending || pending.owner.logout)) {
      return Promise.resolve({ ...closeForLogout(), synchronized: true });
    }
    if (event?.type === "pageshow" && event.persisted && get().user?.role === "patient" && !guardianRestores.has(event)) {
      guardianRestores.add(event);
      // The document may have been frozen on a public route with guardian data cached.
      queryClient.removeQueries({ predicate: ({ queryKey }) => guardianQueries.has(queryKey[0]) });
    }
    const key = sessionEventKey(event);
    if (key && syncEvents.has(key)) return syncEvents.get(key);
    const interruptedQueries = sessionSync?.interruptedQueries || new Set();
    for (const query of queryClient.getQueryCache().findAll({ predicate: ({ state }) => state.fetchStatus !== "idle" })) {
      interruptedQueries.add(query);
    }
    const record = { promise: null, interruptedQueries };
    if (!pendingSessionMutation()) supersedeValidation();
    sessionSync = record;
    record.promise = Promise.resolve().then(async () => {
      // Cookie-changing writes remain ordered. Their intermediate /me cannot
      // release the global gate while this newer synchronization is pending.
      while (sessionSync === record) {
        let pending;
        while ((pending = pendingSessionMutation())) {
          await pending.promise.catch(() => {});
          if (sessionSync !== record) return { status: "superseded", synchronized: true };
        }
        if (sessionSync !== record) return { status: "superseded", synchronized: true };
        const result = await get().checkAuth({ ...options, fresh: true, sessionSync: record });
        // A local identity invalidation can supersede this request while the
        // shared cookie is already valid for another account. Recheck only
        // lost ownership; actual unauthorized/unavailable outcomes stay closed.
        if (sessionSync !== record) break;
        if (result.status === "superseded" || (result.status === "authenticated" && !ownsValidation(result.record))) continue;
        if (result.status === "authenticated" && interruptedQueries.size) {
          // Mounted pages do not restart a cancelled first load on their own.
          // Removed queries from a replaced identity cannot match by object.
          void queryClient.refetchQueries({ type: "active", predicate: (query) => interruptedQueries.has(query) },
            { cancelRefetch: false });
        }
        sessionSync = null;
        return { ...result, synchronized: true };
      }
      return { status: "superseded", synchronized: true };
    }).catch((error) => {
      if (sessionSync !== record) return { status: "superseded", synchronized: true };
      sessionSync = null;
      invalidateIdentity();
      queryClient.clear();
      set({ ...cleared, isLoading: false });
      return { status: "unavailable", error, synchronized: true };
    });
    if (key) syncEvents.set(key, record.promise);
    set({ isCheckingAuth: true });
    void Promise.resolve(queryClient.cancelQueries?.()).catch(() => {});
    return record.promise;
  },

  login: (email, password, captchaToken) => sessionAction(async (set, owner) => {
    set({ isLoading: true, error: null });
    try {
      await api.post(`${API}/login`, { email, password, captchaToken });
      announceSessionChange();
      if (!ownsMutation(owner)) throw superseded();
      queryClient.clear();
      const { data } = await postWriteUser(owner, true);
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
      announceSessionChange();
      if (!ownsMutation(owner)) throw superseded();
      queryClient.clear();
      const { data } = await postWriteUser(owner, true);
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
    let confirmed = false;
    try {
      await api.post(`${API}/logout`);
      announceSessionChange();
      confirmed = true;
    } catch {
      // Local logout remains complete even when server sign-out is unconfirmed.
    }
    if (!ownsMutation(owner)) return;
    if (confirmed) {
      setLogoutIntent(false);
      toast.success(i18n.t("auth.toasts.logout"));
    }
    else toast.error(i18n.t("auth.toasts.logoutUnconfirmed"));
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
        // The full-page OAuth return has no client proof of a new cookie. First
        // confirm removal of the old one when this tab is signed out locally.
        if (hasLogoutIntent()) {
          await get().logout();
          if (hasLogoutIntent()) throw superseded();
        }
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
      announceSessionChange();
      if (!ownsMutation(owner)) throw superseded();
      queryClient.clear();
      const { data } = await postWriteUser(owner, true);
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
      publishProfileUser(owner, data.user);
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
      announceSessionChange();
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
    const fd = new FormData();
    fd.append("avatar", file);
    return saveAvatar(
      () => api.put(`${API}/profile/avatar`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      }),
      "auth.toasts.uploadFailed",
    );
  },

  importAvatarByUrl: (url) => saveAvatar(
    () => api.post(`${API}/profile/avatar-url`, { url }),
    "auth.toasts.importFailed",
  ),
};
},

{
  name: "drvips-auth",
  storage: createJSONStorage(() => localStorage),
  merge: (persisted, current) => hasLogoutIntent() ? current : { ...current, ...persisted },
  // guarda solo lo que importa para hidratar rápido
  partialize: (s) => ({ user: s.user, isAuthenticated: s.isAuthenticated }),
}
));
