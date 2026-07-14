import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getNavigation, isActive } from "./navigationConfig.js";
import NavigationAccount from "./NavigationAccount.jsx";

export default function MobileNavigationDrawer({
  open,
  role,
  user,
  logout,
  onClose,
  triggerRef,
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const items = getNavigation(role);
  const drawerAvailable = open && items.length > 0;

  useEffect(() => {
    if (!drawerAvailable) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
        triggerRef?.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [drawerAvailable, onClose, triggerRef]);

  if (!drawerAvailable) return null;

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 top-16 z-30 lg:hidden">
      <div
        className="pointer-events-auto absolute inset-0 bg-slate-950/50 touch-none overscroll-contain"
        data-testid="mobile-navigation-backdrop"
        aria-hidden="true"
      />
      <div
        id="mobile-navigation-drawer"
        role="dialog"
        aria-modal="false"
        aria-labelledby="mobile-navigation-title"
        className="pointer-events-auto relative ml-auto flex h-full w-72 max-w-[calc(100vw-2rem)] flex-col border-l border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex min-h-16 items-center border-b border-slate-200 px-4">
          <h2
            id="mobile-navigation-title"
            className="text-base font-semibold text-slate-950"
          >
            {t("navbar.mainNavigation")}
          </h2>
        </div>

        <nav
          aria-label={t("navbar.mainNavigation")}
          className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4"
        >
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(location.pathname, item.active);

            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Icon
                  className={`h-5 w-5 shrink-0 ${active ? "text-blue-600" : "text-slate-400"}`}
                  aria-hidden="true"
                />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
        <NavigationAccount
          user={user}
          logout={logout}
          onBeforeLogout={onClose}
        />
      </div>
    </div>
  );
}
