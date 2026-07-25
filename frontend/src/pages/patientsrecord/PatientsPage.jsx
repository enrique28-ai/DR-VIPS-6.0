// src/pages/patientsrecord/PatientsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Input from "../../components/forms/Input.jsx";
import PatientCard from "../../components/patient/PatientCard.jsx";
import EmptyPatients from "../../components/patient/EmptyPatients.jsx";
import { usePatients, buildPatientParams } from "../../features/patients/phooks.js";
import { ChevronDown, Search, SearchX, SlidersHorizontal } from "lucide-react";
import { getLocalizedCountries, localizeCountryName } from "../../utilsfront/geoLabels.js";
import { useTranslation } from "react-i18next";

const norm = (s = "") =>
  String(s).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const AGE_LABELS = [
  { label: "All", value: "All", i18nKey: "patients.list.filters.options.all" },
  { label: "Child", value: "0-12", i18nKey: "patients.list.ageCategories.child" },
  { label: "Teenager", value: "13-17", i18nKey: "patients.list.ageCategories.teenager" },
  { label: "Adult", value: "18-59", i18nKey: "patients.list.ageCategories.adult" },
  { label: "Senior", value: "60+", i18nKey: "patients.list.ageCategories.senior" },
];

const BLOOD_TYPES = ["All", "O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
const STATUS_VALUES = ["All", "Alive", "Deceased"];
const BMI_VALUES = ["All", "Underweight", "Healthy", "Overweight"];
const GENDER_VALUES = ["All", "Male", "Female"];
const YES_NO_ALL = ["All", "Yes", "No"];
const ADVANCED_FILTERS_ID = "patients-advanced-filters";

const getAgeValue = (label) => AGE_LABELS.find((x) => x.label === label)?.value ?? "All";

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
              className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm"
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

function SelectControl({ id, label, value, onChange, children }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500"
      >
        {label}
      </label>
      <select
        id={id}
        className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
        value={value}
        onChange={onChange}
      >
        {children}
      </select>
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

export default function PatientsPage() {
  const { t, i18n } = useTranslation();
  const optionLabel = (value) => {
    const key = value.toLowerCase();

    if (
      [
        "all",
        "yes",
        "no",
        "alive",
        "deceased",
        "underweight",
        "healthy",
        "overweight",
        "male",
        "female",
      ].includes(key)
    ) {
      return t(`patients.list.filters.options.${key}`);
    }

    return value;
  };

  const localizedCountries = useMemo(
    () => getLocalizedCountries(i18n.language),
    [i18n.language],
  );

  const countryOptions = useMemo(
    () => ["All", ...localizedCountries.map((c) => c.name)],
    [localizedCountries],
  );

  const countryLabel = (name) => {
    if (!name) return "";
    if (name === "All") return optionLabel("All");
    return localizeCountryName(name, i18n.language);
  };

  const [search, setSearch] = useState("");
  const [ageCat, setAgeCat] = useState("All");
  const [blood, setBlood] = useState("All");
  const [page, setPage] = useState(1);
  const [gender, setGender] = useState("All");
  const [organ, setOrgan] = useState("All");
  const [bloodD, setBloodD] = useState("All");
  const [bmiCat, setBmiCat] = useState("All");
  const [showNoMatch, setShowNoMatch] = useState(false);
  const [status, setStatus] = useState("All");
  const [country, setCountry] = useState("All");
  const [hasDis, setHasDis] = useState("All");
  const [hasAlg, setHasAlg] = useState("All");
  const [showMore, setShowMore] = useState(false);
  const [hasMeds, setHasMeds] = useState("All");
  const [pagesSnapshot, setPagesSnapshot] = useState(1);
  const activeFiltersCount = [
    ageCat,
    blood,
    gender,
    organ,
    bloodD,
    bmiCat,
    status,
    country,
    hasDis,
    hasAlg,
    hasMeds,
  ].filter((v) => v !== "All").length;

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

  const items = data?.items ?? [];
  const pages = data?.pages ?? 1;
  const current = data?.page ?? page;
  const subtitlePages = pages > 0 ? pages : pagesSnapshot;

  useEffect(() => {
    if (items.length > 0 && pages > 0) {
      setPagesSnapshot(pages);
    }
  }, [items.length, pages]);

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
      const fullNameNorm = norm(p.fullname || "");

      const nameTokens = fullNameNorm
        .split(/[\s,._-]+/)
        .filter(Boolean);
      const tokenMatch = nameTokens.some((t) => t.startsWith(qn));
      const phraseMatch = fullNameNorm.includes(qn);
      const nameMatch = tokenMatch || phraseMatch;
      if (isNameQuery) return nameMatch;

      if (qDigits) {
        const pd = String(p.phone || "").replace(/\D/g, "");
        if (pd.includes(qDigits)) return true;
      }

      const ep = norm([p.email, p.phone].filter(Boolean).join(" "));
      const epMatch = ep.includes(qn);
      return nameMatch || epMatch;
    });
  }, [items, search, status, country, hasDis, hasAlg, hasMeds]);

  const hasAnyFilter = !!search.trim()
    || ageCat !== "All"
    || blood !== "All"
    || gender !== "All"
    || organ !== "All"
    || bloodD !== "All"
    || bmiCat !== "All"
    || status !== "All"
    || country !== "All"
    || hasDis !== "All"
    || hasAlg !== "All"
    || hasMeds !== "All";

  useEffect(() => {
    if (!isFetching) setShowNoMatch(items.length > 0 && display.length === 0);
  }, [isFetching, items.length, display.length]);

  const subtitle = useMemo(() => {
    const parts = [];
    if (search) parts.push(`"${search}"`);
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
      const summary = parts.join(" - ");
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
  }, [
    search,
    ageCat,
    blood,
    display.length,
    items.length,
    gender,
    organ,
    bloodD,
    current,
    bmiCat,
    status,
    country,
    hasDis,
    hasAlg,
    hasMeds,
    subtitlePages,
    i18n.language,
  ]);

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

  const renderFilterButtons = (values, selected, onSelect, formatter = optionLabel) => (
    <ChipScroller>
      {values.map((value) => (
        <FilterButton
          key={value}
          active={selected === value}
          onClick={() => {
            onSelect(value);
            setPage(1);
          }}
        >
          {formatter(value)}
        </FilterButton>
      ))}
    </ChipScroller>
  );

  if (isLoading && !data) {
    return (
      <LoadingState
        title={t("patients.title")}
        loadingLabel={t("common.loading")}
      />
    );
  }

  if (!isLoading && !hasAnyFilter && items.length === 0) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <EmptyPatients />
          </div>
        </div>
      </main>
    );
  }

  const renderContent = () => {
    if (!isLoading && hasAnyFilter && items.length === 0) {
      return (
        <NoMatchState
          title={t("patients.list.noMatch.title")}
          description={t("patients.list.noMatch.description")}
          clearLabel={t("patients.list.noMatch.clear")}
          onClear={clearFilters}
        />
      );
    }

    if (showNoMatch) {
      return (
        <NoMatchState
          title={t("patients.list.noMatch.title")}
          description={t("patients.list.noMatch.description")}
          clearLabel={t("patients.list.noMatch.clear")}
          onClear={clearFilters}
        />
      );
    }

    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {display.map((p) => (
          <PatientCard key={p._id} patient={p} />
        ))}
      </div>
    );
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              {t("patients.title")}
            </h1>
            <p className="mt-1 text-sm font-medium leading-6 text-slate-600">{subtitle}</p>
          </div>
          <Link
            to="/patients/search"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:shrink-0"
          >
            {t("patients.empty.cta")}
          </Link>
        </div>

        <section className="mb-6" aria-busy={isFetching}>
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:gap-4">
              <form onSubmit={(e) => e.preventDefault()} className="flex-1">
                <Input
                  icon={Search}
                  containerClassName="mb-0"
                  className="h-11 w-full"
                  type="text"
                  placeholder={t("patients.list.searchPlaceholder")}
                  aria-label={t("patients.list.searchPlaceholder")}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
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
                  title={t("patients.list.filters.more")}
                  aria-expanded={showMore}
                  aria-controls={ADVANCED_FILTERS_ID}
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  {t("patients.list.filters.more")}
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
                  {t("patients.list.filters.clear")}
                </button>
              </div>
            </div>

            <div
              id={ADVANCED_FILTERS_ID}
              className={`${showMore ? "grid" : "hidden"} grid-cols-1 gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-3`}
            >
              <FilterGroup label={t("patients.list.filters.ageCategory")}>
                {renderFilterButtons(
                  AGE_LABELS.map(({ label }) => label),
                  ageCat,
                  setAgeCat,
                  (value) => t(AGE_LABELS.find((x) => x.label === value)?.i18nKey),
                )}
              </FilterGroup>

              <FilterGroup label={t("patients.list.filters.status")}>
                {renderFilterButtons(STATUS_VALUES, status, setStatus)}
              </FilterGroup>

              <SelectControl
                id="patients-blood-filter"
                label={t("patients.list.filters.bloodType")}
                value={blood}
                onChange={(e) => {
                  setBlood(e.target.value);
                  setPage(1);
                }}
              >
                {BLOOD_TYPES.map((b) => (
                  <option key={b} value={b}>
                    {b === "All" ? optionLabel(b) : b}
                  </option>
                ))}
              </SelectControl>

              <SelectControl
                id="patients-country-filter"
                label={t("patients.list.filters.country")}
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  setPage(1);
                }}
              >
                {countryOptions.map((c) => (
                  <option key={c} value={c}>
                    {countryLabel(c)}
                  </option>
                ))}
              </SelectControl>

              <FilterGroup label={t("patients.list.filters.weight")}>
                {renderFilterButtons(BMI_VALUES, bmiCat, setBmiCat)}
              </FilterGroup>

              <FilterGroup label={t("patients.list.filters.gender")}>
                {renderFilterButtons(GENDER_VALUES, gender, setGender)}
              </FilterGroup>

              <FilterGroup label={t("patients.list.filters.organDonor")}>
                {renderFilterButtons(YES_NO_ALL, organ, setOrgan)}
              </FilterGroup>

              <FilterGroup label={t("patients.list.filters.bloodDonor")}>
                {renderFilterButtons(YES_NO_ALL, bloodD, setBloodD)}
              </FilterGroup>

              <FilterGroup label={t("patients.list.filters.diseases")}>
                {renderFilterButtons(YES_NO_ALL, hasDis, setHasDis)}
              </FilterGroup>

              <FilterGroup label={t("patients.list.filters.allergies")}>
                {renderFilterButtons(YES_NO_ALL, hasAlg, setHasAlg)}
              </FilterGroup>

              <FilterGroup label={t("patients.list.filters.medications")}>
                {renderFilterButtons(YES_NO_ALL, hasMeds, setHasMeds)}
              </FilterGroup>
            </div>
          </div>
        </section>

        {renderContent()}

        {pages > 1 && (
          <div className="mt-6 flex flex-col items-stretch justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((n) => n - 1)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {t("patients.list.pagination.prev")}
            </button>
            <span className="text-center text-sm font-medium text-slate-600">
              {t("patients.list.pagination.label", {
                page: data?.page ?? page,
                pages,
              })}
            </span>
            <button
              type="button"
              disabled={page >= pages || isFetching}
              onClick={() => setPage((n) => n + 1)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {t("patients.list.pagination.next")}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
