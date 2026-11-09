import { Component, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { RoutePageLoadError } from "../../lib/routePageLoader.js";

class RouteImportBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError(error) {
    if (!(error instanceof RoutePageLoadError)) throw error;
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const reloadPage = () => window.location.reload();

export default function RoutePageBoundary({ children, onReload = reloadPage }) {
  const { t } = useTranslation();

  return (
    <RouteImportBoundary
      fallback={
        <div className="px-4 py-8 sm:px-6">
          <p role="alert" className="text-slate-600">
            {t("common.pageLoadError")}
          </p>
          <button
            type="button"
            onClick={onReload}
            className="mt-4 min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {t("common.reloadPage")}
          </button>
        </div>
      }
    >
      <Suspense
        fallback={
          <div role="status" className="px-4 py-8 text-slate-600 sm:px-6">
            {t("common.loading")}
          </div>
        }
      >
        {children}
      </Suspense>
    </RouteImportBoundary>
  );
}
