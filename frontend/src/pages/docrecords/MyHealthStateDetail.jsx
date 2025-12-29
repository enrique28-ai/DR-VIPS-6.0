// src/pages/DocRecords/MyHealthStateDetail.jsx
import { Link, useParams } from "react-router-dom";
import Button from "../../components/forms/Button.jsx";
import { useMyDiagnosis } from "../../features/diagnostics/dhooks.js";
import { CalendarClock, Pill, Syringe, Scissors } from "lucide-react";
import { useTranslation } from "react-i18next";

// helper para fechas localizadas
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

export default function MyHealthStateDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { data: diag, isLoading, isError } = useMyDiagnosis(id);

  // Evitar flash en primer fetch
  if (isLoading && !diag) return null;

  if (isError || !diag) {
    return (
      <main className="mx-auto max-w-3xl p-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">
            {t("diagnoses.detail.notFoundTitle")}
          </h1>
          <div className="mt-4">
            <Link to="/docrecords/myhealthstate">
              <Button variant="secondary">
                {t("myHealthState.detail.backToState")}
              </Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const title =
    diag.title ??
    diag.Diagnostic ??
    diag.diagnosis ??
    t("diagnoses.detail.untitled");

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

  return (
    <main className="mx-auto max-w-3xl p-4">
      {/* Back */}
      <div className="mb-4">
        <Link
          to="/docrecords/myhealthstate"
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100"
        >
          ← {t("myHealthState.detail.backToState")}
        </Link>
      </div>

      {/* Header */}
      <header className="mb-4">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {t("myHealthState.detail.createdBy")}{" "}
          <span className="font-medium text-gray-800">{creatorLabel}</span>
        </p>
      </header>

      {/* Content card */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {/* Description */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-gray-700">
          <dt className="font-medium">
            {t("diagnoses.detail.description")}
          </dt>
          <dd className="whitespace-pre-line mb-6 sm:mb-8">
            {diag.description?.trim() || "—"}
          </dd>
        </div>

        {/* Lists with icons */}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-gray-700 sm:grid-cols-2">
          {meds.length > 0 && (
            <>
              <dt className="font-medium flex items-center gap-1">
                <Pill className="h-4 w-4" /> {t("diagnoses.detail.medicines")}
              </dt>
              <dd className="flex flex-wrap gap-1">
                {meds.map((m, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm"
                  >
                    {m}
                  </span>
                ))}
              </dd>
            </>
          )}

          {tx.length > 0 && (
            <>
              <dt className="font-medium flex items-center gap-1">
                <Syringe className="h-4 w-4" />{" "}
                {t("diagnoses.detail.treatments")}
              </dt>
              <dd className="flex flex-wrap gap-1">
                {tx.map((tItem, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm"
                  >
                    {tItem}
                  </span>
                ))}
              </dd>
            </>
          )}

          {ops.length > 0 && (
            <>
              <dt className="font-medium flex items-center gap-1">
                <Scissors className="h-4 w-4" />{" "}
                {t("diagnoses.detail.operations")}
              </dt>
              <dd className="flex flex-wrap gap-1">
                {ops.map((o, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm"
                  >
                    {o}
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>

        {/* Timestamps */}
        <div className="mt-4 text-sm text-gray-500 inline-flex items-center gap-2">
          <CalendarClock className="h-4 w-4" />
          <span>
            {t("diagnoses.detail.created")}: {createdAt} ·{" "}
            {t("diagnoses.detail.updated")}: {updatedAt}
          </span>
        </div>
      </section>
    </main>
  );
}
