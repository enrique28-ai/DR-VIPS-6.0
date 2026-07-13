import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { getNavigation, isActive } from "./navigationConfig.js";

export default function MobileNavigationDrawer({
  open,
  role,
  onClose,
  triggerRef,
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const closeButtonRef = useRef(null);
  const panelRef = useRef(null);
  const [entered, setEntered] = useState(false);
  const items = getNavigation(role);
  const drawerAvailable = open && items.length > 0;

  useEffect(() => {
    setEntered(drawerAvailable);
  }, [drawerAvailable]);

  useEffect(() => {
    if (!drawerAvailable) return undefined;

    const desktopMedia = window.matchMedia?.("(min-width: 1024px)");
    if (desktopMedia?.matches) {
      onClose();
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
        triggerRef?.current?.focus();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll(
        'button:not([disabled]), a[href]',
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleDesktopChange = (event) => {
      if (event.matches) onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    desktopMedia?.addEventListener("change", handleDesktopChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      desktopMedia?.removeEventListener("change", handleDesktopChange);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerAvailable, onClose, triggerRef]);

  if (!drawerAvailable) return null;

  const closeAndRestoreFocus = () => {
    onClose();
    triggerRef?.current?.focus();
  };

  return (
    <div className="fixed inset-0 z-[60] lg:hidden">
      <div
        className="absolute inset-0 bg-slate-950/50"
        data-testid="mobile-navigation-backdrop"
        aria-hidden="true"
        onClick={closeAndRestoreFocus}
      />
      <div
        ref={panelRef}
        id="mobile-navigation-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-navigation-title"
        className={`relative flex h-full w-72 max-w-[calc(100vw-2rem)] flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none ${
          entered ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 px-4">
          <h2
            id="mobile-navigation-title"
            className="text-base font-semibold text-slate-950"
          >
            {t("navbar.mainNavigation")}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeAndRestoreFocus}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav
          aria-label={t("navbar.mainNavigation")}
          className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
        >
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(location.pathname, item.active);

            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
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
      </div>
    </div>
  );
}
