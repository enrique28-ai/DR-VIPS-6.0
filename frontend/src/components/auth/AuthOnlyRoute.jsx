// src/components/auth/AuthOnlyRoute.jsx
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore.js";
import { useState, useEffect } from "react";

export default function AuthOnlyRoute({ children }) {
  const { isAuthenticated, checkAuth } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const [showLoader, setShowLoader] = useState(false);

  const TopBar = () => (
  <div className="fixed left-0 right-0 top-0 h-0.5 bg-blue-600 animate-pulse z-[60]" />
);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => { if (alive) setShowLoader(true); }, 200);
    (async () => {
      try { await checkAuth(); } catch {}
      if (alive) {
        setChecking(false);
        setShowLoader(false);
      }
    })();
    return () => { alive = false; clearTimeout(t); };
   }, []);

   // re-verifica si volvemos con Back/Forward (bfcache)
  useEffect(() => {
    const onShow = (e) => { if (e.persisted) useAuthStore.getState().checkAuth(); };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
   if (checking) return showLoader ? <TopBar /> : null;
  if (isAuthenticated) return <Navigate to="/patients" replace />;
  return children;
}

