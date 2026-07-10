import { useMemo, useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Button from "../../components/forms/Button.jsx";
import {
  usePatient,
  useReassignGuardian,
  useTranslatePatient,
} from "../../features/patients/phooks.js";
import PatientHistoryModal from "../../components/patient/PatientHistoryModal.jsx";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Droplet,
  Globe,
  Heart,
  History,
  Info,
  Languages,
  Loader2,
  Mail,
  Pill,
  Phone,
  Stethoscope,
  User2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { localizeCountryName } from "../../utilsfront/geoLabels.js";
import { formatHeightForSystem } from "../../utilsfront/measurements.js";

const ageToLabel = (age, t) => {
  if (age == null || Number.isNaN(Number(age))) return null;
  const n = Number(age);
  if (n <= 12) return t("patients.list.ageCategories.child");
  if (n <= 17) return t("patients.list.ageCategories.teenager");
  if (n <= 59) return t("patients.list.ageCategories.adult");
  return t("patients.list.ageCategories.senior");
};

const backendCategoryToLabel = (cat, t) => {
  if (!cat) return null;
  switch (cat) {
    case "0-12":
      return t("patients.list.ageCategories.child");
    case "13-17":
      return t("patients.list.ageCategories.teenager");
    case "18-59":
      return t("patients.list.ageCategories.adult");
    case "60+":
      return t("patients.list.ageCategories.senior");
    default:
      return cat;
  }
};

const bmiBackendToKey = (cat) => {
  if (!cat) return null;
  const c = String(cat).toLowerCase();

  if (c.includes("under")) return "underweight";
  if (c.includes("normal")) return "normal";
  if (c.includes("over")) return "overweight";
  return null;
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const trapPanelFocus = (e, panel) => {
  if (e.key !== "Tab") return;

  const focusable = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR));

  if (!focusable.length) {
    e.preventDefault();
    panel.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (!focusable.includes(active)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
    return;
  }

  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
    return;
  }

  if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
};

function PageShell({ children }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </div>
    </main>
  );
}

function LoadingState({ t }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50" aria-busy="true">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="mb-3 h-4 w-36 animate-pulse rounded-full bg-slate-200" />
              <div className="h-8 w-64 max-w-full animate-pulse rounded-xl bg-slate-200" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <div className="h-11 animate-pulse rounded-xl bg-slate-200 sm:w-28" />
              <div className="h-11 animate-pulse rounded-xl bg-slate-200 sm:w-28" />
            </div>
          </div>
          <p
            role="status"
            className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-slate-600"
          >
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />
            {t("patients.detail.loading")}
          </p>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 h-5 w-40 animate-pulse rounded-full bg-slate-200" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function NotFoundState({ t, onBack }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <AlertTriangle className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            {t("patients.detail.notFoundTitle")}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            {t("patients.detail.notFoundText")}
          </p>
          <Button className="mt-6 sm:w-auto" onClick={onBack}>
            {t("patients.detail.backButton")}
          </Button>
        </section>
      </div>
    </main>
  );
}

