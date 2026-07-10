import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  Clock3,
  FileText,
  Languages,
  Loader2,
  Search,
  SearchX,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import Input from "../../components/forms/Input.jsx";
import LocalizedDatePicker from "../../components/forms/LocalizedDatePicker.jsx";
import {
  buildDiagnosisParams,
  useMyChildDiagnoses,
  useTranslateMyChildDiagnosis,
} from "../../features/diagnostics/dhooks.js";
import { useMyChildrenHealthInfo } from "../../features/patients/phooks.js";

const FALLBACK_TEXT = "-";
const pad = (value) => String(value).padStart(2, "0");
const todayLocal = () => {
  const date = new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const norm = (value = "") =>
  String(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const ANSWER_OPTIONS = ["All", "Yes", "No"];
const ADVANCED_FILTERS_ID = "my-child-health-state-advanced-filters";

function LoadingState({ title, loadingLabel }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50" aria-busy="true">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
            <p role="status" className="mt-1 text-sm font-medium text-slate-500">
              {loadingLabel}
            </p>
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

function Header({ childName, healthStateLabel, subtitleText, linkLabel }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-6 text-slate-600">{healthStateLabel}</p>
        <h1 className="break-words text-3xl font-semibold tracking-tight text-slate-950">
          {childName}
        </h1>
        <p className="mt-1 text-sm font-medium leading-6 text-slate-600">{subtitleText}</p>
      </div>

      <Link
        to="/docrecords/mychildren"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:shrink-0"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {linkLabel}
      </Link>
    </div>
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

function ChipScroller({ children }) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
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

function EmptyState({ message }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <FileText className="h-7 w-7" aria-hidden="true" />
      </div>
      <p className="mx-auto max-w-md text-sm font-medium leading-6 text-slate-600">{message}</p>
    </div>
  );
}

function ChildHealthStateCard({ diagnosis, childId, language, t }) {
  const id = diagnosis?._id;
  const [translatedTitle, setTranslatedTitle] = useState(null);
  const { mutate: translateOne, isPending: translatingOne } = useTranslateMyChildDiagnosis();

  useEffect(() => {
    setTranslatedTitle(null);
  }, [language]);

  const handleTranslateThisCard = () => {
    translateOne(
      { childId, diagnosisId: diagnosis._id, lang: language },
      { onSuccess: (data) => setTranslatedTitle(data?.title ?? null) },
    );
  };

  const title =
    translatedTitle ||
    (diagnosis?.title && String(diagnosis.title).trim()) ||
    (diagnosis?.name && String(diagnosis.name).trim()) ||
    (diagnosis?.Diagnostic && String(diagnosis.Diagnostic).trim()) ||
    (diagnosis?.diagnosis && String(diagnosis.diagnosis).trim()) ||
    t("diagnoses.detail.untitled");
  const stamp = diagnosis?.updatedAt || diagnosis?.createdAt;
  const date = stamp ? new Date(stamp) : null;
  const stampText =
    date && !Number.isNaN(date.getTime())
      ? date.toLocaleString(language || undefined)
      : FALLBACK_TEXT;

  const doctorName = diagnosis?.createdBy?.name || "";
  const doctorEmail = diagnosis?.createdBy?.email || "";
  let creatorLabel = t("myHealthState.detail.unknownDoctor");
  if (doctorName && doctorEmail) creatorLabel = `${doctorName} (${doctorEmail})`;
  else if (doctorName) creatorLabel = doctorName;
  else if (doctorEmail) creatorLabel = doctorEmail;

  return (
    <article
      className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-md sm:p-5"
      aria-label={title}
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-blue-500/70" aria-hidden="true" />

      <button
        type="button"
        onClick={handleTranslateThisCard}
        disabled={!!translatingOne}
        className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-blue-50 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        title={t("common.translate")}
        aria-label={t("common.translate")}
      >
        {translatingOne ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Languages className="h-4 w-4" aria-hidden="true" />
        )}
      </button>

      <div className="min-w-0 pl-1">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <FileText className="h-5 w-5" aria-hidden="true" />
        </div>

        <h3 className="text-lg font-semibold leading-tight text-slate-950">
          <Link
            to={`/docrecords/mychildren/${childId}/health-state/${id}`}
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
          <span className="mt-1 block break-words font-medium text-slate-900">{creatorLabel}</span>
        </div>
        <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            {t("diagnoses.card.updated")}
          </span>
          <span className="mt-1 block break-words font-medium text-slate-900">{stampText}</span>
        </div>
      </div>
    </article>
  );
}

export default function MyChildHealthState() {
  const { childId } = useParams();
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState("");
  const [onDate, setOnDate] = useState("");
  const [page, setPage] = useState(1);
  const [showNoMatch, setShowNoMatch] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [hasMeds, setHasMeds] = useState("All");
  const [hasTx, setHasTx] = useState("All");
  const [hasOps, setHasOps] = useState("All");
  const [pagesSnapshot, setPagesSnapshot] = useState(1);

  const { data: childrenData } = useMyChildrenHealthInfo(i18n.language);
  const childName = useMemo(() => {
    const children = Array.isArray(childrenData) ? childrenData : [];
    const match = children.find((entry) =>
      (entry?.snapshot?.sources || []).some((source) => source?.id === childId),
    );
    return match?.snapshot?.fullname?.value || t("myChildren.unknownChild");
  }, [childrenData, childId, t]);

  const raw = q.trim();
  const isNameQuery =
    /^[a-zñáéíóúü\s]+$/i.test(raw) && !raw.includes("@") && !/\d/.test(raw);
  const isEmailQuery = !!raw && raw.includes("@");
  const params = buildDiagnosisParams({
    q: raw,
    date: onDate,
    hasMedicines: hasMeds,
    hasTreatments: hasTx,
    hasOperations: hasOps,
    page,
  });

  const { data, isLoading, isFetching = false } = useMyChildDiagnoses(childId, params);
  const items = data?.items ?? [];
  const pages = data?.pages ?? 1;
  const current = data?.page ?? page;
  const subtitlePages = pages > 0 ? pages : pagesSnapshot;

  useEffect(() => {
    if (items.length > 0 && pages > 0) setPagesSnapshot(pages);
  }, [items.length, pages]);

  const hasAnyFilter =
    !!raw || !!onDate || hasMeds !== "All" || hasTx !== "All" || hasOps !== "All";
  const isEmptyWithoutFilters = !isLoading && !hasAnyFilter && items.length === 0;

  const display = useMemo(() => {
    let base = items;

    if (hasMeds !== "All") {
      const wantHas = hasMeds === "Yes";
      base = base.filter((diagnosis) =>
        (Array.isArray(diagnosis.medicine) && diagnosis.medicine.length > 0) === wantHas,
      );
    }
    if (hasTx !== "All") {
      const wantHas = hasTx === "Yes";
      base = base.filter((diagnosis) =>
        (Array.isArray(diagnosis.treatment) && diagnosis.treatment.length > 0) === wantHas,
      );
    }
    if (hasOps !== "All") {
      const wantHas = hasOps === "Yes";
      base = base.filter((diagnosis) =>
        (Array.isArray(diagnosis.operation) && diagnosis.operation.length > 0) === wantHas,
      );
    }

    const query = norm(raw);
    if (!query) return base;

    return base.filter((diagnosis) => {
      const titleNorm = norm(
        diagnosis.title ?? diagnosis.name ?? diagnosis.diagnosis ?? diagnosis.Diagnostic ?? "",
      );
      const titleTokens = titleNorm.split(/[\s,._-]+/).filter(Boolean);
      const titleMatch =
        titleTokens.some((token) => token.startsWith(query)) || titleNorm.includes(query);
      const description = norm(diagnosis.description ?? diagnosis.symptoms ?? "");
      const doctorEmail = norm(diagnosis?.createdBy?.email || "");
      const doctorName = norm(diagnosis?.createdBy?.name || "");
      const doctorNameTokens = doctorName.split(/[\s,._-]+/).filter(Boolean);
      const doctorNameMatch =
        doctorNameTokens.some((token) => token.startsWith(query)) || doctorName.includes(query);

      if (isEmailQuery) return doctorEmail.includes(query);
      if (isNameQuery) return titleMatch || doctorNameMatch;
      return titleMatch || description.includes(query) || doctorEmail.includes(query) || doctorNameMatch;
    });
  }, [items, raw, isNameQuery, isEmailQuery, hasMeds, hasTx, hasOps]);

  useEffect(() => {
    if (isFetching) return;
    if (raw) setShowNoMatch(items.length > 0 && display.length === 0);
    else if (onDate) setShowNoMatch(items.length === 0);
    else setShowNoMatch(false);
  }, [isFetching, raw, onDate, items.length, display.length]);

  const diagOptionLabel = (value) => {
    const key = String(value || "").toLowerCase();
    if (["all", "yes", "no"].includes(key)) {
      return t(`diagnoses.list.filters.options.${key}`);
    }
    return value;
  };

  const subtitle = useMemo(() => {
    if (!hasAnyFilter) {
      return t("diagnoses.list.subtitleDefault", {
        count: items.length,
        page: current,
        pages: subtitlePages,
      });
    }
    const parts = [];
    if (raw) parts.push(`"${raw}"`);
    if (onDate) parts.push(onDate);
    if (hasMeds !== "All") {
      parts.push(`${t("diagnoses.list.filters.medicines")}: ${diagOptionLabel(hasMeds)}`);
    }
    if (hasTx !== "All") {
      parts.push(`${t("diagnoses.list.filters.treatments")}: ${diagOptionLabel(hasTx)}`);
    }
    if (hasOps !== "All") {
      parts.push(`${t("diagnoses.list.filters.operations")}: ${diagOptionLabel(hasOps)}`);
    }
    return t("diagnoses.list.subtitleFilters", {
      summary: parts.join(" - "),
      count: display.length,
      page: current,
      pages: subtitlePages,
    });
  }, [
    hasAnyFilter,
    raw,
    onDate,
    display.length,
    items.length,
    current,
    hasMeds,
    hasTx,
    hasOps,
    subtitlePages,
    i18n.language,
  ]);

  const clearFilters = () => {
    setQ("");
    setOnDate("");
    setHasMeds("All");
    setHasTx("All");
    setHasOps("All");
    setPage(1);
    setShowNoMatch(false);
  };

  useEffect(() => setPage(1), [raw, onDate, hasMeds, hasTx, hasOps]);

  const renderFilterButtons = (selected, onSelect) => (
    <ChipScroller>
      {ANSWER_OPTIONS.map((value) => (
        <FilterButton
          key={value}
          active={selected === value}
          onClick={() => {
            onSelect(value);
            setPage(1);
          }}
        >
          {diagOptionLabel(value)}
        </FilterButton>
      ))}
    </ChipScroller>
  );

  if (isLoading && !data) {
    return (
      <LoadingState
        title={t("myChildren.healthState")}
        loadingLabel={t("common.loading")}
      />
    );
  }

  const renderContent = () => {
    if (!isLoading && items.length === 0) {
      if (hasAnyFilter) {
        return (
          <NoMatchState
            title={t("diagnoses.list.noMatch.title")}
            description={t("diagnoses.list.noMatch.description")}
            clearLabel={t("diagnoses.list.noMatch.clear")}
            onClear={clearFilters}
          />
        );
      }
      return <EmptyState message={t("myChildren.noDiagnoses")} />;
    }

    if (showNoMatch) {
      return (
        <NoMatchState
          title={t("diagnoses.list.noMatch.title")}
          description={t("diagnoses.list.noMatch.description")}
          clearLabel={t("diagnoses.list.noMatch.clear")}
          onClear={clearFilters}
        />
      );
    }

    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {display.map((diagnosis) => (
          <ChildHealthStateCard
            key={diagnosis._id}
            diagnosis={diagnosis}
            childId={childId}
            language={i18n.language}
            t={t}
          />
        ))}
      </div>
    );
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <Header
          childName={childName}
          healthStateLabel={t("myChildren.healthState")}
          subtitleText={isEmptyWithoutFilters ? t("diagnoses.empty.title") : subtitle}
          linkLabel={t("myChildren.back")}
        />

        {!isEmptyWithoutFilters && (
          <section className="mb-6" aria-busy={isFetching}>
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:gap-4">
                <form onSubmit={(event) => event.preventDefault()} className="flex-1">
                  <Input
                    icon={Search}
                    containerClassName="mb-0"
                    className="h-11 w-full"
                    placeholder={t("myHealthState.list.searchPlaceholder")}
                    aria-label={t("myHealthState.list.searchPlaceholder")}
                    value={q}
                    onChange={(event) => {
                      setQ(event.target.value);
                      setPage(1);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.preventDefault();
                    }}
                  />
                </form>

                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                  <button
                    type="button"
                    onClick={() => setShowMore((value) => !value)}
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
                    {(onDate ? 1 : 0) +
                      (hasMeds !== "All" ? 1 : 0) +
                      (hasTx !== "All" ? 1 : 0) +
                      (hasOps !== "All" ? 1 : 0) >
                      0 && (
                      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white">
                        {(onDate ? 1 : 0) +
                          (hasMeds !== "All" ? 1 : 0) +
                          (hasTx !== "All" ? 1 : 0) +
                          (hasOps !== "All" ? 1 : 0)}
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

              <div
                id={ADVANCED_FILTERS_ID}
                className={`${showMore ? "grid" : "hidden"} grid-cols-1 gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4`}
              >
                <FilterGroup label={t("diagnoses.list.filters.date")}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <LocalizedDatePicker
                        value={onDate}
                        onChange={(value) => {
                          setOnDate(value);
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
                  {renderFilterButtons(hasMeds, setHasMeds)}
                </FilterGroup>
                <FilterGroup label={t("diagnoses.list.filters.treatments")}>
                  {renderFilterButtons(hasTx, setHasTx)}
                </FilterGroup>
                <FilterGroup label={t("diagnoses.list.filters.operations")}>
                  {renderFilterButtons(hasOps, setHasOps)}
                </FilterGroup>
              </div>
            </div>
          </section>
        )}

        {renderContent()}

        {pages > 1 && (
          <div className="mt-6 flex flex-col items-stretch justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={current <= 1 || isFetching}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {t("diagnoses.list.pagination.prev")}
            </button>
            <span className="text-center text-sm font-medium text-slate-600">
              {t("diagnoses.list.pagination.label", { page: current, pages })}
            </span>
            <button
              type="button"
              disabled={current >= pages || isFetching}
              onClick={() => setPage((value) => value + 1)}
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
