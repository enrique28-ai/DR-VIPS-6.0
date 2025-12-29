import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function HealthStateCard({ diagnosis }) {
  const { t, i18n } = useTranslation();
  const id = diagnosis?._id;

  // mismo fallback que en Diagnoses, pero usando i18n para "Untitled"
  const title =
    (diagnosis?.title && String(diagnosis.title).trim()) ||
    (diagnosis?.name && String(diagnosis.name).trim()) ||
    (diagnosis?.Diagnostic && String(diagnosis.Diagnostic).trim()) ||
    (diagnosis?.diagnosis && String(diagnosis.diagnosis).trim()) ||
    t("diagnoses.detail.untitled");

  const preview = diagnosis?.description || diagnosis?.symptoms || "—";

  const stamp = diagnosis?.updatedAt || diagnosis?.createdAt;
  let stampTxt = "—";
  if (stamp) {
    const d = new Date(stamp);
    stampTxt = Number.isNaN(d.getTime())
      ? "—"
      : (i18n.language
          ? d.toLocaleString(i18n.language)
          : d.toLocaleString());
  }

  const doctorName  = diagnosis?.createdBy?.name || "";
  const doctorEmail = diagnosis?.createdBy?.email || "";

  // Texto final: "Nombre (correo)" si hay nombre, o solo correo si no
  let creatorLabel = t("myHealthState.detail.unknownDoctor");
  if (doctorName && doctorEmail) {
    creatorLabel = `${doctorName} (${doctorEmail})`;
  } else if (doctorName) {
    creatorLabel = doctorName;
  } else if (doctorEmail) {
    creatorLabel = doctorEmail;
  }

  return (
    <article
      className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md"
      aria-label={title}
    >
      {/* Solo el título es clickeable */}
      <h3 className="mb-1 text-lg font-semibold">
        <Link
          to={`/docrecords/myhealthstate/${id}`}
          className="hover:underline"
        >
          {title}
        </Link>
      </h3>

      <p className="mb-4 text-sm text-gray-600 line-clamp-2">
        {preview}
      </p>

      <div className="mt-auto space-y-1 text-xs text-gray-500">
        <div>
          {t("myHealthState.detail.createdBy")}{" "}
          <span className="font-medium text-gray-700">
            {creatorLabel}
          </span>
        </div>
        <div>
          {t("diagnoses.card.updated")}: {stampTxt}
        </div>
      </div>
    </article>
  );
}
