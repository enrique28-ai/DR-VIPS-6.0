import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { useContext } from "react";
import { ProtectedRouteContext } from "./ProtectedRouteContext.js";

export default function RequireRole({ allowed = [], children }) {
  const { user, isAuthenticated, isCheckingAuth } = useAuthStore();
  const loc = useLocation();
  const protectedByRoute = useContext(ProtectedRouteContext);

  if (isCheckingAuth && !protectedByRoute) return null;
  if (!isAuthenticated || !user) return <Navigate to="/login" state={{ from: loc }} replace />;

  return allowed.includes(user.role)
    ? children
    : <Navigate to={user.role === "patient" ? "/docrecords/myhealthstate" : "/patients"} replace />;
}
