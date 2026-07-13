import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function UserMenu({ user, logout }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const avatarButtonRef = useRef(null);
  const menuId = "navbar-user-menu";

  useEffect(() => {
    const onClick = (e) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      avatarButtonRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const initial = (user?.name?.[0] || user?.email?.[0] || "U").toUpperCase();
  const firstName = (user?.name || user?.email || "User").split(/[ @]/)[0];
  const avatar = user?.avatar || "";

  const menuItemClass =
    "block min-h-10 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:bg-blue-50";

  return (
    <div className="relative flex items-center gap-2 sm:gap-3" ref={menuRef}>
      {user?.isVerified && (
        <span className="hidden max-w-[180px] truncate text-sm text-slate-600 sm:block">
          {t("navbar.hi")}{" "}
          <span className="font-semibold text-slate-900">{firstName}</span>
        </span>
      )}
      <button
        ref={avatarButtonRef}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white text-slate-900 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        aria-label={t("navbar.profile")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
      >
        {avatar ? (
          <img
            src={avatar}
            alt="avatar"
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="text-sm font-semibold">{initial}</span>
        )}
      </button>

      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl shadow-slate-900/10 ring-1 ring-black/5"
          role="menu"
        >
          {!user?.isVerified && (
            <button
              onClick={() => {
                setOpen(false);
                navigate("/verify-email");
              }}
              className={`${menuItemClass} w-full text-left`}
              role="menuitem"
            >
              {t("navbar.verifyEmail")}
            </button>
          )}

          {user?.isVerified && (
            <Link
              to="/profile"
              onClick={() => setOpen(false)}
              className={menuItemClass}
              role="menuitem"
            >
              {t("navbar.profile")}
            </Link>
          )}

          <button
            onClick={async () => {
              setOpen(false);
              await logout();
              navigate("/login", { replace: true });
            }}
            className={`${menuItemClass} w-full cursor-pointer border-t border-slate-100 text-left`}
            role="menuitem"
          >
            {t("navbar.logout")}
          </button>
        </div>
      )}
    </div>
  );
}
