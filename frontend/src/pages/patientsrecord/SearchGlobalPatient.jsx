import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, UserPlus, ArrowLeft } from "lucide-react";
import Input from "../../components/forms/Input.jsx";
import PatientCard from "../../components/patient/PatientCard.jsx";
import { useSearchGlobalPatients } from "../../features/patients/phooks.js";

export default function SearchGlobalPatient() {
  const { t } = useTranslation();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const searchInputId = "global-patient-search";
  const helperTextId = "global-patient-search-help";
  const resultsTitleId = "global-patient-results-title";

  // debounce simple (evita spamear backend)
  useEffect(() => {
    const v = term.trim();
    const id = setTimeout(() => setDebounced(v), 350);
    return () => clearTimeout(id);
  }, [term]);

  const enabled = debounced.length >= 3;
  const { data, isFetching, isError } = useSearchGlobalPatients(debounced, { enabled });

  const results = useMemo(() => Array.isArray(data) ? data : [], [data]);

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("patients.searchGlobal.searchBtn", { defaultValue: "Search Global" })}
            </p>
            <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">
              <span>{t("patients.searchGlobal.title", { defaultValue: "Add Patient" })}</span>
              <span className="block text-base font-semibold text-slate-600 sm:text-lg">
                {t("patients.searchGlobal.resultsTitle", { defaultValue: "Global patient search" })}
              </span>
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t("patients.searchGlobal.subtitle", {
                defaultValue: "Search globally to import an existing patient, or create a new one.",
              })}
            </p>
          </div>

          <Link
            to="/patients"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("patients.detail.back", { defaultValue: "Back to Patients" })}
          </Link>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <label
              htmlFor={searchInputId}
              className="mb-1.5 block text-sm font-semibold text-slate-700"
            >
              {t("patients.searchGlobal.searchBtn", { defaultValue: "Search Global" })}
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <Input
                id={searchInputId}
                name="globalPatientSearch"
                containerClassName="mb-0"
                className="w-full pl-10"
                placeholder={t("patients.searchGlobal.placeholder", {
                  defaultValue: "Search by name, email or phone",
                })}
                aria-describedby={helperTextId}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
            </div>
            <p id={helperTextId} className="mt-2 text-sm text-slate-500">
              {t("patients.searchGlobal.minChars", {
                defaultValue: "Type at least 3 characters to search.",
              })}
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-slate-500">
              {t("patients.searchGlobal.notFound", { defaultValue: "Not found?" })}
            </span>

            <Link
              to="/patients/new"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              {t("patients.searchGlobal.createNew", { defaultValue: "Create new patient" })}
            </Link>
          </div>
        </div>

        <section
          className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          role="region"
          aria-labelledby={resultsTitleId}
        >
          <h2
            id={resultsTitleId}
            className={enabled && !isFetching && !isError ? "mb-4 text-lg font-semibold text-slate-950" : "sr-only"}
          >
            {enabled && !isFetching && !isError && results.length
              ? `${t("patients.searchGlobal.resultsTitle", { defaultValue: "Results" })} (${results.length})`
              : enabled && !isFetching && !isError
                ? t("patients.searchGlobal.noResults", { defaultValue: "No results" })
                : t("patients.searchGlobal.resultsTitle", { defaultValue: "Results" })}
          </h2>

          {!enabled && (
            <div className="rounded-lg bg-slate-50 px-4 py-5 text-sm text-slate-600">
              {t("patients.searchGlobal.minChars", {
                defaultValue: "Type at least 3 characters to search.",
              })}
            </div>
          )}

          {enabled && isFetching && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-lg bg-slate-50 px-4 py-5 text-sm text-slate-600"
            >
              {t("patients.searchGlobal.searching", { defaultValue: "Searching..." })}
            </div>
          )}

          {enabled && isError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-5 text-sm font-medium text-red-700"
            >
              {t("patients.searchGlobal.error", { defaultValue: "Error searching patients." })}
            </div>
          )}

          {enabled && !isFetching && !isError && (
            <>
              {results.length ? (
                <ul className="grid gap-4 sm:grid-cols-2">
                  {results.map((p) => (
                    <li key={p._id}>
                      <PatientCard patient={p} isGlobal />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-lg bg-slate-50 px-4 py-5 text-sm text-slate-600">
                  <p>{t("patients.searchGlobal.noResults", { defaultValue: "No results" })}</p>
                  <p className="mt-1">
                    {t("patients.searchGlobal.suggestCreate", {
                      defaultValue: "If the patient is not in the system, please create a new record.",
                    })}
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
