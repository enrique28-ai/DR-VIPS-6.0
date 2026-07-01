import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Clock3, FileText, Loader2 } from "lucide-react";
import { buildDiagnosisParams, useMyChildDiagnoses } from "../../features/diagnostics/dhooks.js";
import { useMyChildrenHealthInfo } from "../../features/patients/phooks.js";

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
            <div className="h-11 w-full animate-pulse rounded-xl bg-slate-200 sm:w-40" />
          </div>
          <p
            role="status"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600"
          >
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />
            {t("common.loading")}
          </p>
        </section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm"
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
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <FileText className="h-7 w-7" aria-hidden="true" />
      </div>
      <p className="mx-auto max-w-md text-sm font-medium leading-6 text-slate-600">
        {t("myChildren.noDiagnoses")}
      </p>
    </section>
  );
}

function ChildDiagnosisCard({ item, language, to }) {
  const title = item?.title || FALLBACK_TEXT;
  const preview = item?.description || FALLBACK_TEXT;
  const createdDate = item?.createdAt ? new Date(item.createdAt) : null;
  const createdText =
    createdDate && !Number.isNaN(createdDate.getTime())
      ? createdDate.toLocaleString(language)
      : FALLBACK_TEXT;

  return (
    <article
      className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-md sm:p-5"
      aria-label={title}
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-blue-500/70" aria-hidden="true" />
      <div className="min-w-0 pl-1">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <FileText className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold leading-tight text-slate-950">
          <Link
            to={to}
            className="break-words rounded-md hover:text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {title}
          </Link>
        </h2>
      </div>
      <p className="mt-3 line-clamp-3 min-h-[3.75rem] break-words pl-1 text-sm leading-6 text-slate-600">
        {preview}
      </p>
      <div className="mt-4 min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          {createdText}
        </span>
      </div>
    </article>
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
    return <LoadingState t={t} />;
  }

  const list = Array.isArray(data?.items) ? data.items : [];

  return (
    <PageShell>
      <header className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium leading-6 text-slate-600">
            <FileText className="h-4 w-4 text-blue-600" aria-hidden="true" />
            {t("myChildren.healthState")}
          </p>
          <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            {childName}
          </h1>
        </div>
        <Link
          to="/docrecords/mychildren"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-sm font-semibold text-blue-700 shadow-sm hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:shrink-0"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("myChildren.back")}
        </Link>
      </header>

      {list.length === 0 ? (
        <EmptyState t={t} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((d) => (
            <ChildDiagnosisCard
              key={d._id}
              item={d}
              language={i18n.language}
              to={`/docrecords/mychildren/${childId}/health-state/${d._id}`}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}
