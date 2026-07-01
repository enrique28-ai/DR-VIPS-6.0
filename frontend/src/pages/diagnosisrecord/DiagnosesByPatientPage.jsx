// src/pages/diagnosisrecord/DiagnosesByPatientPage.jsx
import React, { useMemo, useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import Input from "../../components/forms/Input.jsx";
import DiagnosisCard from "../../components/diagnostic/DiagnosisCard.jsx";
import EmptyDiagnoses from "../../components/diagnostic/EmptyDiagnoses.jsx";
import LocalizedDatePicker from "../../components/forms/LocalizedDatePicker.jsx";
import {
  useDiagnosesByPatient,
  buildDiagnosisParams,
} from "../../features/diagnostics/dhooks.js";
import { ArrowLeft, CalendarDays, ChevronDown, Search, SearchX, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";

const ADVANCED_FILTERS_ID = "diagnoses-advanced-filters";

// utils
const pad = (n) => String(n).padStart(2, "0");
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const norm = (s = "") =>
  String(s).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const ANSWER_OPTIONS = ["All", "Yes", "No"]; // valores lógicos internos

function LoadingState({ title, loadingLabel }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">{loadingLabel}</p>
          </div>
          <div className="h-11 w-full animate-pulse rounded-xl bg-slate-200 sm:w-44" />
        </div>
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
        </section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div
              key={item}
              className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm"
            />
          ))}
        </div>
      </div>
    </main>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3"
    >
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-10 shrink-0 items-center rounded-full border px-3 text-sm font-semibold transition ${
        active
          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"
      } focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2`}
    >
      {children}
    </button>
  );
}

function ChipScroller({ children }) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
      {children}
    </div>
  );
}

function NoMatchState({ title, description, clearLabel, onClear }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <SearchX className="h-7 w-7" aria-hidden="true" />
      </div>
      <h3 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{description}</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        {clearLabel}
      </button>
    </div>
  );
}

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

 

  // al cambiar texto/fecha → vuelve a page 1
  useEffect(() => setPage(1), [raw, onDate, hasMeds, hasTx, hasOps]);

  // Skeleton primer fetch
  if (isLoading && !data) {
    return <LoadingState title={t("diagnoses.list.title")} loadingLabel={t("common.loading")} />;
  }

  // Paciente sin diagnósticos (sin filtros)
  if (!isLoading && !hasAnyFilter &&  items.length === 0) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{t("diagnoses.list.title")}</h1>
              <p className="mt-1 text-sm font-medium text-slate-600">{t("diagnoses.empty.title")}</p>
            </div>
            <Link
              to={`/patients/${patientId}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t("diagnoses.list.filters.backToPatient")}
            </Link>
          </div>
          <EmptyDiagnoses patientId={patientId} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{t("diagnoses.list.title")}</h1>
            <p className="mt-1 text-sm font-medium leading-6 text-slate-600">{subtitle}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              to={`/patients/${patientId}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t("diagnoses.list.filters.backToPatient")}
            </Link>
            <Link
              to={`/diagnosis/patient/${patientId}/new`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:shrink-0"
            >
              {t("diagnoses.create.cta")}
            </Link>
          </div>
        </div>

        {/* Filters */}
        <section className="mb-6" aria-busy={isFetching}>
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            {/* Toolbar: búsqueda + acciones */}
            <div className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:gap-4">
              <form onSubmit={(e) => e.preventDefault()} className="flex-1">
                <Input
                  icon={Search}
                  containerClassName="mb-0"
                  className="w-full h-11"
                  placeholder={t("diagnoses.list.searchPlaceholder")}
                  aria-label={t("diagnoses.list.searchPlaceholder")}
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

              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                <button
                  type="button"
                  onClick={() => setShowMore((s) => !s)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  title={t("diagnoses.list.filters.more")}
                  aria-expanded={showMore}
                  aria-controls={ADVANCED_FILTERS_ID}
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  {t("diagnoses.list.filters.more")}
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${showMore ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                  {activeFiltersCount > 0 && (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  {t("diagnoses.list.filters.clear")}
                </button>
              </div>
            </div>

            {/* Panel avanzado colapsable */}
            <div
              id={ADVANCED_FILTERS_ID}
              className={`${showMore ? "grid" : "hidden"} grid-cols-1 gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-3`}
            >
              <FilterGroup label={t("diagnoses.list.filters.date")}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <LocalizedDatePicker
                      value={onDate}
                      onChange={(val) => {
                        setOnDate(val);
                        setPage(1);
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOnDate(todayLocal());
                      setPage(1);
                    }}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    title={t("diagnoses.list.filters.today")}
                  >
                    <CalendarDays className="h-4 w-4" aria-hidden="true" />
                    {t("diagnoses.list.filters.today")}
                  </button>
                </div>
              </FilterGroup>

              <FilterGroup label={t("diagnoses.list.filters.medicines")}>
                <ChipScroller>
                  {ANSWER_OPTIONS.map((v) => (
                    <FilterButton
                      key={v}
                      active={hasMeds === v}
                      onClick={() => { setHasMeds(v); setPage(1); }}
                    >
                      {diagOptionLabel(v)}
                    </FilterButton>
                  ))}
                </ChipScroller>
              </FilterGroup>

              <FilterGroup label={t("diagnoses.list.filters.treatments")}>
                <ChipScroller>
                  {ANSWER_OPTIONS.map((v) => (
                    <FilterButton
                      key={v}
                      active={hasTx === v}
                      onClick={() => { setHasTx(v); setPage(1); }}
                    >
                      {diagOptionLabel(v)}
                    </FilterButton>
                  ))}
                </ChipScroller>
              </FilterGroup>

              <FilterGroup label={t("diagnoses.list.filters.operations")}>
                <ChipScroller>
                  {ANSWER_OPTIONS.map((v) => (
                    <FilterButton
                      key={v}
                      active={hasOps === v}
                      onClick={() => { setHasOps(v); setPage(1); }}
                    >
                      {diagOptionLabel(v)}
                    </FilterButton>
                  ))}
                </ChipScroller>
              </FilterGroup>
            </div>
          </div>
        </section>

        {/* Contenido */}
        {(!isLoading && items.length === 0) ? (
  hasAnyFilter ? (
    <NoMatchState
      title={t("diagnoses.list.noMatch.title")}
      description={t("diagnoses.list.noMatch.description")}
      clearLabel={t("diagnoses.list.noMatch.clear")}
      onClear={clearFilters}
    />
  ) : (
    <EmptyDiagnoses patientId={patientId} />
  )
) : (
  showNoMatch ? (
    <NoMatchState
      title={t("diagnoses.list.noMatch.title")}
      description={t("diagnoses.list.noMatch.description")}
      clearLabel={t("diagnoses.list.noMatch.clear")}
      onClear={clearFilters}
    />
  ) : (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {display.map((d) => (
        <DiagnosisCard
          key={d._id}
          diagnosis={d}
          patientId={patientId}
        />
      ))}
    </div>
  )
)}

        {/* Paginación (igual que Patients) */}
        {pages > 1 && (
          <div className="mt-6 flex flex-col items-stretch justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={current <= 1 || isFetching}
              onClick={() => setPage((n) => Math.max(1, n - 1))}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {t("diagnoses.list.pagination.prev")}
            </button>
            <span className="text-center text-sm font-medium text-slate-600">
              {t("diagnoses.list.pagination.label", {
                page: current,
                pages,
              })}
            </span>
            <button
              type="button"
              disabled={current >= pages || isFetching}
              onClick={() => setPage((n) => n + 1)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {t("diagnoses.list.pagination.next")}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
