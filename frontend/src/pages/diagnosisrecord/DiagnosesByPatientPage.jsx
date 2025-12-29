// src/pages/diagnosisrecord/DiagnosesByPatientPage.jsx
import React, { useMemo, useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import Input from "../../components/forms/Input.jsx";
import DiagnosisCard from "../../components/diagnostic/DiagnosisCard.jsx";
import EmptyDiagnoses from "../../components/diagnostic/EmptyDiagnoses.jsx";
import LocalizedDatePicker from "../../components/forms/LocalizedDatePicker.jsx";
import {
  useDiagnosesByPatient,
  useDeleteDiagnosis,
  buildDiagnosisParams,
} from "../../features/diagnostics/dhooks.js";
import { SlidersHorizontal, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

// utils
const pad = (n) => String(n).padStart(2, "0");
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const norm = (s = "") =>
  String(s).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const ANSWER_OPTIONS = ["All", "Yes", "No"]; // valores lógicos internos

export default function DiagnosesByPatientPage() {
  const { t, i18n} = useTranslation();
  const { patientId } = useParams();
  // helper tipo optionLabel de PatientsPage, pero para diagnoses
  const diagOptionLabel = (value) => {
    const key = String(value || "").toLowerCase();
    if (["all", "yes", "no"].includes(key)) {
      return t(`diagnoses.list.filters.options.${key}`);
    }
    return value;
  };

  // filtros UI
  const [q, setQ] = useState("");
  const [onDate, setOnDate] = useState("");
  const [page, setPage] = useState(1);
  const [showNoMatch, setShowNoMatch] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [hasMeds, setHasMeds] = useState("All"); // All | Yes | No
  const [hasTx,   setHasTx]   = useState("All"); // All | Yes | No
  const [hasOps,  setHasOps]  = useState("All"); // All | Yes | No
  const [pagesSnapshot, setPagesSnapshot] = useState(1);
  const FILTERS = [onDate ? "Date" : "All", hasMeds, hasTx, hasOps];
  const activeFiltersCount = FILTERS.filter(v => v !== "All").length;

  // --- regla: prefijos cortos se filtran local (no mandes q al server/$text)
  const raw = q.trim();
  const isNameQuery =
    /^[a-zñáéíóúü\s]+$/i.test(raw) && !raw.includes("@") && !/\d/.test(raw);

  // datos (React Query) — ahora con paginación
  const params = buildDiagnosisParams({ q: raw, date: onDate, hasMedicines: hasMeds, hasTreatments: hasTx, hasOperations: hasOps, page });
  const { data, isLoading, isFetching } = useDiagnosesByPatient(patientId, params);


const items = data?.items ?? [];
const pages = data?.pages ?? 1;
const current = data?.page ?? page;

  // 👇 páginas que usaremos SOLO para el texto (subtitle)
const subtitlePages = pages > 0 ? pages : pagesSnapshot;
  const hasAnyFilter   = !!raw || !!onDate || hasMeds !== "All" || hasTx !== "All" || hasOps !== "All"; // espejo de Patients

  

  // lista para render: refinado local SOLO por texto (prefijo por palabra)
  const display = useMemo(() => {

    let base = items;
    if (hasMeds !== "All") {
      const wantHas = hasMeds === "Yes";
      base = base.filter(
        (d) => (Array.isArray(d.medicine) && d.medicine.length > 0) === wantHas
      );
    }

    if (hasTx !== "All") {
      const wantHasTx = hasTx === "Yes";
      base = base.filter(
        (d) => (Array.isArray(d.treatment) && d.treatment.length > 0) === wantHasTx
      );
    }

     if (hasOps !== "All") {
    const wantHasOps = hasOps === "Yes";
    base = base.filter(
      (d) => (Array.isArray(d.operation) && d.operation.length > 0) === wantHasOps
    );
  }

    const qn = norm(raw);
    if (!qn) return base;
    return base.filter((d) => {
      const title = d.title ?? d.Diagnostic ?? d.diagnosis ?? "";
      const titleNorm   = norm(title);
      const titleTokens = titleNorm.split(/[\s,._-]+/).filter(Boolean);
      // 1) prefijo por palabra (R, Rt, Rtv...)
      const tokenMatch = titleTokens.some((t) => t.startsWith(qn));
      // 2) frase completa dentro del nombre ("rtv prueba", etc.)
      const phraseMatch = titleNorm.includes(qn);
      const nameMatch = tokenMatch || phraseMatch;

      const extraNorm = norm(
        [d.description ?? "", d.symptoms ?? ""].join(" ")
      );

      if (isNameQuery) {
        // si es tipo nombre (solo letras/espacios) usamos solo el nombre del dx
        return nameMatch;
      }

      // búsquedas generales: nombre o cualquier parte del extra
      return nameMatch || extraNorm.includes(qn);
    });
  }, [items, raw, isNameQuery, hasMeds, hasTx, hasOps]);

  useEffect(() => {
  // Solo actualizamos el snapshot cuando hay resultados y pages > 0
  if (items.length > 0 && pages > 0) {
    setPagesSnapshot(pages);
  }
}, [items.length, pages]);


  // “sticky no-match” mientras no hay refetch
  useEffect(() => {
   if (isFetching) return;
   if (raw) {
     // Hay texto: si el server trajo items pero tu filtro local por prefijo da 0 → no match
     setShowNoMatch(items.length > 0 && display.length === 0);
   } else if (onDate) {
     // Solo fecha: si el server trae 0 → no match
     setShowNoMatch(items.length === 0);
   } else {
     setShowNoMatch(false);
   }
 }, [isFetching, raw, onDate, items.length, display.length]);

  const subtitle = useMemo(() => {
    if (!hasAnyFilter){
       return t("diagnoses.list.subtitleDefault", {
        count: items.length,
        page: current,
        pages: subtitlePages,
      });
    }
    const parts = [];
    if (raw) parts.push(`“${raw}”`);
    if (onDate) parts.push(onDate);
    if (hasMeds !== "All") parts.push(`${t("diagnoses.list.filters.medicines")}: ${diagOptionLabel(hasMeds)}`);
    if (hasTx   !== "All") parts.push(`${t("diagnoses.list.filters.treatments")}: ${diagOptionLabel(hasTx)}`);
    if (hasOps  !== "All") parts.push(`${t("diagnoses.list.filters.operations")}: ${diagOptionLabel(hasOps)}`);
    const summary = parts.join(" · ");
    return t("diagnoses.list.subtitleFilters", {
      summary,
      count: display.length,
      page: current,
      pages: subtitlePages,
    });
  }, [hasAnyFilter, raw, onDate, display.length, items.length, current, pages, hasMeds, hasTx, hasOps, subtitlePages,  i18n.language,]);

  const clearFilters = () => {
    setQ("");
    setOnDate("");
    setHasMeds("All");
    setHasTx("All");
    setHasOps("All"); 
    setPage(1);
    setShowNoMatch(false);
  };

  const del = useDeleteDiagnosis();
  const handleDelete = (id) => del.mutate({ id, patientId });
  const deletingId = del.variables?.id;

  // al cambiar texto/fecha → vuelve a page 1
  useEffect(() => setPage(1), [raw, onDate, hasMeds, hasTx, hasOps]);

  // Skeleton primer fetch
  if (isLoading && !data) {
      return null; // o un skeleton si prefieres
  }

  // Paciente sin diagnósticos (sin filtros)
  if (!isLoading && !hasAnyFilter &&  items.length === 0) {
    return (
      <main className="mx-auto max-w-6xl p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{t("diagnoses.list.title")}</h1>
            <p className="text-sm text-gray-600">{t("diagnoses.empty.title")}</p>
          </div>
          <Link
            to={`/patients/${patientId}`}
            className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-100"
          >
            ← {t("diagnoses.list.filters.backToPatient")}
          </Link>
        </div>
        <EmptyDiagnoses patientId={patientId} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t("diagnoses.list.title")}</h1>
          <p className="text-sm text-gray-600">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/patients/${patientId}`}
            className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-100"
          >
             ← {t("diagnoses.list.filters.backToPatient")}
          </Link>
          <Link
            to={`/diagnosis/patient/${patientId}/new`}
            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            {t("diagnoses.create.cta")}
          </Link>
        </div>
      </div>

      {/* Filters */}
<section className="mb-6">
  <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
    {/* Toolbar: búsqueda + acciones */}
    <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:gap-4">
      <form onSubmit={(e) => e.preventDefault()} className="flex-1">
        <Input
          className="w-full h-11"
          placeholder={t("diagnoses.list.searchPlaceholder")}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
        />
      </form>

      <div className="flex items-center gap-2 md:self-start md:-mt-1">
        <button
          type="button"
          onClick={() => setShowMore((s) => !s)}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
          title={t("diagnoses.list.filters.more")}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {t("diagnoses.list.filters.more")}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showMore ? "rotate-180" : ""}`}
          />
          {activeFiltersCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-blue-600 px-2 text-xs font-semibold text-white">
              {activeFiltersCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={clearFilters}
          className="inline-flex h-10 items-center rounded-xl bg-slate-900 px-4 text-white hover:bg-black"
        >
           {t("diagnoses.list.filters.clear")}
        </button>
      </div>
    </div>

    {/* Panel avanzado colapsable */}
    <div className={`${showMore ? "grid" : "hidden"} grid-cols-1 gap-4 border-t border-gray-100 p-4 sm:grid-cols-2 lg:grid-cols-3`}>
      {/* On date */}
      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700">{t("diagnoses.list.filters.date")}</span>
        <div className="flex items-center gap-2">
          <LocalizedDatePicker
      value={onDate}
      onChange={(val) => {
        setOnDate(val);
        setPage(1);
      }}
    />
          <button
            type="button"
            onClick={() => {
              setOnDate(todayLocal());
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
            title="Today"
          >
             {t("diagnoses.list.filters.today")}
          </button>
        </div>
      </div>
      <div>
      <span className="mb-1 block text-sm font-medium text-gray-700">{t("diagnoses.list.filters.medicines")}</span>
      <div className="flex flex-wrap gap-2">
      {ANSWER_OPTIONS.map(v => (
        <button
          key={v}
          type="button"
          onClick={() => { setHasMeds(v); setPage(1); }}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
            hasMeds === v
              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
              : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
          }`}
        >
          {diagOptionLabel(v)}
        </button>
      ))}
    </div>
  </div>

      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700">{t("diagnoses.list.filters.treatments")}</span>
        <div className="flex flex-wrap gap-2">
          {ANSWER_OPTIONS.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => { setHasTx(v); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                hasTx === v
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
              }`}
            >
              {diagOptionLabel(v)}
            </button>
          ))}
        </div>
      </div>

    <div>
    <span className="mb-1 block text-sm font-medium text-gray-700">{t("diagnoses.list.filters.operations")}</span>
    <div className="flex flex-wrap gap-2">
      {ANSWER_OPTIONS.map(v => (
        <button
          key={v}
          type="button"
          onClick={() => { setHasOps(v); setPage(1); }}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
            hasOps === v
              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
              : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
          }`}
        >
          {diagOptionLabel(v)}
        </button>
      ))}
    </div>
  </div>
      
    </div>
  </div>
</section>

      {/* Contenido */}
      {(!isLoading && items.length === 0) ? (
  hasAnyFilter ? (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="rounded-full bg-gray-100 p-6 mb-4">
        <span className="text-3xl">🔎</span>
      </div>
      <h3 className="text-2xl font-bold">{t("diagnoses.list.noMatch.title")}</h3>
      <p className="mt-2 max-w-md text-gray-600">
        {t("diagnoses.list.noMatch.description")}
      </p>
      <button
        type="button"
        onClick={clearFilters}
        className="mt-6 inline-block rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-black cursor-pointer"
      >
         {t("diagnoses.list.noMatch.clear")}
      </button>
    </div>
  ) : (
    <EmptyDiagnoses patientId={patientId} />
  )
) : (
  showNoMatch ? (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="rounded-full bg-gray-100 p-6 mb-4">
        <span className="text-3xl">🔎</span>
      </div>
      <h3 className="text-2xl font-bold">{t("diagnoses.list.noMatch.title")}</h3>
      <p className="mt-2 max-w-md text-gray-600">
         {t("diagnoses.list.noMatch.description")}
      </p>
      <button
        type="button"
        onClick={clearFilters}
        className="mt-6 inline-block rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-black cursor-pointer"
      >
        {t("diagnoses.list.noMatch.clear")}
      </button>
    </div>
  ) : (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {display.map((d) => (
        <DiagnosisCard
          key={d._id}
          diagnosis={d}
          patientId={patientId}
          onDeleted={handleDelete}
          isDeleting={del.isPending && deletingId === d._id}
        />
      ))}
    </div>
  )
)}

      {/* Paginación (igual que Patients) */}
      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={current <= 1 || isFetching}
            onClick={() => setPage((n) => Math.max(1, n - 1))}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-50"
          >
            {t("diagnoses.list.pagination.prev")}
          </button>
          <span className="text-sm text-gray-600">
            {t("diagnoses.list.pagination.label", {
              page: current,
              pages,
            })}
          </span>
          <button
            type="button"
            disabled={current >= pages || isFetching}
            onClick={() => setPage((n) => n + 1)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-50"
          >
             {t("diagnoses.list.pagination.next")}
          </button>
        </div>
      )}
    </main>
  );
}
