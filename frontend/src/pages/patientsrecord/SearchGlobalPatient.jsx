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
    <main className="mx-auto max-w-4xl p-4">
      <div className="mb-6 flex items-start justify-between gap-4">
  <div>
    <h1 className="text-2xl font-bold">
      {t("patients.searchGlobal.title") || "Add Patient"}
    </h1>
    <p className="text-gray-600">
      {t("patients.searchGlobal.subtitle") ||
        "Search globally to import an existing patient, or create a new one."}
    </p>
  </div>

  {/* ✅ Botón para regresar a PatientsPage */}
  <Link
    to="/patients"
    className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
  >
    <ArrowLeft className="h-4 w-4" />
    {t("patients.detail.back") || "Back to Patients"}
  </Link>
</div>


      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
          <Input
            className="w-full pl-10"
            placeholder={t("patients.searchGlobal.placeholder") || "Search by name, email or phone (min 3 chars)..."}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>

        <div className="mt-4 flex items-center justify-between border-t pt-4">
          <span className="text-sm text-gray-500">
            {t("patients.searchGlobal.notFound") || "Not found?"}
          </span>

          <Link
            to="/patients/new"
            className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black"
          >
            <UserPlus className="h-4 w-4" />
            {t("patients.searchGlobal.createNew") || "Create new patient"}
          </Link>
        </div>
      </div>

      <section className="mt-6">
        {!enabled && (
          <div className="text-sm text-gray-500">
            {t("patients.searchGlobal.minChars") || "Type at least 3 characters to search."}
          </div>
        )}

        {enabled && isFetching && (
          <div className="py-6 text-gray-500">{t("patients.searchGlobal.searching") || "Searching..."}</div>
        )}

        {enabled && isError && (
          <div className="py-6 text-red-500">{t("patients.searchGlobal.error") || "Error searching patients."}</div>
        )}

        {enabled && !isFetching && !isError && (
          <>
            <h2 className="mb-3 text-lg font-semibold">
              {results.length ? (t("patients.searchGlobal.resultsTitle") || "Results") : (t("patients.searchGlobal.noResults") || "No results")}
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              {results.map((p) => (
                <PatientCard key={p._id} patient={p} isGlobal />
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
