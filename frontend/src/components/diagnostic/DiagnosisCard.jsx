import React from "react";
import { Link } from "react-router-dom";
import { Pencil, Languages, Loader2, FileText } from "lucide-react";
import Button from "../forms/Button.jsx";
import { useTranslation } from "react-i18next";
import { useTranslateDiagnosis } from "../../features/diagnostics/dhooks.js";
import { useState, useEffect } from "react";


export default function DiagnosisCard({ diagnosis, patientId, onTranslateTitles, translatingTitles  }) {
  const { t, i18n } = useTranslation();
   const [translatedTitle, setTranslatedTitle] = useState(null);

  const { mutate: translateOne, isPending: translatingOne } = useTranslateDiagnosis();
   // si cambias idioma, "olvida" el título traducido previo (opcional pero recomendado)
  useEffect(() => {
    setTranslatedTitle(null);
  }, [i18n.language]);


  const handleTranslateThisCard = () => {
  translateOne(
    { id: diagnosis._id, lang: i18n.language },
    { onSuccess: (data) => setTranslatedTitle(data?.title ?? null) }
  );
};

const title =
  translatedTitle ||
  (diagnosis?.title && String(diagnosis.title)) ||
  (diagnosis?.Diagnostic && String(diagnosis.Diagnostic)) ||
  t("diagnoses.detail.untitled");


  const updated = diagnosis?.updatedAt
    ? new Date(diagnosis.updatedAt).toLocaleString(i18n.language)
    : "—";

  return (
    <article
      className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-md sm:p-5"
      aria-label={title}
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-blue-500/70" aria-hidden="true" />

      <button
        type="button"
        onClick={handleTranslateThisCard}
        disabled={!!translatingOne}
        className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-blue-50 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        title={t("common.translate")}
        aria-label={t("common.translate")}
      >
        {translatingOne ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Languages className="h-4 w-4" aria-hidden="true" />
        )}
      </button>

      <div className="min-w-0 pl-1">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <FileText className="h-5 w-5" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-semibold leading-tight text-slate-950">
          <Link
            to={`/diagnosis/patient/${patientId}/${diagnosis._id}`}
            className="break-words rounded-md hover:text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {title}
          </Link>
        </h3>
      </div>

      <div className="mt-4 grid gap-2 pl-1 text-sm">
        <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("diagnoses.card.updated")}</span>
          <span className="mt-1 block break-words font-medium text-slate-900">{updated}</span>
        </div>
      </div>

      <div className="mt-auto w-full pl-1">
        <Link to={`/diagnosis/patient/${patientId}/${diagnosis._id}/edit`}>
          <Button
            variant="secondary"
            full={false}
            className="w-full inline-flex items-center justify-center gap-2"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            {t("diagnoses.card.edit")}
          </Button>
        </Link>
      </div>
    </article>
  );
}
