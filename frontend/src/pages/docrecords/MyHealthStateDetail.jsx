// src/pages/DocRecords/MyHealthStateDetail.jsx
import { Link, useParams } from "react-router-dom";
import Button from "../../components/forms/Button.jsx";
import { useMyDiagnosis } from "../../features/diagnostics/dhooks.js";
import { useState } from "react";
import { ArrowLeft, CalendarClock, Pill, Syringe, Scissors, History, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import DiagnosisHistoryModal from "../../components/diagnostic/DiagnosisHistoryModal.jsx";
// helper para fechas localizadas
function formatDateTime(iso, locale) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return locale ? d.toLocaleString(locale) : d.toLocaleString();
  } catch {
    return d.toLocaleString();
  }
}

function LoadingState({ t }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50" aria-busy="true">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
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

export default function MyHealthStateDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { data: diag, isLoading, isError } = useMyDiagnosis(id);
  const [showHistory, setShowHistory] = useState(false);

  // Evitar flash en primer fetch
  if (isLoading && !diag) return <LoadingState t={t} />;

  if (isError || !diag) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              {t("diagnoses.detail.notFoundTitle")}
            </h1>
            <div className="mt-4">
              <Link to="/docrecords/myhealthstate">
                <Button variant="secondary" full={false}>
                  {t("myHealthState.detail.backToState")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const title =
    diag.title ??
    diag.Diagnostic ??
    diag.diagnosis ??
    t("diagnoses.detail.untitled");

  const meds = Array.isArray(diag.medicine) ? diag.medicine : [];
  const tx = Array.isArray(diag.treatment) ? diag.treatment : [];
  const ops = Array.isArray(diag.operation) ? diag.operation : [];

  const doctorEmail = diag?.createdBy?.email || "";
  const doctorName = diag?.createdBy?.name || "";

  let creatorLabel = t("myHealthState.detail.unknownDoctor");
  if (doctorName && doctorEmail) {
    creatorLabel = `${doctorName} (${doctorEmail})`;
  } else if (doctorName) {
    creatorLabel = doctorName;
  } else if (doctorEmail) {
    creatorLabel = doctorEmail;
  }

  const createdAt = diag.createdAt
    ? formatDateTime(diag.createdAt, i18n.language)
    : "—";
  const updatedAt = diag.updatedAt
    ? formatDateTime(diag.updatedAt, i18n.language)
    : "—";

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Back */}
        <div className="mb-4">
          <Link
            to="/docrecords/myhealthstate"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("myHealthState.detail.backToState")}
          </Link>
        </div>

        {/* Header */}
        <header className="mb-4">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {t("myHealthState.detail.createdBy")}{" "}
            <span className="font-medium text-slate-800">{creatorLabel}</span>
          </p>
        </header>

      {/* Content card */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Description */}
        <dl className="grid grid-cols-1 gap-y-3 text-slate-700">
          <dt className="font-medium">
            {t("diagnoses.detail.description")}
          </dt>
          <dd className="whitespace-pre-line mb-6 sm:mb-8">
            {diag.description?.trim() || "—"}
          </dd>
        </dl>

        {/* Lists with icons */}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-slate-700 sm:grid-cols-2">
          {meds.length > 0 && (
            <>
              <dt className="font-medium flex items-center gap-1">
                <Pill className="h-4 w-4" aria-hidden="true" /> {t("diagnoses.detail.medicines")}
              </dt>
              <dd className="flex flex-wrap gap-1">
                {meds.map((m, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-sm"
                  >
                    {m}
                  </span>
                ))}
              </dd>
            </>
          )}

          {tx.length > 0 && (
            <>
              <dt className="font-medium flex items-center gap-1">
                <Syringe className="h-4 w-4" aria-hidden="true" />{" "}
                {t("diagnoses.detail.treatments")}
              </dt>
              <dd className="flex flex-wrap gap-1">
                {tx.map((tItem, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-sm"
                  >
                    {tItem}
                  </span>
                ))}
              </dd>
            </>
          )}

          {ops.length > 0 && (
            <>
              <dt className="font-medium flex items-center gap-1">
                <Scissors className="h-4 w-4" aria-hidden="true" />{" "}
                {t("diagnoses.detail.operations")}
              </dt>
              <dd className="flex flex-wrap gap-1">
                {ops.map((o, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-sm"
                  >
                    {o}
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>

        {/* Timestamps */}
        <div className="mt-4 text-sm text-slate-500 inline-flex items-center gap-2">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          <span>
            {t("diagnoses.detail.created")}: {createdAt} ·{" "}
            {t("diagnoses.detail.updated")}: {updatedAt}
          </span>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button full={false} variant="secondary" onClick={() => setShowHistory(true)}>
            <span className="inline-flex items-center gap-2">
              <History className="h-4 w-4" aria-hidden="true" />
              {t("diagnoses.detail.history")}
            </span>
          </Button>
        </div>
      </section>
      {showHistory && (
        <DiagnosisHistoryModal diagnosisId={id} onClose={() => setShowHistory(false)} />
      )}
      </div>
    </main>
  );
}
