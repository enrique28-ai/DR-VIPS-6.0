import { Link, useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import Button from "../../components/forms/Button.jsx";
import { useDiagnosis, useTranslateDiagnosis } from "../../features/diagnostics/dhooks.js";
import { ArrowLeft, FileText, Languages, Loader2, CalendarClock, Pill, Syringe, Scissors, History } from "lucide-react";
import { useTranslation } from "react-i18next";
import DiagnosisHistoryModal from "../../components/diagnostic/DiagnosisHistoryModal.jsx";

function LoadingState({ t }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50" aria-busy="true">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-3 h-4 w-36 animate-pulse rounded-full bg-slate-200" />
          <div className="h-8 w-64 max-w-full animate-pulse rounded-xl bg-slate-200" />
          <p
            role="status"
            className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-slate-600"
          >
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />
            {t("common.loading")}
          </p>
        </section>
      </div>
    </main>
  );
}

export default function DiagnosisDetailPage() {
  const { t, i18n } = useTranslation();
  const [translatedDiag, setTranslatedDiag] = useState(null);

  const { patientId, diagnosisId } = useParams();
  const navigate = useNavigate();
  const [showHistory, setShowHistory] = useState(false);

  const { data: original, isLoading, isError } = useDiagnosis(diagnosisId);
  const { mutate: translate, isPending } = useTranslateDiagnosis();
  const diag = translatedDiag || original;

  const handleTranslate = () => {
    translate(
      { id: diagnosisId, lang: i18n.language },
      { onSuccess: (data) => setTranslatedDiag(data) }
    );
  };


  // Evita flash en primer fetch
  if (isLoading && !diag) return <LoadingState t={t} />;
  if (isError || !diag) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{t("diagnoses.detail.notFoundTitle")}</h1>
            <div className="mt-4">
              <Button full={false} variant="secondary" onClick={() => navigate(`/diagnosis/patient/${patientId}`)}>
                {t("diagnoses.detail.backToList")}
              </Button>
            </div>
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
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <Link
            to={`/diagnosis/patient/${patientId}`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("diagnoses.detail.backToList")}
          </Link>
        </div>

        <header className="mb-4">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <dl className="grid grid-cols-1 gap-y-3 text-slate-700">
           <dt className="font-medium">{t("diagnoses.detail.description")}</dt>
            <dd className="whitespace-pre-line mb-6 sm:mb-8">{diag.description?.trim() || "—"}</dd>
          </dl>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-slate-700 sm:grid-cols-2">
            {meds.length > 0 && (
              <>
                <dt className="font-medium flex items-center gap-1">
                  <Pill className="h-4 w-4" aria-hidden="true" /> {t("diagnoses.detail.medicines")}
                </dt>
                <dd className="flex flex-wrap gap-1">
                  {meds.map((m, i) => (
                    <span key={i} className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-sm">
                      {m}
                    </span>
                  ))}
                </dd>
              </>
            )}

            {tx.length > 0 && (
              <>
                <dt className="font-medium flex items-center gap-1">
                  <Syringe className="h-4 w-4" aria-hidden="true" /> {t("diagnoses.detail.treatments")}
                </dt>
                <dd className="flex flex-wrap gap-1">
                  {tx.map((t, i) => (
                    <span key={i} className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-sm">
                      {t}
                    </span>
                  ))}
                </dd>
              </>
            )}

        {ops.length > 0 && (
      <>
        <dt className="font-medium flex items-center gap-1">
          <Scissors className="h-4 w-4" aria-hidden="true" /> {t("diagnoses.detail.operations")}
        </dt>
        <dd className="flex flex-wrap gap-1">
          {ops.map((o, i) => (
            <span key={i} className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-sm">{o}</span>
          ))}
        </dd>
      </>
    )}

        

          </dl>

            <div className="mt-4 text-sm text-slate-500 inline-flex items-center gap-2">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            <span>
              {t("diagnoses.detail.created")}: {diag.createdAt ? new Date(diag.createdAt).toLocaleString(i18n.language) : "—"} · {t("diagnoses.detail.updated")}:
              {diag.updatedAt ? new Date(diag.updatedAt).toLocaleString(i18n.language) : "—"}
            </span>
          </div>


          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={`/diagnosis/patient/${patientId}/${diagnosisId}/edit`}>
              <Button full={false} className="w-full sm:w-auto">{t("diagnoses.detail.edit")}</Button>
            </Link>
            <Link to={`/diagnosis/patient/${patientId}`}>
              <Button  full={false} variant="secondary" className="w-full sm:w-auto">{t("diagnoses.detail.back")}</Button>
            </Link>
             <Button full={false} variant="secondary" onClick={handleTranslate} disabled={isPending}  className="w-full sm:w-auto">
              <span className="inline-flex items-center gap-2">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Languages className="h-4 w-4" aria-hidden="true" />}
              {t("common.translate")}
            </span>
          </Button>
            <Button full={false} variant="secondary"  className="w-full sm:w-auto" onClick={() => setShowHistory(true)}>
              <span className="inline-flex items-center gap-2">
                <History className="h-4 w-4" aria-hidden="true" />
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

      </div>
    </main>
  );
}
