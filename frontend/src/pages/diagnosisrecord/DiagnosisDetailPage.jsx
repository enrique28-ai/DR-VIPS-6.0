import { Link, useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import Button from "../../components/forms/Button.jsx";
import { useDiagnosis } from "../../features/diagnostics/dhooks.js";
import { CalendarClock, Pill, Syringe, Scissors, History } from "lucide-react";
import { useTranslation } from "react-i18next";
import DiagnosisHistoryModal from "../../components/diagnostic/DiagnosisHistoryModal.jsx";
export default function DiagnosisDetailPage() {
  const { t } = useTranslation();
  const { patientId, diagnosisId } = useParams();
  const navigate = useNavigate();
  const [showHistory, setShowHistory] = useState(false);

  const { data: diag, isLoading, isError } = useDiagnosis(diagnosisId);


  // Evita flash en primer fetch
  if (isLoading && !diag) return null;
  if (isError || !diag) {
    return (
      <main className="mx-auto max-w-3xl p-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">{t("diagnoses.detail.notFoundTitle")}</h1>
          <div className="mt-4">
            <Button full={false} variant="secondary" onClick={() => navigate(`/diagnosis/patient/${patientId}`)}>
              {t("diagnoses.detail.backToList")}
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const title = diag.title ?? diag.Diagnostic ?? t("diagnoses.detail.untitled");
  const meds  = Array.isArray(diag.medicine) ? diag.medicine : [];
  const tx   = Array.isArray(diag.treatment) ? diag.treatment : [];
  const ops  = Array.isArray(diag.operation) ? diag.operation : [];


  return (
    <main className="mx-auto max-w-3xl p-4">
      <div className="mb-4">
        <Link
          to={`/diagnosis/patient/${patientId}`}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100"
        >
           ← {t("diagnoses.detail.backToList")}
        </Link>
      </div>

      <header className="mb-4">
        <h1 className="text-3xl font-bold">{title}</h1>
      </header>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-gray-700">
         <dt className="font-medium">{t("diagnoses.detail.description")}</dt>
          <dd className="whitespace-pre-line mb-6 sm:mb-8">{diag.description?.trim() || "—"}</dd>
          </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-gray-700 sm:grid-cols-2">
         
          {meds.length > 0 && (
            <>
              <dt className="font-medium flex items-center gap-1">
                <Pill className="h-4 w-4" /> {t("diagnoses.detail.medicines")}
              </dt>
              <dd className="flex flex-wrap gap-1">
                {meds.map((m, i) => (
                  <span key={i} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm">
                    {m}
                  </span>
                ))}
              </dd>
            </>
          )}

          {tx.length > 0 && (
            <>
              <dt className="font-medium flex items-center gap-1">
                <Syringe className="h-4 w-4" /> {t("diagnoses.detail.treatments")}
              </dt>
              <dd className="flex flex-wrap gap-1">
                {tx.map((t, i) => (
                  <span key={i} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm">
                    {t}
                  </span>
                ))}
              </dd>
            </>
          )}

      {ops.length > 0 && (
    <>
      <dt className="font-medium flex items-center gap-1">
        <Scissors className="h-4 w-4" /> {t("diagnoses.detail.operations")}
      </dt>
      <dd className="flex flex-wrap gap-1">
        {ops.map((o, i) => (
          <span key={i} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm">{o}</span>
        ))}
      </dd>
    </>
  )}

        

        </dl>

          <div className="mt-4 text-sm text-gray-500 inline-flex items-center gap-2">
          <CalendarClock className="h-4 w-4" />
          <span>
            {t("diagnoses.detail.created")}: {diag.createdAt ? new Date(diag.createdAt).toLocaleString() : "—"} · {t("diagnoses.detail.updated")}:
            {diag.updatedAt ? new Date(diag.updatedAt).toLocaleString() : "—"}
          </span>
        </div>


        
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to={`/diagnosis/patient/${patientId}/${diagnosisId}/edit`}>
            <Button full={false} className="w-full">{t("diagnoses.detail.edit")}</Button>
          </Link>
          <Link to={`/diagnosis/patient/${patientId}`}>
            <Button  full={false} variant="secondary" className="w-full">{t("diagnoses.detail.back")}</Button>
          </Link>
          <Button full={false} variant="secondary" onClick={() => setShowHistory(true)}>
            <span className="inline-flex items-center gap-2">
              <History className="h-4 w-4" />
              {t("diagnoses.detail.history")}
            </span>
          </Button>
        </div>
      </section>
      {showHistory && (
  <DiagnosisHistoryModal
    diagnosisId={diagnosisId}
    onClose={() => setShowHistory(false)}
  />
)}

    </main>
  );
}
