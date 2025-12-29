// src/pages/patientsrecord/PatientsPage.jsx
import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import Input from "../../components/forms/Input.jsx";
import PatientCard from "../../components/patient/PatientCard.jsx";
import EmptyPatients from "../../components/patient/EmptyPatients.jsx";
import { usePatients, useDeletePatient, buildPatientParams } from "../../features/patients/phooks.js";
import { SlidersHorizontal, ChevronDown } from "lucide-react";
import { getLocalizedCountries, localizeCountryName } from "../../utilsfront/geoLabels.js";
import { useTranslation } from "react-i18next";



const norm = (s = "") =>
  String(s).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const AGE_LABELS = [
  { label: "All",    value: "All",   i18nKey: "patients.list.filters.options.all" },
  { label: "Child",  value: "0-12",  i18nKey: "patients.list.ageCategories.child" },
  { label: "Teenager", value: "13-17", i18nKey: "patients.list.ageCategories.teenager" },
  { label: "Adult",  value: "18-59", i18nKey: "patients.list.ageCategories.adult" },
  { label: "Senior", value: "60+",  i18nKey: "patients.list.ageCategories.senior" },
];

const BLOOD_TYPES = ["All", "O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
const getAgeValue = (label) => AGE_LABELS.find((x) => x.label === label)?.value ?? "All";

const STATUS_VALUES   = ["All", "Alive", "Deceased"];
const BMI_VALUES      = ["All", "Underweight", "Healthy", "Overweight"];
const GENDER_VALUES   = ["All", "Male", "Female"];
const YES_NO_ALL      = ["All", "Yes", "No"];


export default function PatientsPage() {
  const { t, i18n } = useTranslation();
  const optionLabel = (value) => {
  const key = value.toLowerCase();

  // Usa el bloque "patients.list.filters.options" de common.json
  if (["all","yes","no","alive","deceased","underweight","healthy","overweight","male","female"].includes(key)) {
    return t(`patients.list.filters.options.${key}`);
  }

  // Para cosas como O+, AB-, etc. que no se traducen
  return value;
};

// países localizados para el idioma actual (pero el "value" sigue siendo el name en inglés,
// así tu filtro al backend no se rompe)
const localizedCountries = useMemo(
  () => getLocalizedCountries(i18n.language),
  [i18n.language]
);

const countryOptions = useMemo(
  () => ["All", ...localizedCountries.map((c) => c.name)],
  [localizedCountries]
);

const countryLabel = (name) => {
  if (!name) return "";
  if (name === "All") return optionLabel("All");
  return localizeCountryName(name, i18n.language);
};



  // local UI state
  const [search, setSearch] = useState("");
  const [ageCat, setAgeCat] = useState("All");
  const [blood, setBlood] = useState("All");
  const [page, setPage] = useState(1);
  const [gender, setGender] = useState("All");        // All | Male | Female
  const [organ, setOrgan]   = useState("All");        // All | Yes | No
  const [bloodD, setBloodD] = useState("All");        // All | Yes | No
  const [bmiCat, setBmiCat] = useState("All");        // All | Underweight | Healthy | Overweight
  const [showNoMatch, setShowNoMatch] = useState(false);
  const [status, setStatus] = useState("All");        // All | Alive | Deceased
  const [country, setCountry] = useState("All");
  const [hasDis, setHasDis]   = useState("All");   // All | Yes | No 
  const [hasAlg, setHasAlg]   = useState("All");   // All | Yes | No
  const [showMore, setShowMore] = useState(false); // UI: colapsar/expandir filtros
  const [hasMeds, setHasMeds] = useState("All");   // All | Yes | No
  const [pagesSnapshot, setPagesSnapshot] = useState(1);
 const activeFiltersCount = [ageCat, blood, gender, organ, bloodD, bmiCat, status, country, hasDis, hasAlg, hasMeds]
   .filter(v => v !== "All").length;

  const params = buildPatientParams({
    q: search,
    category: getAgeValue(ageCat),
    bloodtype: blood,
    gender,
    organDonor: organ,
    bloodDonor: bloodD,
    bmiCategory: bmiCat,
    status,
    hasDiseases: hasDis,
    hasAllergies: hasAlg,
    hasMedications: hasMeds,
    country,
    page,
  });

  const { data, isFetching, isLoading } = usePatients(params);
  const del = useDeletePatient();
  const handleDelete = useCallback((id) => del.mutate(id), [del]);
  const deletingId = del.variables;

  const items = data?.items ?? [];
  const pages = data?.pages ?? 1;
  const current = data?.page ?? page;

  // 👇 páginas que usaremos SOLO para el texto (subtitle)
  const subtitlePages = pages > 0 ? pages : pagesSnapshot;
  useEffect(() => {
    // Solo actualizamos snapshot cuando SÍ hay pacientes y pages > 0
    if (items.length > 0 && pages > 0) {
      setPagesSnapshot(pages);
    }
  }, [items.length, pages]);


  // === Filtro local (igual que Diagnoses) ===
  const display = useMemo(() => {
    let base = items;
    if (status !== "All") {
      const wantDeceased = status === "Deceased";
      base = base.filter((p) => !!p.isDeceased === wantDeceased);
    }

    if (country !== "All") {
    base = base.filter((p) => p.country === country);
  }

  if (hasDis !== "All") {
      const wantHas = hasDis === "Yes";
      base = base.filter((p) => (Array.isArray(p.diseases) && p.diseases.length > 0) === wantHas);
    }

    if (hasAlg !== "All") {
    const wantHasA = hasAlg === "Yes";
    base = base.filter((p) => (Array.isArray(p.allergies) && p.allergies.length > 0) === wantHasA);
  }
  if (hasMeds !== "All") {
    const wantHasM = hasMeds === "Yes";
    base = base.filter((p) => (Array.isArray(p.medications) && p.medications.length > 0) === wantHasM);
  }

    const raw = search.trim();
    const qn = norm(raw);
    const qDigits = raw.replace(/\D/g, "");
    if (!qn) return base;

    const isNameQuery =
      /^[a-zñáéíóúü\s]+$/i.test(raw) && !raw.includes("@") && !/\d/.test(raw);

    return base.filter((p) => {
      // prefijo por palabra en FULLNAME
        const fullNameNorm = norm(p.fullname || "");

      const nameTokens = fullNameNorm
        .split(/[\s,._-]+/)
        .filter(Boolean);
       // prefijo por palabra (J, Ju, Juan, Escu...)
      const tokenMatch = nameTokens.some((t) => t.startsWith(qn));
      // frase completa dentro del nombre (juan escutia)
      const phraseMatch = fullNameNorm.includes(qn);
      const nameMatch = tokenMatch || phraseMatch;
      if (isNameQuery) return nameMatch;

      if (qDigits) {
        const pd = String(p.phone || "").replace(/\D/g, "");
        if (pd.includes(qDigits)) return true;
      }

      // si contiene @ o números, también busca en email/phone
      const ep = norm([p.email, p.phone].filter(Boolean).join(" "));
      const epMatch = ep.includes(qn);
      return nameMatch || epMatch;
    });
  }, [items, search, status, country, hasDis, hasAlg, hasMeds]);

  // "no results" solo cuando la búsqueda de texto no encuentra en los items cargados
  const hasAnyFilter = !!search.trim() 
  || ageCat !== "All" || blood !== "All" || gender !== "All" || organ !== "All" 
  || bloodD !== "All" || bmiCat !== "All" || status !== "All" || country !== "All" 
  || hasDis !== "All" || hasAlg !== "All" || hasMeds !== "All";
  useEffect(() => {
    if (!isFetching) setShowNoMatch(items.length > 0 && display.length === 0);
  }, [isFetching, items.length, display.length]);

  const subtitle = useMemo(() => {
    const parts = [];
    if (search) parts.push(`“${search}”`);
    if (ageCat !== "All") {
      const found = AGE_LABELS.find((x) => x.label === ageCat);
      if (found) parts.push(t(found.i18nKey));
    }
    if (blood !== "All") parts.push(`${t("patients.list.filters.bloodType")} ${blood}`);
    if (gender !== "All") parts.push(`${t("patients.list.filters.gender")}: ${optionLabel(gender)}`);
    if (organ !== "All") parts.push(`${t("patients.list.filters.organDonor")}: ${optionLabel(organ)}`);
    if (bloodD !== "All") parts.push(`${t("patients.list.filters.bloodDonor")}: ${optionLabel(bloodD)}`);
    if (bmiCat !== "All") parts.push(`${t("patients.list.filters.weight")}: ${optionLabel(bmiCat)}`);
    if (status !== "All") parts.push(`${t("patients.list.filters.status")}: ${optionLabel(status)}`);
    if (hasDis !== "All") parts.push(`${t("patients.list.filters.diseases")}: ${optionLabel(hasDis)}`);
    if (country !== "All") parts.push(`${t("patients.list.filters.country")}: ${countryLabel(country)}`);
     if (hasAlg !== "All") parts.push(`${t("patients.list.filters.allergies")}: ${optionLabel(hasAlg)}`);
      if (hasMeds !== "All") parts.push(`${t("patients.list.filters.medications")}: ${optionLabel(hasMeds)}`);
   if (parts.length > 0) {
      const summary = parts.join(" · ");
      return t("patients.list.subtitleFilters", {
        summary,
        count: display.length,
        page: current,
        pages: subtitlePages,
      });
    }

    return t("patients.list.subtitleDefault", {
      count: items.length,
      page: current,
      pages: subtitlePages,
    });
  }, [search, ageCat, blood, display.length, items.length, gender, organ, bloodD, pages, current, bmiCat, status, country, hasDis, hasAlg, hasMeds, subtitlePages,  i18n.language]);

  const clearFilters = () => {
    setSearch("");
    setAgeCat("All");
    setBlood("All");
    setGender("All");
    setOrgan("All");
    setBloodD("All");
    setBmiCat("All");
    setStatus("All");
    setCountry("All");
    setHasDis("All");
    setHasAlg("All");
    setHasMeds("All");
    setPage(1);
    setShowNoMatch(false);
  };

  if (isLoading && !data) {
    return null; // o un skeleton si prefieres
  }

  // Empty (sin filtros de texto) y no cargando: depende de lo que trae el server
  if (!isLoading && !hasAnyFilter && items.length === 0) {
    return (
      <main className="mx-auto max-w-6xl p-4">
        <h1 className="text-2xl font-semibold text-gray-900">{t("patients.title")}</h1>
        <p className="text-sm text-gray-600">{t("patients.empty.title")}</p>
        <EmptyPatients />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t("patients.title")}</h1>
          <p className="text-sm text-gray-600">{subtitle}</p>
        </div>
        <Link to="/patients/new" className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
         {t("patients.empty.cta")}
        </Link>
      </div>

 
      {/* Filters */}
<section className="mb-6">
  <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
    {/* Toolbar: búsqueda + acciones */}
    <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:gap-4">
      <form onSubmit={(e) => e.preventDefault()} className="flex-1">
        <Input
          className="w-full h-11"
          type="text"
          placeholder={t("patients.list.searchPlaceholder")}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        />
      </form>

      <div className="flex items-center gap-2 md:self-start md:-mt-1">
        <button
          type="button"
          onClick={() => setShowMore((s) => !s)}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
          title={t("patients.list.filters.more")}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {t("patients.list.filters.more")}
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
          {t("patients.list.filters.clear")}
        </button>
      </div>
    </div>


    {/* Panel avanzado colapsable */}
    <div className={`${showMore ? "grid" : "hidden"} grid-cols-1 gap-4 border-t border-gray-100 p-4 sm:grid-cols-2 lg:grid-cols-3`}>

      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700">{t("patients.list.filters.ageCategory")}</span>
        <div className="flex flex-wrap gap-2">
          {AGE_LABELS.map(({ label, i18nKey }) => (
            <button
              key={label}
              type="button"
              onClick={() => { setAgeCat(label); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                ageCat === label
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
              }`}
            >
               {t(i18nKey)}
            </button>
          ))}
        </div>
      </div>


      {/* Status */}
      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700">{t("patients.list.filters.status")}</span>
        <div className="flex flex-wrap gap-2">
          {STATUS_VALUES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setStatus(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                status === s
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
              }`}
            >
              {optionLabel(s)}
            </button>
          ))}
        </div>
      </div>

      {/* Blood type */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{t("patients.list.filters.bloodType")}</label>
        <select
          className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 outline-none focus:ring-2 focus:ring-blue-500"
          value={blood}
          onChange={(e) => { setBlood(e.target.value); setPage(1); }}
        >
          {BLOOD_TYPES.map((b) => <option key={b} value={b}> {b === "All" ? optionLabel(b) : b}</option>)}
        </select>
      </div>

     {/* Country */}
 <div>
   <label className="mb-1 block text-sm font-medium text-gray-700">{t("patients.list.filters.country")}</label>
   <select
     className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 outline-none focus:ring-2 focus:ring-blue-500"
     value={country}
     onChange={(e) => { setCountry(e.target.value); setPage(1); }}
   >
     {countryOptions.map(c => (
       <option key={c} value={c}>{countryLabel(c)}</option>
     ))}
   </select>
 </div>

      {/* Weight (BMI) */}
      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700">{t("patients.list.filters.weight")}</span>
        <div className="flex flex-wrap gap-2">
          {BMI_VALUES.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => { setBmiCat(w); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                bmiCat === w
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
              }`}
            >
              {optionLabel(w)}
            </button>
          ))}
        </div>
      </div>

      {/* Gender */}
      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700">{t("patients.list.filters.gender")}</span>
        <div className="flex flex-wrap gap-2">
          {GENDER_VALUES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => { setGender(g); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                gender === g
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
              }`}
            >
              {optionLabel(g)}
            </button>
          ))}
        </div>
      </div>

      {/* Organ donor */}
      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700">{t("patients.list.filters.organDonor")}</span>
        <div className="flex flex-wrap gap-2">
          {YES_NO_ALL.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => { setOrgan(v); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                organ === v
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
              }`}
            >
              {optionLabel(v)}
            </button>
          ))}
        </div>
      </div>

      {/* Blood donor */}
      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700">{t("patients.list.filters.bloodDonor")}</span>
        <div className="flex flex-wrap gap-2">
          {YES_NO_ALL.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => { setBloodD(v); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                bloodD === v
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
              }`}
            >
              {optionLabel(v)}
            </button>
          ))}
        </div>
      </div>

      {/* Diseases */}
      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700">{t("patients.list.filters.diseases")}</span>
        <div className="flex flex-wrap gap-2">
          {YES_NO_ALL.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => { setHasDis(v); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                hasDis === v
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
              }`}
            >
              {optionLabel(v)}
            </button>
          ))}
        </div>
      </div>

      {/* Allergies */}
      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700">{t("patients.list.filters.allergies")}</span>
        <div className="flex flex-wrap gap-2">
          {YES_NO_ALL.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => { setHasAlg(v); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                hasAlg === v
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
              }`}
            >
              {optionLabel(v)}
            </button>
          ))}
        </div>
      </div>

       <div>
        <span className="mb-1 block text-sm font-medium text-gray-700">{t("patients.list.filters.medications")}</span>
        <div className="flex flex-wrap gap-2">
          {YES_NO_ALL.map((v) => (
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
              {optionLabel(v)}
            </button>
          ))}
        </div>

    </div>
    </div>
  </div>
