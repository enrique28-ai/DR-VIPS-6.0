// src/components/auth/PrivateRoute.jsx
import { matchPath, Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore.js";
import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import { identityGeneration } from "../../lib/authSession.js";
import { ProtectedRouteContext } from "./ProtectedRouteContext.js";

const TopBar = () => (
  <div className="fixed left-0 right-0 top-0 h-0.5 bg-blue-600 animate-pulse z-[60]" />
);

export default function PrivateRoute({ children }) {
  const location = useLocation();
  const { pathname, key } = location;
  const validationLocation = useMemo(() => ({ pathname, key }), [pathname, key]);
  const navigationKey = `${pathname}:${key}`;
  const { user, isAuthenticated, isCheckingAuth, checkAuth, syncSession } = useAuthStore();
  const [validatedPath, setValidatedPath] = useState(null);
  const guard = useRef(Symbol("private-navigation"));
  const waiter = useRef(0);
  const [showLoader, setShowLoader] = useState(false);
  const [blockingBF, setBlockingBF] = useState(false);
  const revealed = useRef(null);
  const generation = identityGeneration();
  const pending = blockingBF || isCheckingAuth;
  const revealKey = `${generation}:${navigationKey}`;

  useLayoutEffect(() => {
    if (!pending && isAuthenticated && validatedPath === navigationKey) revealed.current = revealKey;
  }, [isAuthenticated, navigationKey, pending, revealKey, validatedPath]);

  useEffect(() => {
    let alive = true;
    const ticket = ++waiter.current;
    const t = setTimeout(() => { if (alive) setShowLoader(true); }, 200);
    Promise.resolve(checkAuth({ location: validationLocation, guard: guard.current })).catch(() => {}).then(() => {
      if (alive && waiter.current === ticket) {
        setValidatedPath(navigationKey);
        setBlockingBF(false);
        setShowLoader(false);
      }
    });
    return () => { alive = false; clearTimeout(t); };
  }, [navigationKey, checkAuth, validationLocation]);

  useLayoutEffect(() => {
    let alive = true;
    const onHide = () => {
      ++waiter.current;
      // Hide the document's protected content before it can be frozen.
      flushSync(() => setBlockingBF(true));
    };
    const onShow = (e) => {
      if (e.persisted) {
        const ticket = ++waiter.current;
        flushSync(() => setBlockingBF(true));
        Promise.resolve(syncSession({ event: e, location: validationLocation, guard: guard.current })).catch(() => {}).then(() => {
          if (alive && waiter.current === ticket) {
            setValidatedPath(navigationKey);
            setBlockingBF(false);
            setShowLoader(false);
          }
        });
      }
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    return () => {
      alive = false;
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
    };
  }, [syncSession, navigationKey, validationLocation]);

  const validated = validatedPath === navigationKey;
  const blocked = !validated || pending;
  if (!blocked && !isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  const keepMounted = validated && isAuthenticated && (!pending || revealed.current === revealKey);
  const restoringGuardianView = blockingBF && user?.role === "patient" && (
    matchPath("/docrecords/mychildren/*", pathname) || matchPath("/calendar", pathname) ||
    matchPath("/docrecords/access-requests", pathname)
  );
  return (
    <>
      {blocked && showLoader && <TopBar />}
      <div hidden={blocked} inert={blocked || undefined}>
        <ProtectedRouteContext.Provider key={generation} value>
          {keepMounted && !restoringGuardianView ? children : null}
        </ProtectedRouteContext.Provider>
      </div>
    </>
  );
}
