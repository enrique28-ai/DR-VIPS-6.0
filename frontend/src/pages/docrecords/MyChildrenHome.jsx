import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Baby, CheckCircle2, HeartPulse, Loader2 } from "lucide-react";
import { useMyChildrenHealthInfo } from "../../features/patients/phooks.js";

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
            <div className="h-11 w-full animate-pulse rounded-xl bg-slate-200 sm:w-44" />
          </div>
          <p
            role="status"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600"
          >
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />
            {t("common.loading")}
          </p>
        </section>
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((item) => (
            <div
              key={item}
              className="h-48 animate-pulse rounded-3xl border border-slate-200 bg-white shadow-sm"
            />
          ))}
        </div>
      </div>
    </main>
  );
}

function EmptyState({ t }) {
  return (
    <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
        <Baby className="h-7 w-7" aria-hidden="true" />
      </div>
      <p className="mx-auto max-w-md text-sm font-medium leading-6 text-slate-600">
        {t("myChildren.empty")}
      </p>
    </section>
  );
}

function ChildAction({ disabled, icon: Icon, label, to }) {
  if (disabled) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-400 sm:w-auto"
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
    );
  }

  return (
    <Link
      to={to}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-3 text-sm font-semibold text-blue-700 shadow-sm hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:w-auto"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

function ChildCard({ child, t }) {
  const snap = child?.snapshot || {};
  const name = snap?.fullname?.value || t("myChildren.unknownChild");
  const age = snap?.age?.value;
  const childId = snap?.sources?.[0]?.id;
  const hasChildId = Boolean(childId);

  return (
    <article className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div
        className={`absolute inset-y-0 left-0 w-1 ${child?.pendingDecision ? "bg-amber-500/80" : "bg-blue-500/70"}`}
        aria-hidden="true"
      />
      <div className="min-w-0 pl-1">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <Baby className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="break-words text-lg font-semibold leading-tight text-slate-950">
                {name}
              </h2>
              {Number.isFinite(age) && (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {t("myChildren.ageYears", { age })}
                </span>
              )}
            </div>
          </div>
          <div
            className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-semibold ${
              child?.pendingDecision
                ? "bg-amber-50 text-amber-800"
                : "bg-emerald-50 text-emerald-800"
            }`}
          >
            {child?.pendingDecision ? (
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            )}
            {child?.pendingDecision ? t("myChildren.pending") : t("myChildren.upToDate")}
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
          <ChildAction
            disabled={!hasChildId}
            icon={HeartPulse}
            label={t("myChildren.healthInfo")}
            to={`/docrecords/mychildren/${childId}/health-info`}
          />
          <ChildAction
            disabled={!hasChildId}
            icon={HeartPulse}
            label={t("myChildren.healthState")}
            to={`/docrecords/mychildren/${childId}/health-state`}
          />
        </div>
      </div>
    </article>
  );
}

export default function MyChildrenHome() {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useMyChildrenHealthInfo(i18n.language);

  if (isLoading) {
    return <LoadingState t={t} />;
  }

  const children = Array.isArray(data) ? data : [];

  return (
    <PageShell>
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium leading-6 text-slate-600">
            <Baby className="h-4 w-4 text-blue-600" aria-hidden="true" />
            {t("myChildren.subtitle")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            {t("myChildren.title")}
          </h1>
        </div>
      </header>

      {children.length === 0 ? (
        <EmptyState t={t} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {children.map((child) => (
            <ChildCard key={child.childKey} child={child} t={t} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