</section>

      {(!isLoading && items.length === 0) ? (
  // Caso: el servidor regresó 0 pacientes (con o sin filtros)
  hasAnyFilter ? (
    // 0 items + SÍ hay filtros ⇒ muestra Clear filters manteniendo buscadores arriba
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="rounded-full bg-gray-100 p-6 mb-4">
        <span className="text-3xl">🔎</span>
      </div>
      <h3 className="text-2xl font-bold">{t("patients.list.noMatch.title")}</h3>
      <p className="mt-2 max-w-md text-gray-600">
        {t("patients.list.noMatch.description")}
      </p>
      <button
        type="button"
        onClick={clearFilters}
        className="mt-6 inline-block rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-black cursor-pointer"
      >
        {t("patients.list.noMatch.clear")}
      </button>
    </div>
  ) : (
    // 0 items + SIN filtros ⇒ muestra tu EmptyPatients, pero sin ocultar los buscadores
    <EmptyPatients />
  )
) : (
  // Hay items del servidor ⇒ decide por búsqueda local
  showNoMatch ? (
    // texto sin coincidencias (manteniendo filtros visibles)
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="rounded-full bg-gray-100 p-6 mb-4">
        <span className="text-3xl">🔎</span>
      </div>
      <h3 className="text-2xl font-bold">{t("patients.list.noMatch.title")}</h3>
      <p className="mt-2 max-w-md text-gray-600">
        {t("patients.list.noMatch.description")}
      </p>
      <button
        type="button"
        onClick={clearFilters}
        className="mt-6 inline-block rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-black cursor-pointer"
      >
        {t("patients.list.noMatch.clear")}
      </button>
    </div>
  ) : (
    // grid normal
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {display.map((p) => (
        <PatientCard
          key={p._id}
          patient={p}
          onDeleted={handleDelete}
          isDeleting={del.isPending && deletingId === p._id}
        />
      ))}
    </div>
  )
)}


      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((n) => n - 1)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-50"
          >
            {t("patients.list.pagination.prev")}
          </button>
          <span className="text-sm text-gray-600">{t("patients.list.pagination.label", {
        page: data?.page ?? page,
        pages,
      })}</span>
          <button
            type="button"
            disabled={page >= pages || isFetching}
            onClick={() => setPage((n) => n + 1)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-50"
          >
            {t("patients.list.pagination.next")}
          </button>
        </div>
      )}
    </main>
  );
}
