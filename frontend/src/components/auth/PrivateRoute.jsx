// src/components/auth/PrivateRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore.js";
import { useState, useEffect, useRef } from "react";

export default function PrivateRoute({ children }) {
  const location = useLocation();
  const navigationKey = `${location.pathname}:${location.key}`;
  const { isAuthenticated, isCheckingAuth, checkAuth } = useAuthStore();
  const [validatedPath, setValidatedPath] = useState(null);
  const guard = useRef(Symbol("private-navigation"));
  const waiter = useRef(0);
  const [showLoader, setShowLoader] = useState(false);
  const [blockingBF, setBlockingBF] = useState(false);
  const TopBar = () => (
  <div className="fixed left-0 right-0 top-0 h-0.5 bg-blue-600 animate-pulse z-[60]" />
);

  useEffect(() => {
    let alive = true;
    const ticket = ++waiter.current;
    const t = setTimeout(() => { if (alive) setShowLoader(true); }, 200);
    Promise.resolve(checkAuth({ location, guard: guard.current })).catch(() => {}).then(() => {
      if (alive && waiter.current === ticket) {
        setValidatedPath(navigationKey);
        setBlockingBF(false);
        setShowLoader(false);
      }
    });
    return () => { alive = false; clearTimeout(t); };
  }, [navigationKey, checkAuth]);

  useEffect(() => {
    let alive = true;
    const onShow = (e) => {
      if (e.persisted) {
        const ticket = ++waiter.current;
        setBlockingBF(true);
        Promise.resolve(checkAuth({ location, guard: guard.current, fresh: true })).catch(() => {}).then(() => {
          if (alive && waiter.current === ticket) {
            setValidatedPath(navigationKey);
            setBlockingBF(false);
            setShowLoader(false);
          }
        });
      }
    };
    window.addEventListener("pageshow", onShow);
    return () => { alive = false; window.removeEventListener("pageshow", onShow); };
  }, [checkAuth, navigationKey]);

  // opt-out de bfcache en vistas privadas (tener 'unload' deshabilita bfcache en Chromium/WebKit)
  useEffect(() => {
    const onUnload = () => {};
    window.addEventListener("unload", onUnload);
    return () => window.removeEventListener("unload", onUnload);
  }, []);


  if (validatedPath !== navigationKey || blockingBF || isCheckingAuth) return showLoader ? <TopBar /> : null;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}