function SectionCard({ title, icon: Icon, tone = "blue", children }) {
  const toneClasses = {
    blue: "bg-blue-50 text-blue-700",
    rose: "bg-rose-50 text-rose-700",
    emerald: "bg-emerald-50 text-emerald-700",
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${toneClasses[tone]}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function RecordField({ label, value, icon: Icon, children, className = "" }) {
  return (
    <div
      className={`min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 ${className}`}
    >
      <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
        {label}
      </span>
      {value != null && (
        <span className="mt-1 block break-words text-sm font-medium leading-6 text-slate-900">
          {value}
        </span>
      )}
      {children}
    </div>
  );
}

function ChipList({ items, emptyText }) {
  if (!Array.isArray(items) || items.length === 0) {
    return <p className="text-sm font-medium leading-6 text-slate-500">{emptyText}</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, index) => (
        <span
          key={`${item}-${index}`}
          className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-sm font-medium text-slate-700 shadow-sm"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function ConditionColumn({ icon: Icon, iconClassName, label, items, emptyText }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Icon className={`h-4 w-4 ${iconClassName}`} aria-hidden="true" />
        {label}
      </h3>
      <div className="mt-3">
        <ChipList items={items} emptyText={emptyText} />
      </div>
    </div>
  );
}

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : "--");

export default function PatientDetailPage() {
  const { t, i18n } = useTranslation();
  const [showHistory, setShowHistory] = useState(false);
  const [showGuardianForm, setShowGuardianForm] = useState(false);
  const [newParentEmail, setNewParentEmail] = useState("");
  const [translated, setTranslated] = useState({ lang: null, data: null, active: false });

  const { id } = useParams();
  const navigate = useNavigate();

  const { data: patient, isLoading, isError } = usePatient(id);
  const reassignGuardian = useReassignGuardian(id);
  const { mutate: translatePatient, isPending: translatingPatient } = useTranslatePatient();
  const guardianPanelRef = useRef(null);

  useEffect(() => {
    setTranslated({ lang: null, data: null, active: false });
    setShowGuardianForm(false);
    setNewParentEmail("");
  }, [id]);

  useEffect(() => {
    setTranslated((prev) => ({ ...prev, active: false }));
  }, [i18n.language]);

  useEffect(() => {
    if (!showGuardianForm) return;
    const previousActive = document.activeElement;
    guardianPanelRef.current?.focus();
    return () => {
      if (previousActive && typeof previousActive.focus === "function") {
        previousActive.focus();
      }
    };
  }, [showGuardianForm]);

  const isTranslatedActive = Boolean(translated.active && translated.data);
  const patientView = translated.active ? translated.data : patient;

  const categoryLabel = useMemo(() => {
    if (!patientView) return null;
    return ageToLabel(patientView.age, t) ?? backendCategoryToLabel(patientView.ageCategory, t) ?? null;
  }, [patientView, t]);

  const locationText = useMemo(() => {
    if (!patientView) return "";

    const country = localizeCountryName(patientView.country, i18n.language);
    const st = patientView.state || "";
    const ct = patientView.city || "";

    return [country, st, ct].filter(Boolean).join(", ");
  }, [patientView, i18n.language]);

  const birthplaceText = useMemo(() => {
    if (!patientView) return "";

    const country = localizeCountryName(patientView.birthCountry, i18n.language);
    const st = patientView.birthState || "";
    const ct = patientView.birthCity || "";

    return [country, st, ct].filter(Boolean).join(", ");
  }, [patientView, i18n.language]);

  if (isLoading) {
    return <LoadingState t={t} />;
  }

  if (isError || !patientView) {
    return <NotFoundState t={t} onBack={() => navigate("/patients")} />;
  }

  const { fullname, email, phone, age, diseases, allergies, bloodtype, createdAt, updatedAt } =
    patientView;

  const kidsCount = Number(
    patientView?.childrenCount ??
      (Array.isArray(patientView?.children) ? patientView.children.length : 0),
  );

  const sys = (patientView?.measurementSystem || "metric").toLowerCase();
  const isImp = sys === "imperial";
  const heightTextUI = formatHeightForSystem({
    measurementSystem: sys,
    heightM: patientView?.heightM,
    heightFeet: patientView?.heightFeet,
    heightInches: patientView?.heightInches,
    heightDisplay: patientView?.heightDisplay,
    notSpecified: "",
  });

  const weightDisplayUI =
    patientView?.weightDisplay ??
    (patientView?.weightKg != null
      ? isImp
        ? patientView.weightKg * 2.2046226218
        : patientView.weightKg
      : null);
  const weightUnitUI = isImp ? "lb" : "kg";

  const bmiKey = bmiBackendToKey(patientView?.bmiCategory);
  const bmiLabel = bmiKey
    ? t(`patients.detail.bmiCategories.${bmiKey}`)
    : patientView?.bmiCategory;

  const patientAge = Number(patient?.age);
  const isMinorOrGuardianLinked =
    (Number.isFinite(patientAge) && patientAge < 18) ||
    Boolean(patient?.parentEmail || patient?.minorKey);
  const canReassignGuardian =
    !patient?.isDeceased &&
    isMinorOrGuardianLinked &&
    Boolean(patient?.parentEmail || patient?.minorKey);

  const closeGuardianForm = () => {
    if (reassignGuardian.isPending) return;
    setShowGuardianForm(false);
    setNewParentEmail("");
  };

  const handleGuardianSubmit = (e) => {
    e.preventDefault();
    const email = newParentEmail.trim().toLowerCase();
    if (!email) return;

    reassignGuardian.mutate(
      { newParentEmail: email },
      {
        onSuccess: () => {
          setShowGuardianForm(false);
          setNewParentEmail("");
          setTranslated({ lang: null, data: null, active: false });
        },
      },
    );
  };

  const clearTranslatedData = () => {
    setTranslated({ lang: null, data: null, active: false });
  };

  return (
    <PageShell>
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium leading-6 text-slate-600">
              <User2 className="h-4 w-4 text-blue-600" aria-hidden="true" />
              {t("patients.detail.category")}
              {categoryLabel ? `: ${categoryLabel}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="break-words text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                {fullname}
              </h1>
              {patientView?.isPendingApproval && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800 shadow-sm">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  {t("patients.detail.pendingApproval")}
                </span>
              )}
            </div>
          </div>

          <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:grid-cols-none lg:flex lg:items-center">
            <Link
              to="/patients"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t("patients.detail.back")}
            </Link>
            <Link
              to={`/patients/${id}/edit`}
              state={{ from: "detail" }}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {t("patients.detail.edit")}
            </Link>
            <Button
              full={false}
              variant="secondary"
              onClick={() => navigate(`/diagnosis/patient/${id}`)}
              className="sm:w-auto"
            >
              {t("patients.detail.viewDiagnoses")}
            </Button>
            {canReassignGuardian && (
              <Button
                full={false}
                variant="secondary"
                onClick={() => setShowGuardianForm(true)}
                disabled={reassignGuardian.isPending}
                className="sm:col-span-2 lg:w-auto"
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                {t("patients.detail.reassignGuardian")}
              </Button>
            )}
            <Button
              full={false}
              variant="secondary"
              onClick={() => setShowHistory(true)}
              className="sm:w-auto"
            >
              <History className="h-4 w-4" aria-hidden="true" />
              {t("patients.detail.history")}
            </Button>
            <Button
              full={false}
              variant="secondary"
              disabled={translatingPatient}
              onClick={() => {
                translatePatient(
                  { id, lang: i18n.language },
                  { onSuccess: (data) => setTranslated({ lang: i18n.language, data, active: true }) },
                );
              }}
              className="sm:w-auto"
            >
              {translatingPatient ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Languages className="h-4 w-4" aria-hidden="true" />
              )}
              {t("common.translate")}
            </Button>
            {isTranslatedActive && (
              <Button
                full={false}
                variant="secondary"
                onClick={clearTranslatedData}
                className="sm:col-span-2 lg:w-auto"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                {t("myHealthInfo.actions.clearTranslation")}
              </Button>
            )}
          </div>
        </div>
      </header>

      <section
        className={`rounded-3xl border p-4 shadow-sm sm:p-5 ${
          patientView.isDeceased
            ? "border-red-200 bg-red-50/80"
            : "border-emerald-200 bg-emerald-50/80"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ${
              patientView.isDeceased ? "text-red-700" : "text-emerald-700"
            }`}
          >
            {patientView.isDeceased ? (
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            )}
          </div>
          <p
            className={`min-w-0 break-words text-sm font-medium leading-6 ${
              patientView.isDeceased ? "text-red-900" : "text-emerald-900"
            }`}
          >
            {patientView.isDeceased
              ? t("patients.list.filters.options.deceased")
              : t("patients.list.filters.options.alive")}
          </p>
        </div>
      </section>

      {isTranslatedActive && (
        <section className="rounded-3xl border border-blue-200 bg-blue-50/80 p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
              <Info className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="min-w-0 break-words text-sm font-medium leading-6 text-blue-900">
              {t("common.translate")}
            </p>
          </div>
        </section>
      )}

      <SectionCard title={t("myHealthInfo.sections.basic.title")} icon={User2} tone="blue">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {email && <RecordField label={t("patients.detail.email")} value={email} icon={Mail} />}
          {phone && <RecordField label={t("patients.detail.phone")} value={phone} icon={Phone} />}
          {age != null && <RecordField label={t("patients.card.age")} value={age} />}
          {categoryLabel && <RecordField label={t("patients.detail.category")} value={categoryLabel} />}
          {bloodtype && (
            <RecordField label={t("patients.card.blood")} value={bloodtype} icon={Droplet} />
          )}
          {patientView.gender && (
            <RecordField
              label={t("patients.card.gender")}
              value={
                patientView.gender === "male"
                  ? t("patients.card.genderMale")
                  : t("patients.card.genderFemale")
              }
              icon={User2}
            />
          )}
          <RecordField
            label={t("patients.create.residence")}
            value={locationText || t("patients.detail.notSpecified")}
            icon={Globe}
            className="lg:col-span-2"
          />
          <RecordField
            label={t("patients.create.placeOfBirth")}
            value={birthplaceText || t("patients.detail.notSpecified")}
            icon={Globe}
            className="lg:col-span-2"
          />
          <RecordField
            label={t("patients.list.filters.organDonor")}
            value={
              patientView.organDonor
                ? t("patients.list.filters.options.yes")
                : t("patients.list.filters.options.no")
            }
            icon={Heart}
          />
          <RecordField
            label={t("patients.list.filters.bloodDonor")}
            value={
              patientView.bloodDonor
                ? t("patients.list.filters.options.yes")
                : t("patients.list.filters.options.no")
            }
            icon={Droplet}
          />
          {kidsCount > 0 && (
            <RecordField label={t("patients.create.childrenCount")} value={kidsCount} icon={Users} />
          )}
          {patientView.isDeceased && (
            <>
              {patientView.dateOfDeath && (
                <RecordField
                  label={t("patients.edit.dateOfDeath")}
                  value={formatDateTime(patientView.dateOfDeath)}
                  icon={AlertTriangle}
                  className="border-red-100 bg-red-50/70"
                />
              )}
              <RecordField
                label={t("patients.detail.causeOfDeath")}
                value={patientView.causeOfDeath || "--"}
                icon={AlertTriangle}
                className="border-red-100 bg-red-50/70 lg:col-span-2"
              />
            </>
          )}
        </div>
      </SectionCard>

      <SectionCard title={t("myHealthInfo.sections.anthropometrics.title")} icon={Activity} tone="rose">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {heightTextUI && <RecordField label={t("patients.detail.height")} value={heightTextUI} />}
          {weightDisplayUI != null && (
            <RecordField
              label={t("patients.detail.weight")}
              value={`${Number(weightDisplayUI).toFixed(2)} ${weightUnitUI}`}
            />
          )}
          {patientView?.bmi != null && (
            <RecordField label={t("patients.detail.bmi")}>
              <span className="mt-1 block break-words text-sm font-medium leading-6 text-slate-900">
                {Number(patientView.bmi).toFixed(2)}
              </span>
              {bmiLabel && (
                <span className="block text-sm leading-6 text-slate-600">
                  {t("patients.detail.bmiCategoryParen", { category: bmiLabel })}
                </span>
              )}
            </RecordField>
          )}
        </div>
      </SectionCard>

      <SectionCard title={t("myHealthInfo.sections.conditions.title")} icon={Stethoscope} tone="emerald">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ConditionColumn
            label={t("patients.detail.diseases")}
            icon={Activity}
            iconClassName="text-rose-500"
            items={diseases}
            emptyText={t("patients.detail.notSpecified")}
          />
          <ConditionColumn
            label={t("patients.detail.allergies")}
            icon={Droplet}
            iconClassName="text-amber-500"
            items={allergies}
            emptyText={t("patients.detail.notSpecified")}
          />
          <ConditionColumn
            label={t("patients.detail.medications")}
            icon={Pill}
            iconClassName="text-blue-500"
            items={patientView?.medications}
            emptyText={t("patients.detail.notSpecified")}
          />
        </div>
      </SectionCard>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm sm:p-5">
        <div className="inline-flex items-center gap-2">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          <span>
            {t("patients.detail.created")}: {formatDateTime(createdAt)} - {t("patients.detail.updated")}:{" "}
            {formatDateTime(updatedAt)}
          </span>
        </div>
      </section>

      {showHistory && (
        <PatientHistoryModal
          variant="doctor"
          patientId={id}
          onClose={() => setShowHistory(false)}
        />
      )}

      {showGuardianForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeGuardianForm();
          }}
        >
          <div
            ref={guardianPanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="guardian-modal-title"
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeGuardianForm();
              trapPanelFocus(e, e.currentTarget);
            }}
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl outline-none"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="guardian-modal-title" className="text-lg font-semibold text-slate-900">
                {t("patients.detail.reassignGuardian")}
              </h2>
              <button
                type="button"
                onClick={closeGuardianForm}
                disabled={reassignGuardian.isPending}
                aria-label={t("common.close")}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleGuardianSubmit} className="space-y-4">
              <div>
                <label htmlFor="guardian-email" className="mb-1 block text-sm font-medium text-slate-700">
                  {t("patients.detail.newGuardianEmail")}
                </label>
                <input
                  id="guardian-email"
                  type="email"
                  value={newParentEmail}
                  onChange={(e) => setNewParentEmail(e.target.value)}
                  onBlur={() => setNewParentEmail((value) => value.trim().toLowerCase())}
                  placeholder={t("patients.detail.newGuardianEmailPlaceholder")}
                  required
                  disabled={reassignGuardian.isPending}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                />
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  full={false}
                  variant="secondary"
                  onClick={closeGuardianForm}
                  disabled={reassignGuardian.isPending}
                >
                  {t("patients.edit.cancel")}
                </Button>
                <Button
                  type="submit"
                  full={false}
                  loading={reassignGuardian.isPending}
                  disabled={!newParentEmail.trim() || reassignGuardian.isPending}
                >
                  {t("patients.detail.reassignGuardian")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}
