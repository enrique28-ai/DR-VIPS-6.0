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
  ...rest
}) {
  const baseCommon =
    "relative inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white " +
    "disabled:cursor-not-allowed disabled:opacity-60 transition-colors duration-150";

  const variants = {
    primary:
      "bg-blue-600 text-white shadow-sm hover:bg-blue-700 focus-visible:ring-blue-500",
    secondary:
      "border border-blue-200 bg-white text-blue-700 shadow-sm hover:border-blue-300 hover:bg-blue-50 focus-visible:ring-blue-500",
    ghost:
      "bg-transparent text-blue-700 hover:bg-blue-50 focus-visible:ring-blue-500",
    danger:
      "bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-500",
  };

  const sizing = full ? " w-full px-4 py-2.5" : " px-4 py-2.5";

  return (
    <motion.button
      {...rest}
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
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current/40 border-t-current"
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
    </motion.button>
  );
}
