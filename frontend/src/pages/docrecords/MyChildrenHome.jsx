import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, AlertTriangle, Baby, HeartPulse } from "lucide-react";
import { useMyChildrenHealthInfo } from "../../features/patients/phooks.js";

export default function MyChildrenHome() {
  const { t } = useTranslation();
  const { data, isLoading } = useMyChildrenHealthInfo();

  if (isLoading) {
    return (
      <main className="p-6 text-center text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
        {t("common.loading")}
      </main>
    );
  }

  const children = Array.isArray(data) ? data : [];

  return (
    <main className="mx-auto max-w-5xl p-4 space-y-4">
      <h1 className="text-2xl font-bold">{t("myChildren.title")}</h1>
      <p className="text-gray-600">{t("myChildren.subtitle")}</p>

      {children.length === 0 ? (
        <div className="p-6 bg-white rounded-xl border text-center text-gray-500">
          {t("myChildren.empty")}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {children.map((c) => {
            const snap = c?.snapshot || {};
            const name = snap?.fullname?.value || t("myChildren.unknownChild");
            const age = snap?.age?.value;

            // Usa el id del “último source” como childId canónico
            const childId = snap?.sources?.[0]?.id;

            return (
              <div key={c.childKey} className="bg-white border rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Baby className="w-5 h-5 text-blue-600" />
                      <div className="font-semibold">{name}</div>
                      {Number.isFinite(age) && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                          {t("myChildren.ageYears", { age })}
                        </span>
                      )}
                    </div>

                    {c?.pendingDecision ? (
                      <div className="mt-2 text-sm text-amber-700 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        {t("myChildren.pending")}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-green-700">{t("myChildren.upToDate")}</div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    to={childId ? `/docrecords/mychildren/${childId}/health-info` : "#"}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                      childId ? "hover:bg-gray-50" : "opacity-50 pointer-events-none"
                    }`}
                  >
                    <HeartPulse className="w-4 h-4" />
                    {t("myChildren.healthInfo")}
                  </Link>

                  <Link
                    to={childId ? `/docrecords/mychildren/${childId}/health-state` : "#"}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                      childId ? "hover:bg-gray-50" : "opacity-50 pointer-events-none"
                    }`}
                  >
                    <HeartPulse className="w-4 h-4" />
                    {t("myChildren.healthState")}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
