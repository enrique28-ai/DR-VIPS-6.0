import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Check, X, History } from "lucide-react";
import Button from "../../components/forms/Button.jsx";

import {
  useMyChildrenHealthInfo,
  useApproveChildProfile,
  useRejectChildProfile,
} from "../../features/patients/phooks.js";

import PatientHistoryModal from "../../components/patient/PatientHistoryModal.jsx";

const List = ({ items }) => {
  const arr = Array.isArray(items) ? items : [];
  if (arr.length === 0) return <div className="text-gray-500 text-sm">-</div>;
  return (
    <div className="flex flex-wrap gap-2">
      {arr.map((x) => (
        <span key={x} className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-800">
          {x}
        </span>
      ))}
    </div>
  );
};

export default function MyChildHealthInfo() {
  const { childId } = useParams(); // este es profileId canónico
  const { t } = useTranslation();

  const { data, isLoading } = useMyChildrenHealthInfo();
  const approve = useApproveChildProfile();
  const reject = useRejectChildProfile();

  const [openHistory, setOpenHistory] = useState(false);

  const child = useMemo(() => {
    const arr = Array.isArray(data) ? data : [];
    return arr.find((g) => (g?.snapshot?.sources || []).some((s) => s?.id === childId));
  }, [data, childId]);

  const snap = child?.snapshot || {};
  const name = snap?.fullname?.value || t("myChildren.unknownChild");

  if (isLoading) {
    return (
      <main className="p-6 text-center text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
        {t("common.loading")}
      </main>
    );
  }

  if (!child) {
    return (
      <main className="mx-auto max-w-4xl p-4">
        <div className="p-6 bg-white rounded-xl border text-gray-600">
          {t("myChildren.childNotFound")}
          <div className="mt-4">
            <Link className="underline" to="/docrecords/mychildren">
              {t("myChildren.back")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{name}</h1>
          <div className="text-gray-600 text-sm">{t("myChildren.healthInfo")}</div>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" full={false} onClick={() => setOpenHistory(true)}>
            <History className="w-4 h-4 mr-2" />
            {t("patients.detail.history")}
          </Button>

          <Link to="/docrecords/mychildren" className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50">
            {t("myChildren.back")}
          </Link>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-4 space-y-4">
        {child?.pendingDecision ? (
          <div className="flex gap-2 items-start">
            <div className="text-sm text-amber-700">{t("myChildren.pending")}</div>
          </div>
        ) : (
          <div className="text-sm text-green-700">{t("myChildren.upToDate")}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="font-medium mb-2">{t("patients.form.diseases")}</div>
            <List items={snap?.diseasesCombined} />
          </div>
          <div>
            <div className="font-medium mb-2">{t("patients.form.allergies")}</div>
            <List items={snap?.allergiesCombined} />
          </div>
          <div>
            <div className="font-medium mb-2">{t("patients.form.medications")}</div>
            <List items={snap?.medicationsCombined} />
          </div>
        </div>

        {child?.pendingDecision && (
          <div className="flex gap-3 pt-2">
            <Button
              onClick={() => approve.mutate(childId)}
              loading={approve.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              <Check className="w-4 h-4 mr-2" />
              {t("myChildren.approve")}
            </Button>
            <Button variant="danger" onClick={() => reject.mutate(childId)} loading={reject.isPending}>
              <X className="w-4 h-4 mr-2" />
              {t("myChildren.reject")}
            </Button>
          </div>
        )}
      </div>

      {openHistory && (
        <PatientHistoryModal
          variant="child"
          patientId={childId}
          onClose={() => setOpenHistory(false)}
        />
      )}
    </main>
  );
}
