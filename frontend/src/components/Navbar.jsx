// src/components/Navbar.jsx
import { Link } from "react-router-dom";
import { useAuthStore } from "../stores/authStore.js";
import { LanguageSwitcher } from "./language/LanguageSwitcher.jsx";
import { useTranslation } from "react-i18next";
import { Menu } from "lucide-react";
import NotificationBell from "./layout/NotificationBell.jsx";
import MobileNavigationDrawer from "./layout/MobileNavigationDrawer.jsx";
import UserMenu from "./layout/UserMenu.jsx";
import { getNavigation } from "./layout/navigationConfig.js";

export default function Navbar({
  navigationOpen = false,
  onToggleNavigation,
  onCloseNavigation,
  navigationTriggerRef,
}) {
  const { t } = useTranslation();
  const { user, isAuthenticated, isCheckingAuth, logout } = useAuthStore();
  const hasRoleNavigation =
    isAuthenticated &&
    user?.isVerified &&
    getNavigation(user?.role).length > 0;

  return (
    <>
      <nav className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <Link
              to="/"
              className="flex min-w-0 items-center gap-2 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <img
                src="/dr-vips-logo.png"
                alt="Dr-VIPS Logo"
                className="h-12 w-auto sm:h-14"
              />
              <span
                className={`${hasRoleNavigation ? "hidden sm:block" : ""} truncate text-base font-semibold tracking-tight text-slate-950 sm:text-lg`}
              >
                DR-VIPS
              </span>
            </Link>
          </div>

          {isCheckingAuth ? (
            <div className="flex items-center gap-3">
              <div className="h-10 w-[128px] animate-pulse rounded-full bg-slate-100 sm:w-[160px]" />
              <LanguageSwitcher />
            </div>
          ) : !isAuthenticated ? (
            <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
              <LanguageSwitcher />
              <Link
                to="/eligibility"
                className="hidden min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:inline-flex"
              >
                {t("navbar.whoCanAccess")}
              </Link>
              <Link
                to="/login"
                className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:px-4"
              >
                {t("navbar.login")}
              </Link>
              <Link
                to="/signup"
                className="inline-flex min-h-10 items-center rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:px-4"
              >
                {t("navbar.register")}
              </Link>
            </div>
          ) : (
            <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
              <LanguageSwitcher />
              {user?.isVerified && <NotificationBell />}
              {hasRoleNavigation && (
                <button
                  ref={navigationTriggerRef}
                  type="button"
                  onClick={onToggleNavigation}
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                    navigationOpen ? "bg-slate-100" : ""
                  }`}
                  aria-label={t("navbar.mainNavigation")}
                  aria-expanded={navigationOpen}
                  aria-controls="desktop-navigation-sidebar mobile-navigation-drawer"
                >
                  <Menu className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
              {!hasRoleNavigation && <UserMenu user={user} logout={logout} />}
            </div>
          )}
        </div>
      </nav>
      <MobileNavigationDrawer
        open={hasRoleNavigation && navigationOpen}
        role={user?.role}
        user={user}
        logout={logout}
        onClose={onCloseNavigation}
        triggerRef={navigationTriggerRef}
      />
    </>
  );
}
