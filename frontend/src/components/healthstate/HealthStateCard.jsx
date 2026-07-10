import React from "react";
import { Link } from "react-router-dom";
import { Clock3, FileText, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";

const FALLBACK_TEXT = "-";

export default function HealthStateCard({ diagnosis }) {
  const { t, i18n } = useTranslation();
  const id = diagnosis?._id;

  const title =
    (diagnosis?.title && String(diagnosis.title).trim()) ||
    (diagnosis?.name && String(diagnosis.name).trim()) ||
    (diagnosis?.Diagnostic && String(diagnosis.Diagnostic).trim()) ||
    (diagnosis?.diagnosis && String(diagnosis.diagnosis).trim()) ||
    t("diagnoses.detail.untitled");

  const stamp = diagnosis?.updatedAt || diagnosis?.createdAt;
  let stampTxt = FALLBACK_TEXT;
  if (stamp) {
    const d = new Date(stamp);
    stampTxt = Number.isNaN(d.getTime())
      ? FALLBACK_TEXT
      : i18n.language
        ? d.toLocaleString(i18n.language)
        : d.toLocaleString();
  }

  const doctorName = diagnosis?.createdBy?.name || "";
  const doctorEmail = diagnosis?.createdBy?.email || "";

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
      className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-md sm:p-5"
      aria-label={title}
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-blue-500/70" aria-hidden="true" />

      <div className="min-w-0 pl-1">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <FileText className="h-5 w-5" aria-hidden="true" />
        </div>

        <h3 className="text-lg font-semibold leading-tight text-slate-950">
          <Link
            to={`/docrecords/myhealthstate/${id}`}
            className="break-words rounded-md hover:text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {title}
          </Link>
        </h3>
      </div>

      <div className="mt-4 grid gap-2 pl-1 text-sm">
        <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
            {t("myHealthState.detail.createdBy")}
          </span>
          <span className="mt-1 block break-words font-medium text-slate-900">
            {creatorLabel}
          </span>
        </div>
        <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            {t("diagnoses.card.updated")}
          </span>
          <span className="mt-1 block break-words font-medium text-slate-900">
            {stampTxt}
          </span>
        </div>
      </div>
    </article>
  );
}
