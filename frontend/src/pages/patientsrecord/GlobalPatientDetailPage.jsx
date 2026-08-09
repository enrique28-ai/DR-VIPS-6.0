import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Globe, Send } from "lucide-react";
import Button from "../../components/forms/Button.jsx";
import { useGlobalPatient, useImportPatient } from "../../features/patients/phooks.js";
import { localizeCountryName } from "../../utilsfront/geoLabels.js";

const missingValue = "-";

export default function GlobalPatientDetailPage() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const { id } = useParams();

  const { data: patient, isLoading, isError } = useGlobalPatient(id);
  const { mutate: importPatient, isPending, data: accessRequestResult } = useImportPatient();
  const requestPending = accessRequestResult?.accessRequest?.status === "pending";

  if (isLoading) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-slate-50 px-4 py-6 sm:px-6 lg:px-8" aria-busy="true">
        <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 h-5 w-40 animate-pulse rounded-full bg-slate-200" />
          <div className="h-9 w-64 max-w-full animate-pulse rounded-xl bg-slate-200" />
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="rounded-lg border border-slate-100 bg-slate-50/80 p-4">
                <div className="h-3 w-16 animate-pulse rounded-full bg-slate-200" />
                <div className="mt-3 h-5 w-32 max-w-full animate-pulse rounded-full bg-slate-200" />
              </div>
            ))}
          </div>
          <p role="status" aria-live="polite" className="mt-5 text-sm font-medium text-slate-600">
            {t("common.loading") || "Loading..."}
          </p>
        </section>
      </main>
    );
  }

  if (isError || !patient) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
        <section
          role="alert"
          className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm"
        >
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            {t("patients.detail.notFoundText") || "Not found"}
          </h1>
          <Button
            variant="secondary"
            full={false}
            onClick={() => nav("/patients/search")}
            className="mt-6 w-full sm:w-auto"
          >
            {t("common.back") || "Back"}
          </Button>
        </section>
      </main>
    );
  }

  if (patient.amIOwner) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
        <section className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Globe className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            {t("patients.global.alreadyOwned") || "You already have this patient."}
          </h1>
          <Link
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            to={`/patients/${patient._id}`}
          >
            {t("patients.global.goToDetail") || "Go to Patient Detail"}
          </Link>
        </section>
      </main>
    );
  }

  const previewDescription =
    t("patients.global.previewDesc") ||
    "Request access from the patient or guardian before viewing or editing the medical record.";
  const patientFields = [
    {
      label: t("patients.detail.email") || "Email",
      value: patient.email || missingValue,
    },
    {
      label: t("patients.detail.phone") || "Phone",
      value: patient.phone || missingValue,
    },
    {
      label: t("patients.card.country") || "Country",
      value: patient.country ? localizeCountryName(patient.country, i18n.language) : missingValue,
    },
    {
      label: t("patients.card.age") || "Age",
      value: patient.age ?? missingValue,
    },
  ];

  const onImport = () => {
    importPatient(patient._id);
  };
  const requestActionLabel = requestPending
    ? (t("patients.global.requestPending") || "Request pending")
    : isPending
      ? (t("patients.global.importing") || "Sending request...")
      : (t("patients.global.importBtn") || "Request access");

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <section className="mb-5 rounded-lg border border-blue-200 bg-blue-50/80 p-4 text-blue-950 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/80 text-blue-700 shadow-sm">
              <Globe className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold">{t("patients.global.previewMode") || "Global Preview"}</p>
              <p id="global-preview-desc" className="mt-1 text-sm leading-6 text-blue-900">
                {previewDescription}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("patients.global.previewMode") || "Global Preview"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{patient.fullname}</h1>

          <dl className="mt-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            {patientFields.map((field) => (
              <div key={field.label} className="rounded-lg border border-slate-100 bg-slate-50/80 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{field.label}</dt>
                <dd className="mt-1 break-words font-medium text-slate-900">{field.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center">
            <Button
              onClick={onImport}
              disabled={isPending || requestPending}
              aria-busy={isPending}
              aria-describedby="global-preview-desc"
              full={false}
              className="w-full sm:w-auto"
            >
              <Send className="h-5 w-5" aria-hidden="true" />
              {requestActionLabel}
            </Button>

            <Button
              variant="secondary"
              onClick={() => nav("/patients/search")}
              full={false}
              className="w-full sm:w-auto"
            >
              {t("common.back") || "Back"}
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
