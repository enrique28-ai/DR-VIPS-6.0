// src/components/Navbar.jsx
import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Stethoscope } from "lucide-react";        // 👈 ícono
import { useAuthStore } from "../stores/authStore.js";
import { LanguageSwitcher } from "./language/LanguageSwitcher.jsx";
import { useTranslation } from "react-i18next";


export default function Navbar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isAuthenticated, isCheckingAuth, logout } = useAuthStore();

  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  const initial = (user?.name?.[0] || user?.email?.[0] || "U").toUpperCase();
   const firstName =
    (user?.name || user?.email || "User").split(/[ @]/)[0];
  const avatar = user?.avatar || "";

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white/95 backdrop-blur shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2">
          <img 
            src="/dr-vips-logo.png" 
            alt="Dr-VIPS Logo" 
            className="h-14 w-auto"
          />
          <span className="text-lg font-semibold tracking-tight text-gray-900">
            DR-VIPS
          </span>
        </Link>

        {/* Right side */}
        {isCheckingAuth ? (
          // placeholder para evitar parpadeo
          <div className="flex items-center gap-3">
          <div className="h-9 w-[160px] rounded-full bg-gray-100 animate-pulse" />
            <LanguageSwitcher />
            </div>
        ) : !isAuthenticated ? (
          
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              to="/eligibility"
              className="hidden sm:inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {t("navbar.whoCanAccess")}
            </Link>
            <Link
              to="/login"
              className="px-4 py-2 rounded-full border border-gray-300 text-gray-800 hover:bg-gray-100"
            >
              {t("navbar.login")}
            </Link>
            <Link
              to="/signup"
              className="px-4 py-2 rounded-full bg-blue-600 text-white hover:bg-blue-700"
            >
              {t("navbar.register")}
            </Link>
          </div>
        ) : (
           <div className="flex items-center gap-3">
            <LanguageSwitcher />
          <div className="relative flex items-center gap-3" ref={menuRef}>
            {user?.isVerified && (
              <span className="hidden sm:block text-sm text-gray-700">
                {t("navbar.hi")}{" "} <span className="font-semibold">{firstName}</span>
              </span>
            )}
            <button
              onClick={() => setOpen((v) => !v)}
              className="h-9 w-9 rounded-full overflow-hidden border border-gray-300 bg-white flex items-center justify-center"
              aria-haspopup="menu"
              aria-expanded={open}
            >
              {avatar ? (
                <img
                  src={avatar}
                  alt="avatar"
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-sm font-semibold text-gray-900">{initial}</span>
              )}
            </button>

            {open && (
              <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl bg-white shadow-xl ring-1 ring-black/5 py-1"
                role="menu">
                {!user?.isVerified && (
                  <button
                    onClick={() => {
                      setOpen(false);
                      navigate("/verify-email");
                    }}
                    className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    role="menuitem"
                  >
                    {t("navbar.verifyEmail")}
                  </button>
                )}

                {user?.isVerified && (
                  <>
                    {user?.role === "patient" ? (
                      <>
                        <Link
                          to="/docrecords/myhealthstate"
                          onClick={() => setOpen(false)}
                          className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          role="menuitem"
                        >
                          {t("navbar.myHealthState")}
                        </Link>
                        <Link
                          to="/profile"
                          onClick={() => setOpen(false)}
                          className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          role="menuitem"
                        >
                          {t("navbar.profile")}
                        </Link>
                      </>
                    ) : (
                      <>
                        <Link
                          to="/patients"
                          onClick={() => setOpen(false)}
                          className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          role="menuitem"
                        >
                          {t("navbar.patients")}
                        </Link>
                        <Link
                          to="/profile"
                          onClick={() => setOpen(false)}
                          className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          role="menuitem"
                        >
                          {t("navbar.profile")}
                        </Link>
                      </>
                    )}
                  </>
                )}

                <button
                  onClick={async () => {
                    setOpen(false);
                    await logout();
                    navigate("/login", { replace: true });
                  }}
                  className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  role="menuitem"
                >
                 {t("navbar.logout")}
                </button>
              </div>
            )}
          </div>
           </div>
        )}
      </div>
    </nav>
  );
}
