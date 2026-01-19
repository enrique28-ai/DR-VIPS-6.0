import React from "react";
import { Link } from "react-router-dom";
import { Pencil, Languages, Loader2 } from "lucide-react";
import Button from "../forms/Button.jsx";
import { useTranslation } from "react-i18next";
import { useTranslateDiagnosis } from "../../features/diagnostics/dhooks.js";
import { useState, useEffect } from "react";


export default function DiagnosisCard({ diagnosis, patientId, onTranslateTitles, translatingTitles  }) {
  const { t, i18n } = useTranslation();
   const [translatedTitle, setTranslatedTitle] = useState(null);

  const { mutate: translateOne, isPending: translatingOne } = useTranslateDiagnosis();
   // si cambias idioma, “olvida” el título traducido previo (opcional pero recomendado)
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
    ? new Date(diagnosis.updatedAt).toLocaleString()
    : "—";

  return (
    <article className="relative flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <button
  type="button"
  onClick={handleTranslateThisCard}
  disabled={!!translatingOne}
  className="absolute right-4 top-4 rounded-full p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
  title="Translate"
>
  {translatingOne ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <Languages className="h-4 w-4" />
  )}
</button>
      <h3 className="text-lg font-semibold mb-1">
        <Link
          to={`/diagnosis/patient/${patientId}/${diagnosis._id}`}
          className="hover:underline"
        >
          {title}
        </Link>
      </h3>
      <p className="mb-4 text-sm text-gray-600">{t("diagnoses.card.updated")}: {updated}</p>

      <div className="mt-auto w-full">
        <Link to={`/diagnosis/patient/${patientId}/${diagnosis._id}/edit`}>
          <Button
            variant="secondary"
            className="w-full inline-flex items-center justify-center gap-2"
          >
            <Pencil className="h-4 w-4" />
            {t("diagnoses.card.edit")}
          </Button>
        </Link>
      </div>
    </article>
  );
}
