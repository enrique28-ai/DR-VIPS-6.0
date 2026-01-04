import React from "react";
import { Link } from "react-router-dom";
import { Pencil } from "lucide-react";
import Button from "../forms/Button.jsx";
import { useTranslation } from "react-i18next";


export default function DiagnosisCard({ diagnosis, patientId }) {
  const { t } = useTranslation();
  const title =
    (diagnosis?.title && String(diagnosis.title)) ||
    (diagnosis?.Diagnostic && String(diagnosis.Diagnostic)) ||
    t("diagnoses.detail.untitled");

  const updated = diagnosis?.updatedAt
    ? new Date(diagnosis.updatedAt).toLocaleString()
    : "—";

  return (
    <article className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
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
