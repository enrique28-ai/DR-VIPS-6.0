// src/components/auth/RequireVerified.jsx
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore.js";

export default function RequireVerified({ children }) {
  const { user, isCheckingAuth } = useAuthStore();
  if (isCheckingAuth) return null;
  return user?.isVerified ? children : <Navigate to="/verify-email" replace />;
}
