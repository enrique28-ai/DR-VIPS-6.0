// src/components/auth/RequireVerified.jsx
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore.js";
import { useContext } from "react";
import { ProtectedRouteContext } from "./ProtectedRouteContext.js";

export default function RequireVerified({ children }) {
  const { user, isCheckingAuth } = useAuthStore();
  const protectedByRoute = useContext(ProtectedRouteContext);
  if (isCheckingAuth && !protectedByRoute) return null;
  return user?.isVerified ? children : <Navigate to="/verify-email" replace />;
}
