import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, FileText, History, Languages, Loader2 } from "lucide-react";
import Button from "../../components/forms/Button.jsx";

import DiagnosisHistoryModal from "../../components/diagnostic/DiagnosisHistoryModal.jsx";
import {
  useMyChildDiagnosis,
  useTranslateChildDiagnosisHistorySnapshot,
} from "../../features/diagnostics/dhooks.js";

const FALLBACK_TEXT = "-";

function PageShell({ children }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </div>
    </main>
  );
}

function LoadingState({ t }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50" aria-busy="true">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
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
            <FileText className="h-7 w-7" aria-hidden="true" />
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

  const title = diagnosis.title;
  const description = diagnosis.description || FALLBACK_TEXT;

  return (
    <PageShell>
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium leading-6 text-slate-600">
              <FileText className="h-4 w-4 text-blue-600" aria-hidden="true" />
              {t("myChildren.healthState")}
            </p>
            <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {title}
            </h1>
          </div>

          <div className="grid w-full gap-2 sm:grid-cols-3 lg:w-auto lg:flex lg:items-center">
            <Button variant="secondary" full={false} onClick={() => nav(-1)} className="w-full">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t("common.back")}
            </Button>

            <Button
              variant="secondary"
              full={false}
              onClick={() => setHistoryOpen(true)}
              className="w-full"
            >
              <History className="h-4 w-4" aria-hidden="true" />
              {t("diagnoses.history.title")}
            </Button>

            {hasText && (
              <Button
                variant="secondary"
                full={false}
                loading={translate.isPending}
                onClick={async () => {
                  await translate.mutateAsync({ childId, diagnosisId: id, lang });
                }}
                className="w-full"
              >
                <Languages className="h-4 w-4" aria-hidden="true" />
                {t("common.translate")}
              </Button>
            )}
          </div>
        </div>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-slate-950">
            {t("myChildren.healthState")}
          </h2>
        </div>
        <p className="mt-4 break-words text-sm leading-6 text-slate-700">{description}</p>
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
