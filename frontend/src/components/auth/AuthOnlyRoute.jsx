// src/components/auth/AuthOnlyRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore.js";
import { useState, useEffect, useRef } from "react";

export default function AuthOnlyRoute({ children }) {
  const { isAuthenticated, isCheckingAuth, checkAuth, user } = useAuthStore();
  const location = useLocation();
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
          await checkAuth({ location, guard: guard.current });
        }
      } catch {}
      if (alive) {
        setChecking(false);
        setShowLoader(false);
      }
    })();
    return () => { alive = false; clearTimeout(t); };
   }, [checkAuth]);

   // re-verifica si volvemos con Back/Forward (bfcache)
  useEffect(() => {
    const onShow = (e) => {
      if (e.persisted && useAuthStore.getState().isAuthenticated) {
        useAuthStore.getState().checkAuth({ location, guard: guard.current, fresh: true });
      }
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
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
