// src/components/forms/Button.jsx
import { motion } from "framer-motion";

export default function Button({
  children,
  type = "button",
  loading = false,
  disabled = false,
  className = "",
  full = true,
  onClick,
  variant = "primary", // "primary" | "secondary" | "ghost"
}) {
  const baseCommon =
    "relative inline-flex items-center justify-center rounded-lg font-semibold " +
    "focus:outline-none focus:ring-2 focus:ring-offset-2 " +
    "disabled:opacity-50 disabled:cursor-not-allowed transition";

  const variants = {
    primary:
      "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
    secondary:
      "bg-white text-blue-600 border border-blue-600 hover:bg-blue-50 focus:ring-blue-500",
    ghost:
      "bg-transparent text-blue-600 hover:bg-blue-50 focus:ring-blue-500",
    danger:
      "bg-red-600 hover:bg-red-700 text-white focus-visible:ring-red-500",
  };

  const sizing = full ? " w-full py-3 px-4" : " py-2.5 px-4";

  return (
    <motion.button
      type={type}
      onClick={onClick}
      whileHover={!disabled && !loading ? { scale: 1.01 } : undefined}
      whileTap={!disabled && !loading ? { scale: 0.99 } : undefined}
      aria-busy={loading}
      aria-disabled={disabled || loading}
      disabled={disabled || loading}
      className={`${baseCommon} ${variants[variant]} ${sizing} ${className}`}
    >
      {loading && (
        <span
          className="mr-2 inline-block h-5 w-5 animate-spin rounded-full border-2 border-current/40 border-t-current"
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
    </motion.button>
  );
}
