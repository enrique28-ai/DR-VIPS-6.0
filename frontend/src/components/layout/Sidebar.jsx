import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getNavigation, isActive } from "./navigationConfig.js";
import NavigationAccount from "./NavigationAccount.jsx";

export default function Sidebar({ role, user, logout }) {
  const { t } = useTranslation();
  const location = useLocation();

  const items = getNavigation(role);

  if (items.length === 0) return null;

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
      <nav
        aria-label={t("navbar.mainNavigation")}
        className="w-full flex-1 space-y-1 overflow-y-auto px-3 py-4"
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
      <NavigationAccount user={user} logout={logout} />
    </aside>
  );
}
