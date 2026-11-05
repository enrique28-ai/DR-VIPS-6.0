import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

export default function NavigationAccount({ user, logout, onBeforeLogout }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (!user || typeof logout !== "function") return null;

  const identity = user.name || user.email || "User";
  const initial = (user.name?.[0] || user.email?.[0] || "U").toUpperCase();

  const handleLogout = async () => {
    onBeforeLogout?.();
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="shrink-0 border-t border-slate-200 p-3">
      <div className="flex min-w-0 items-center gap-3 px-2 py-1">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-800">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={`${identity} avatar`}
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span>{initial}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {user.name || user.email || "User"}
          </p>
          {user.email && (
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleLogout}
        className="mt-2 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
        {t("navbar.logout")}
      </button>
    </div>
  );
}
