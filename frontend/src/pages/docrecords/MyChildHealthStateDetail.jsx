import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, History, Loader2, Languages } from "lucide-react";
import Button from "../../components/forms/Button.jsx";

import DiagnosisHistoryModal from "../../components/diagnostic/DiagnosisHistoryModal.jsx";
import { useMyChildDiagnosis, useTranslateChildDiagnosisHistorySnapshot} from "../../features/diagnostics/dhooks.js";

export default function MyChildHealthStateDetail() {
  const { childId, id } = useParams();
  const nav = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "en";

  const { data: diagnosis, isLoading } = useMyChildDiagnosis(childId, id);
  const translate = useTranslateChildDiagnosisHistorySnapshot();

  const [historyOpen, setHistoryOpen] = useState(false);

  const hasText = useMemo(() => {
    const v = diagnosis;
    return !!(v?.title || v?.description || (Array.isArray(v?.symptoms) && v.symptoms.length));
  }, [diagnosis]);

  if (isLoading) {
    return (
      <main className="p-6 text-center text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
        {t("common.loading")}
      </main>
    );
  }

  if (!diagnosis) {
    return (
      <main className="mx-auto max-w-4xl p-4">
        <div className="p-6 bg-white border rounded-xl text-gray-600">
          {t("diagnoses.detail.notFound")}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="secondary" full={false} onClick={() => nav(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("common.back")}
        </Button>

        <div className="flex gap-2">
          <Button variant="secondary" full={false} onClick={() => setHistoryOpen(true)}>
            <History className="w-4 h-4 mr-2" />
            {t("diagnoses.history.title")}
          </Button>

          {hasText && (
            <Button
              variant="secondary"
              full={false}
              loading={translate.isPending}
              onClick={async () => {
                const d = await translate.mutateAsync({ childId, diagnosisId: id, lang });
                // OJO: aquí solo “reemplazas” en UI si quieres; lo común es refetch,
                // pero como tu endpoint ya devuelve traducido, puedes hacer setState si lo prefieres.
                // Para simple: recarga la página con invalidateQuery (si lo manejas en hooks),
                // o ignora y solo úsalo cuando abras detalle.
              }}
            >
              <Languages className="w-4 h-4 mr-2" />
              {t("common.translate")}
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white border rounded-xl p-4 space-y-3">
        <h1 className="text-2xl font-bold">{diagnosis.title}</h1>
        <div className="text-sm text-gray-600">{diagnosis.description || "-"}</div>
      </div>

      {historyOpen && (
        <DiagnosisHistoryModal
          variant="child"
          childId={childId}
          diagnosisId={id}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </main>
  );
}
