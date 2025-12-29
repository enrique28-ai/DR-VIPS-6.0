// src/components/auth/PrivateRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore.js";
import { useState, useEffect } from "react";

export default function PrivateRoute({ children }) {
  const location = useLocation();
  const { isAuthenticated, checkAuth } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const [showLoader, setShowLoader] = useState(false);
  const [blockingBF, setBlockingBF] = useState(false);
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
  }, [location.pathname]);


  useEffect(() => {
    const onShow = (e) => {
      if (e.persisted) {
        setBlockingBF(true);
        Promise.resolve(checkAuth()).finally(() => setBlockingBF(false));
      }
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [checkAuth]);

  // opt-out de bfcache en vistas privadas (tener 'unload' deshabilita bfcache en Chromium/WebKit)
  useEffect(() => {
    const onUnload = () => {};
    window.addEventListener("unload", onUnload);
    return () => window.removeEventListener("unload", onUnload);
  }, []);


  if (checking || blockingBF) return showLoader ? <TopBar /> : null;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

