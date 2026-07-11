import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  FileText,
  History,
  Info,
  Languages,
  Loader2,
  Pill,
  Scissors,
  Stethoscope,
  Syringe,
  User2,
  X,
} from "lucide-react";
import Button from "../../components/forms/Button.jsx";

import DiagnosisHistoryModal from "../../components/diagnostic/DiagnosisHistoryModal.jsx";
import {
  useMyChildDiagnosis,
  useTranslateMyChildDiagnosis,
} from "../../features/diagnostics/dhooks.js";

const FALLBACK_TEXT = "-";

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
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600"
          >
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />
            {t("common.loading")}
          </p>
        </section>
      </div>
    </main>
  );
}

function NotFoundState({ onBack, t }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <AlertTriangle className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            {t("diagnoses.detail.notFound")}
          </h1>
          <Button className="mt-6 sm:w-auto" onClick={onBack}>
            {t("myChildren.back")}
          </Button>
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

export default function MyChildHealthStateDetail() {
  const { childId, id } = useParams();
  const nav = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "en";

  const { data: diagnosis, isLoading } = useMyChildDiagnosis(childId, id);
  const translate = useTranslateMyChildDiagnosis();

  const [historyOpen, setHistoryOpen] = useState(false);
  const [translatedDiagnosis, setTranslatedDiagnosis] = useState(null);
  const translatedActive =
    translatedDiagnosis?.childId === childId &&
    translatedDiagnosis?.diagnosisId === id &&
    translatedDiagnosis?.lang === lang;
  const currentDiagnosis = translatedActive ? translatedDiagnosis.data : diagnosis;

  const hasText = useMemo(() => {
    const v = currentDiagnosis;
    return !!(v?.title || v?.description || (Array.isArray(v?.symptoms) && v.symptoms.length));
  }, [currentDiagnosis]);

  if (isLoading) {
    return <LoadingState t={t} />;
  }

  if (!diagnosis) {
    return (
      <NotFoundState
        t={t}
        onBack={() => {
          nav("/docrecords/mychildren");
        }}
      />
    );
  }

  const title = currentDiagnosis.title;
  const description = currentDiagnosis.description || FALLBACK_TEXT;

  const meds = Array.isArray(currentDiagnosis?.medicine) ? currentDiagnosis.medicine : [];
  const tx = Array.isArray(currentDiagnosis?.treatment) ? currentDiagnosis.treatment : [];
  const ops = Array.isArray(currentDiagnosis?.operation) ? currentDiagnosis.operation : [];
  const hasClinical = meds.length > 0 || tx.length > 0 || ops.length > 0;

  const doctorEmail = currentDiagnosis?.createdBy?.email || "";
  const doctorName = currentDiagnosis?.createdBy?.name || "";
  let creatorLabel = t("myHealthState.detail.unknownDoctor");
  if (doctorName && doctorEmail) {
    creatorLabel = `${doctorName} (${doctorEmail})`;
  } else if (doctorName) {
    creatorLabel = doctorName;
  } else if (doctorEmail) {
    creatorLabel = doctorEmail;
  }
  const hasCreator = Boolean(currentDiagnosis?.createdBy);

  const createdAt = currentDiagnosis?.createdAt
    ? formatDateTime(currentDiagnosis.createdAt, lang)
    : "—";
  const updatedAt = currentDiagnosis?.updatedAt
    ? formatDateTime(currentDiagnosis.updatedAt, lang)
    : "—";

  const clearTranslatedData = () => {
    setTranslatedDiagnosis(null);
  };

  return (
    <PageShell>
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium leading-6 text-slate-600">
              <Stethoscope className="h-4 w-4 text-blue-600" aria-hidden="true" />
              {t("diagnoses.detail.pageTitle")}
            </p>
            <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {title}
            </h1>
          </div>

          <div className="grid w-full gap-2 sm:grid-cols-3 lg:w-auto lg:grid-cols-none lg:flex lg:items-center">
            <button
              type="button"
              onClick={() => nav(-1)}
              className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t("myChildren.backToHealthState")}
            </button>

            <Button
              variant="secondary"
              full={false}
              onClick={() => setHistoryOpen(true)}
              className="sm:w-auto"
            >
              <History className="h-4 w-4" aria-hidden="true" />
              {t("diagnoses.detail.history")}
            </Button>

            {hasText && (
              <Button
                variant="secondary"
                full={false}
                loading={translate.isPending}
                onClick={async () => {
                  try {
                    const data = await translate.mutateAsync({ childId, diagnosisId: id, lang });
                    setTranslatedDiagnosis({ childId, diagnosisId: id, lang, data });
                  } catch {
                    // The hook owns the user-facing error toast.
                  }
                }}
                className="sm:w-auto"
              >
                <Languages className="h-4 w-4" aria-hidden="true" />
                {t("common.translate")}
              </Button>
            )}
            {translatedActive && (
              <Button
                full={false}
                variant="secondary"
                onClick={clearTranslatedData}
                className="sm:col-span-2 lg:w-auto"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                {t("myHealthInfo.actions.clearTranslation")}
              </Button>
            )}
          </div>
        </div>
      </header>

      {translatedActive && (
        <section className="rounded-3xl border border-blue-200 bg-blue-50/80 p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
              <Info className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="min-w-0 break-words text-sm font-medium leading-6 text-blue-900">
              {t("common.translate")}
            </p>
          </div>
        </section>
      )}

      <SectionCard
        title={t("diagnoses.detail.description")}
        icon={FileText}
        tone="blue"
      >
        <p className="whitespace-pre-line break-words text-sm font-medium leading-6 text-slate-900">
          {description}
        </p>
      </SectionCard>

      {hasClinical && (
        <SectionCard title={t("common.clinicalDetails")} icon={Stethoscope} tone="emerald">
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
        </SectionCard>
      )}

      {hasCreator && (
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
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm sm:p-5">
        <div className="inline-flex items-center gap-2">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          <span>
            {t("diagnoses.detail.created")}: {createdAt} ·{" "}
            {t("diagnoses.detail.updated")}: {updatedAt}
          </span>
        </div>
      </section>

      {historyOpen && (
        <DiagnosisHistoryModal
          variant="child"
          childId={childId}
          diagnosisId={id}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </PageShell>
  );
}
