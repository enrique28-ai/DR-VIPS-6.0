// src/components/auth/AuthOnlyRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore.js";
import { useState, useEffect, useMemo, useRef } from "react";

export default function AuthOnlyRoute({ children }) {
  const { isAuthenticated, isCheckingAuth, checkAuth, user } = useAuthStore();
  const location = useLocation();
  const { pathname, key } = location;
  const validationLocation = useMemo(() => ({ pathname, key }), [pathname, key]);
  const guard = useRef(Symbol("auth-only-navigation"));
  const [checking, setChecking] = useState(true);
  const [showLoader, setShowLoader] = useState(false);

  const TopBar = () => (
  <div className="fixed left-0 right-0 top-0 h-0.5 bg-blue-600 animate-pulse z-[60]" />
);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => { if (alive) setShowLoader(true); }, 200);
    (async () => {
      try {
        if (useAuthStore.getState().isAuthenticated) {
          await checkAuth({ location: validationLocation, guard: guard.current });
        }
      } catch {
        // The auth store owns validation state and failure handling.
      }
      if (alive) {
        setChecking(false);
        setShowLoader(false);
      }
    })();
    return () => { alive = false; clearTimeout(t); };
   }, [checkAuth, validationLocation]);

   // re-verifica si volvemos con Back/Forward (bfcache)
  useEffect(() => {
    const onShow = (e) => {
      if (e.persisted && useAuthStore.getState().isAuthenticated) {
        useAuthStore.getState().syncSession({ event: e, location: validationLocation, guard: guard.current });
      }
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [validationLocation]);
   if (checking || (isAuthenticated && isCheckingAuth)) return showLoader ? <TopBar /> : null;
  if (isAuthenticated) {
    const dest =
      user?.role === "patient"
        ? "/docrecords/myhealthstate"
        : user?.role === "doctor"
          ? "/patients"
          : "/";
    return <Navigate to={dest} replace />;
  }
  return children;
}
