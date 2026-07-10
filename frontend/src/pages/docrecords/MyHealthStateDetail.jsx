// src/pages/DocRecords/MyHealthStateDetail.jsx
import { Link, useParams } from "react-router-dom";
import Button from "../../components/forms/Button.jsx";
import { useMyDiagnosis } from "../../features/diagnostics/dhooks.js";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  FileText,
  History,
  Loader2,
  Pill,
  Scissors,
  Syringe,
  User2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import DiagnosisHistoryModal from "../../components/diagnostic/DiagnosisHistoryModal.jsx";

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

function PageShell({ children }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </div>
    </main>
  );
}

function LoadingState({ t }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50" aria-busy="true">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="mb-3 h-4 w-36 animate-pulse rounded-full bg-slate-200" />
              <div className="h-8 w-64 max-w-full animate-pulse rounded-xl bg-slate-200" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <div className="h-11 animate-pulse rounded-xl bg-slate-200 sm:w-28" />
              <div className="h-11 animate-pulse rounded-xl bg-slate-200 sm:w-28" />
            </div>
          </div>
          <p
            role="status"
            className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-slate-600"
          >
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />
            {t("common.loading")}
          </p>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 h-5 w-40 animate-pulse rounded-full bg-slate-200" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function NotFoundState({ t }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <AlertTriangle className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            {t("diagnoses.detail.notFoundTitle")}
          </h1>
          <Link
            to="/docrecords/myhealthstate"
            className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("myHealthState.detail.backToState")}
          </Link>
        </section>
      </div>
    </main>
  );
}

function SectionCard({ title, icon: Icon, tone = "blue", children }) {
  const toneClasses = {
    blue: "bg-blue-50 text-blue-700",
    rose: "bg-rose-50 text-rose-700",
    emerald: "bg-emerald-50 text-emerald-700",
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${toneClasses[tone]}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function RecordField({ label, value, icon: Icon, children, className = "" }) {
  return (
    <div
      className={`min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 ${className}`}
    >
      <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
        {label}
      </span>
      {value != null && (
        <span className="mt-1 block break-words text-sm font-medium leading-6 text-slate-900">
          {value}
        </span>
      )}
      {children}
    </div>
  );
}

function ChipList({ items }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, index) => (
        <span
          key={`${item}-${index}`}
          className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function ConditionColumn({ icon: Icon, iconClassName, label, items }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Icon className={`h-4 w-4 ${iconClassName}`} aria-hidden="true" />
        {label}
      </h3>
      <div className="mt-3">
        <ChipList items={items} />
      </div>
    </div>
  );
}

export default function MyHealthStateDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { data: diag, isLoading, isError } = useMyDiagnosis(id);
  const [showHistory, setShowHistory] = useState(false);

  if (isLoading && !diag) return <LoadingState t={t} />;

  if (isError || !diag) {
    return <NotFoundState t={t} />;
  }

  const title =
    diag.title ?? diag.Diagnostic ?? diag.diagnosis ?? t("diagnoses.detail.untitled");

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

  const hasClinical = meds.length > 0 || tx.length > 0 || ops.length > 0;

  return (
    <PageShell>
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium leading-6 text-slate-600">
              <FileText className="h-4 w-4 text-blue-600" aria-hidden="true" />
              {t("myHealthState.detail.backToState")}
            </p>
            <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {title}
            </h1>
          </div>

          <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:grid-cols-none lg:flex lg:items-center">
            <Link
              to="/docrecords/myhealthstate"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t("myHealthState.detail.backToState")}
            </Link>
            <Button
              full={false}
              variant="secondary"
              onClick={() => setShowHistory(true)}
              className="sm:w-auto"
            >
              <History className="h-4 w-4" aria-hidden="true" />
              {t("diagnoses.detail.history")}
            </Button>
          </div>
        </div>
      </header>

      <SectionCard
        title={t("diagnoses.detail.description")}
        icon={FileText}
        tone="blue"
      >
        <p className="whitespace-pre-line break-words text-sm font-medium leading-6 text-slate-900">
          {diag.description?.trim() || "—"}
        </p>
      </SectionCard>

      {hasClinical && (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {meds.length > 0 && (
                <ConditionColumn
                  label={t("diagnoses.detail.medicines")}
                  icon={Pill}
                  iconClassName="text-blue-500"
                  items={meds}
                />
              )}
              {tx.length > 0 && (
                <ConditionColumn
                  label={t("diagnoses.detail.treatments")}
                  icon={Syringe}
                  iconClassName="text-rose-500"
                  items={tx}
                />
              )}
              {ops.length > 0 && (
                <ConditionColumn
                  label={t("diagnoses.detail.operations")}
                  icon={Scissors}
                  iconClassName="text-amber-500"
                  items={ops}
                />
              )}
            </div>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RecordField
              label={t("myHealthState.detail.createdBy")}
              value={creatorLabel}
              icon={User2}
            />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm sm:p-5">
        <div className="inline-flex items-center gap-2">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          <span>
            {t("diagnoses.detail.created")}: {createdAt} ·{" "}
            {t("diagnoses.detail.updated")}: {updatedAt}
          </span>
        </div>
      </section>

      {showHistory && (
        <DiagnosisHistoryModal diagnosisId={id} onClose={() => setShowHistory(false)} />
      )}
    </PageShell>
  );
}
