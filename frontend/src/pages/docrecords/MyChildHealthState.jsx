import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useMyChildDiagnoses, buildDiagnosisParams } from "../../features/diagnostics/dhooks.js";
import { useMyChildrenHealthInfo } from "../../features/patients/phooks.js";

function Card({ item, to }) {
  return (
    <Link to={to} className="block bg-white border rounded-xl p-4 hover:bg-gray-50">
      <div className="font-semibold">{item.title}</div>
      <div className="text-sm text-gray-600 line-clamp-2 mt-1">{item.description || "-"}</div>
      <div className="text-xs text-gray-500 mt-2">{new Date(item.createdAt).toLocaleString()}</div>
    </Link>
  );
}

export default function MyChildHealthState() {
  const { childId } = useParams();
  const { t, i18n } = useTranslation();


  const { data: childrenData } = useMyChildrenHealthInfo(i18n.language);
  const childName = useMemo(() => {
    const arr = Array.isArray(childrenData) ? childrenData : [];
    const g = arr.find((x) => (x?.snapshot?.sources || []).some((s) => s?.id === childId));
    return g?.snapshot?.fullname?.value || t("myChildren.unknownChild");
  }, [childrenData, childId, t]);

  const [filters] = useState({});
  const params = useMemo(() => buildDiagnosisParams(filters), [filters]);

  const { data, isLoading } = useMyChildDiagnoses(childId, params);

  if (isLoading) {
    return (
      <main className="p-6 text-center text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
        {t("common.loading")}
      </main>
    );
  }

  const list = Array.isArray(data?.items) ? data.items : [];

  return (
    <main className="mx-auto max-w-5xl p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">{childName}</h1>
          <div className="text-gray-600 text-sm">{t("myChildren.healthState")}</div>
        </div>
        <Link to="/docrecords/mychildren" className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50">
          {t("myChildren.back")}
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="p-6 bg-white border rounded-xl text-center text-gray-500">
          {t("myChildren.noDiagnoses")}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map((d) => (
            <Card
              key={d._id}
              item={d}
              to={`/docrecords/mychildren/${childId}/health-state/${d._id}`}
            />
          ))}
        </div>
      )}
    </main>
  );
}
