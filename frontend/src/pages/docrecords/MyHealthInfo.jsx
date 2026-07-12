import { useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Droplets,
  History,
  Info,
  Languages,
  Loader2,
  Mail,
  Pill,
  Stethoscope,
  User2,
  X,
} from "lucide-react";
import Button from "../../components/forms/Button.jsx";
import {
  useApprovePatientProfile,
  useMyHealthInfo,
  useRejectPatientProfile,
  useTranslateMyHealthInfo,
} from "../../features/patients/phooks.js";
import PatientHistoryModal from "../../components/patient/PatientHistoryModal.jsx";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import {
  getDialCodeByCountryIso,
  localizeCityName,
  localizeCountryName,
  localizeStateName,
} from "../../utilsfront/geoLabels.js";
import { formatHeightForSystem } from "../../utilsfront/measurements.js";
import {
  ChipList,
  ScalarHistory,
  formatDateOnly,
  formatDateTime,
  scalarValue,
} from "./myhealthfunctions/healthfunctions.jsx";

function yesNoFromScalar(w, t) {
  const v = scalarValue(w);
  if (v === true) return t("myHealthInfo.common.yes");
  if (v === false) return t("myHealthInfo.common.no");
  return t("myHealthInfo.common.notSpecified");
}

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
            {t("common.loading")}
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

function EmptyState({ t, onBack }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <Info className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            {t("myHealthInfo.empty.title")}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            {t("myHealthInfo.empty.description")}
          </p>
          <Button className="mt-6 sm:w-auto" onClick={onBack}>
            {t("myHealthInfo.empty.backToState")}
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
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
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

function PreviousLocations({ title, locations, language, t }) {
  if (locations.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
      <p className="font-semibold text-slate-700">{title}</p>
      <div className="mt-1 space-y-1">
        {locations.map((loc, idx) => (
          <p key={idx} className="break-words">
            {[
              localizeCountryName(loc.country, language),
              localizeStateName({ countryName: loc.country, stateName: loc.state, t }),
              localizeCityName({
                countryName: loc.country,
                stateName: loc.state,
                cityName: loc.city,
                t,
              }),
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
        ))}
      </div>
    </div>
  );
}

function ReviewStatusBanner({ pendingDecision, doctorName, lastUpdated, t }) {
  if (pendingDecision) {
    return (
      <section className="rounded-3xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-700 shadow-sm">
            <Info className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-amber-950">
              {t("myHealthInfo.header.pendingReview")}
            </h2>
            <p className="mt-1 break-words text-sm leading-6 text-amber-800">
              {doctorName} - {lastUpdated}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <p className="min-w-0 break-words text-sm font-medium leading-6 text-emerald-900">
          {t("myHealthInfo.header.allUpToDate")}
        </p>
      </div>
    </section>
  );
}

function ConditionColumn({
  added,
  approved,
  changed,
  icon: Icon,
  iconClassName,
  items,
  label,
  removed,
  t,
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Icon className={`h-4 w-4 ${iconClassName}`} aria-hidden="true" />
        {label}
      </h3>
      <div className="mt-3">
        <ChipList items={items} t={t} />
      </div>
      {changed && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-slate-600">
            {t("myHealthInfo.changes.previouslyApproved")}
          </p>
          <ChipList items={approved} t={t} />
          {added.length > 0 && (
            <>
              <p className="text-xs font-medium text-emerald-700">
                {t("myHealthInfo.changes.thisWasAdded")}
              </p>
              <ChipList items={added} t={t} tone="success" />
            </>
          )}
          {removed.length > 0 && (
            <>
              <p className="text-xs font-medium text-rose-700">
                {t("myHealthInfo.changes.thisWasRemoved")}
              </p>
              <ChipList items={removed} t={t} tone="danger" />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function MyHealthInfo() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [showHistory, setShowHistory] = useState(false);
  const [translatedData, setTranslatedData] = useState(null);
  const [translatedLang, setTranslatedLang] = useState("");

  const { data: serverData, isLoading, isError } = useMyHealthInfo();
  const approveMutation = useApprovePatientProfile();
  const rejectMutation = useRejectPatientProfile();
  const { mutate: translateHealthInfo, isPending: isTranslating } = useTranslateMyHealthInfo();

  const isTranslatedActive = Boolean(translatedData && translatedLang === i18n.language);
  const displayData = isTranslatedActive ? translatedData : serverData;

  if (isLoading) {
    return <LoadingState t={t} />;
  }

  if (isError || !displayData || !displayData.hasRecords) {
    return (
      <EmptyState
        t={t}
        onBack={() => {
          navigate("/docrecords/myhealthstate");
        }}
      />
    );
  }

  const { snapshot, pendingDecision, profileId } = displayData;
  const latestSource = snapshot?.sources?.[0];
  const lastUpdated = formatDateTime(latestSource?.updatedAt, t, i18n.language);
  const doctorName = latestSource?.doctorName || t("myHealthInfo.history.systemUnknown");

  const ageVal = scalarValue(snapshot?.age);
  const genderRaw = scalarValue(snapshot?.gender);
  const genderLower = typeof genderRaw === "string" ? genderRaw.toLowerCase() : genderRaw;

  const genderVal =
    genderLower === "male"
      ? t("patients.card.genderMale")
      : genderLower === "female"
        ? t("patients.card.genderFemale")
        : genderRaw || null;

  const formatGender = (v) => {
    const raw = scalarValue(v);
    if (raw == null || raw === "") return t("myHealthInfo.common.notSpecified");

    const s = typeof raw === "string" ? raw.toLowerCase() : raw;
    if (s === "male") return t("patients.card.genderMale");
    if (s === "female") return t("patients.card.genderFemale");

    return String(raw);
  };

  const formatYesNo = (v) =>
    v === true
      ? t("myHealthInfo.common.yes")
      : v === false
        ? t("myHealthInfo.common.no")
        : t("myHealthInfo.common.notSpecified");

  const bloodtypeVal = scalarValue(snapshot?.bloodtype);
  const phoneVal = scalarValue(snapshot?.phone);
  const phoneCountryVal = scalarValue(snapshot?.phoneCountry);
  const phoneCountryIsoVal = scalarValue(snapshot?.phoneCountryIso);
  const phoneDialCodeVal = getDialCodeByCountryIso(phoneCountryIsoVal);
  const phoneCountryDisplay = [phoneCountryVal, phoneDialCodeVal].filter(Boolean).join(" ");
  const showPhoneCountryMeta = Boolean(phoneVal && phoneCountryDisplay);

  const countryRaw = scalarValue(snapshot?.country);
  const stateRaw = scalarValue(snapshot?.state);
  const cityRaw = scalarValue(snapshot?.city);
  const birthCountryRaw = scalarValue(snapshot?.birthCountry);
  const birthStateRaw = scalarValue(snapshot?.birthState);
  const birthCityRaw = scalarValue(snapshot?.birthCity);

  const locationVal = [
    localizeCountryName(countryRaw, i18n.language) || countryRaw,
    localizeStateName({ countryName: countryRaw, stateName: stateRaw, t }) || stateRaw,
    localizeCityName({ countryName: countryRaw, stateName: stateRaw, cityName: cityRaw, t }) ||
      cityRaw,
  ]
    .filter(Boolean)
    .join(", ");

  const birthplaceVal = [
    localizeCountryName(birthCountryRaw, i18n.language) || birthCountryRaw,
    localizeStateName({ countryName: birthCountryRaw, stateName: birthStateRaw, t }) ||
      birthStateRaw,
    localizeCityName({
      countryName: birthCountryRaw,
      stateName: birthStateRaw,
      cityName: birthCityRaw,
      t,
    }) || birthCityRaw,
  ]
    .filter(Boolean)
    .join(", ");

  const getAlts = (w) =>
    w && typeof w === "object" && Array.isArray(w.alternatives) ? w.alternatives : [];

  const countryAlts = getAlts(snapshot?.country);
  const stateAlts = getAlts(snapshot?.state);
  const cityAlts = getAlts(snapshot?.city);
  const birthCountryAlts = getAlts(snapshot?.birthCountry);
  const birthStateAlts = getAlts(snapshot?.birthState);
  const birthCityAlts = getAlts(snapshot?.birthCity);

  const maxLoc = Math.max(countryAlts.length, stateAlts.length, cityAlts.length);
  const prevLocations =
    maxLoc > 1
      ? Array.from({ length: maxLoc - 1 }, (_, k) => {
          const i = k + 1;
          return {
            country: countryAlts[i] ?? countryAlts[0] ?? countryRaw,
            state: stateAlts[i] ?? stateAlts[0] ?? stateRaw,
            city: cityAlts[i] ?? cityAlts[0] ?? cityRaw,
          };
        }).filter((loc) => {
          const isCurrent =
            loc.country === countryRaw && loc.state === stateRaw && loc.city === cityRaw;
          return !isCurrent;
        })
      : [];

  const maxBirthLoc = Math.max(
    birthCountryAlts.length,
    birthStateAlts.length,
    birthCityAlts.length,
  );
  const prevBirthplaces =
    maxBirthLoc > 1
      ? Array.from({ length: maxBirthLoc - 1 }, (_, k) => {
          const i = k + 1;
          return {
            country: birthCountryAlts[i] ?? birthCountryAlts[0] ?? birthCountryRaw,
            state: birthStateAlts[i] ?? birthStateAlts[0] ?? birthStateRaw,
            city: birthCityAlts[i] ?? birthCityAlts[0] ?? birthCityRaw,
          };
        }).filter((loc) => {
          const isCurrent =
            loc.country === birthCountryRaw &&
            loc.state === birthStateRaw &&
            loc.city === birthCityRaw;
          return !isCurrent;
        })
      : [];

  const birthDateVal = formatDateOnly(snapshot?.birthDate, t, i18n.language);
  const isDeceased = snapshot?.isDeceased === true;
  const deathDateVal = formatDateOnly(snapshot?.dateOfDeath, t, i18n.language);
  const causeOfDeathVal = snapshot?.causeOfDeath || t("myHealthInfo.common.notSpecified");

  const organDonorLabel = yesNoFromScalar(snapshot?.organDonor, t);
  const bloodDonorLabel = yesNoFromScalar(snapshot?.bloodDonor, t);

  const measurementSystem =
    scalarValue(snapshot?.measurementSystem) ?? scalarValue(snapshot?.measurementSystemWrapper);
  const useMetric = measurementSystem === "metric";

  const heightMValue = scalarValue(snapshot?.heightM) ?? scalarValue(snapshot?.heightWrapper);

  const heightDisplay = formatHeightForSystem({
    measurementSystem,
    heightM: heightMValue,
    heightFeet: scalarValue(snapshot?.heightFeet) ?? undefined,
    heightInches: scalarValue(snapshot?.heightInches) ?? undefined,
    heightDisplay: scalarValue(snapshot?.heightDisplay) ?? undefined,
    notSpecified: t("myHealthInfo.common.notSpecified"),
  });

  const weightDisplay =
    typeof snapshot?.weightKg === "number"
      ? useMetric
        ? `${snapshot.weightKg.toFixed(2)} kg`
        : `${(snapshot.weightKg / 0.45359237).toFixed(2)} lb`
      : t("myHealthInfo.common.notSpecified");

  const bmiDisplay =
    typeof snapshot?.bmi === "number"
      ? snapshot.bmi.toFixed(2)
      : t("myHealthInfo.common.notCalculated");

  const fullName =
    scalarValue(snapshot?.fullnameWrapper) ||
    scalarValue(snapshot?.fullname) ||
    t("myHealthInfo.sections.basic.fullname");

  const latestDiseases = Array.isArray(snapshot?.diseases) ? snapshot.diseases : [];
  const latestAllergies = Array.isArray(snapshot?.allergies) ? snapshot.allergies : [];
  const latestMedications = Array.isArray(snapshot?.medications) ? snapshot.medications : [];

  const approvedDiseases = Array.isArray(snapshot?.commonDiseases) ? snapshot.commonDiseases : [];
  const approvedAllergies = Array.isArray(snapshot?.commonAllergies)
    ? snapshot.commonAllergies
    : [];
  const approvedMedications = Array.isArray(snapshot?.commonMedications)
    ? snapshot.commonMedications
    : [];

  const addedDiseases = latestDiseases.filter((d) => !approvedDiseases.includes(d));
  const removedDiseases = approvedDiseases.filter((d) => !latestDiseases.includes(d));

  const addedAllergies = latestAllergies.filter((a) => !approvedAllergies.includes(a));
  const removedAllergies = approvedAllergies.filter((a) => !latestAllergies.includes(a));

  const addedMedications = latestMedications.filter((m) => !approvedMedications.includes(m));
  const removedMedications = approvedMedications.filter((m) => !latestMedications.includes(m));

  const diseasesChanged = snapshot?.diseasesChanged === true;
  const allergiesChanged = snapshot?.allergiesChanged === true;
  const medicationsChanged = snapshot?.medicationsChanged === true;

  const handleTranslate = () => {
    translateHealthInfo(
      { lang: i18n.language },
      {
        onSuccess: (data) => {
          setTranslatedData(data);
          setTranslatedLang(i18n.language);
        },
      },
    );
  };

  const clearTranslatedData = () => {
    setTranslatedData(null);
    setTranslatedLang("");
  };

  const handleApprove = () => approveMutation.mutate(profileId || latestSource?.id);
  const handleReject = () => rejectMutation.mutate(profileId || latestSource?.id);

  return (
    <PageShell>
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium leading-6 text-slate-600">
              <User2 className="h-4 w-4 text-blue-600" aria-hidden="true" />
              {t("navbar.myHealthInfo")}
            </p>
            <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {fullName}
            </h1>
          </div>

          <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:grid-cols-none lg:flex lg:items-center">
            <button
              type="button"
              onClick={() => navigate("/docrecords/myhealthstate")}
              className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:col-span-2 lg:w-auto"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t("myHealthState.detail.backToState")}
            </button>
            <Button
              variant="secondary"
              onClick={() => setShowHistory(true)}
              className="sm:w-auto"
            >
              <History className="h-4 w-4" aria-hidden="true" />
              {t("myHealthInfo.history.button")}
            </Button>
            <Button
              variant="secondary"
              onClick={handleTranslate}
              disabled={isTranslating}
              className="sm:w-auto"
            >
              <Languages className="h-4 w-4" aria-hidden="true" />
              {isTranslating ? t("common.loading") : t("common.translate")}
            </Button>
            {isTranslatedActive && (
              <Button
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

      <ReviewStatusBanner
        pendingDecision={pendingDecision}
        doctorName={doctorName}
        lastUpdated={lastUpdated}
        t={t}
      />

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
          <RecordField
            label={t("myHealthInfo.sections.basic.age")}
            value={
              ageVal != null
                ? t("myHealthInfo.sections.basic.ageWithYears", { age: ageVal })
                : t("myHealthInfo.common.notSpecified")
            }
          >
            <ScalarHistory label={t("myHealthInfo.sections.basic.age")} wrapper={snapshot?.age} t={t} />
          </RecordField>

          <RecordField
            label={t("myHealthInfo.sections.basic.gender")}
            value={genderVal || t("myHealthInfo.common.notSpecified")}
          >
            <ScalarHistory
              label={t("myHealthInfo.sections.basic.gender")}
              wrapper={snapshot?.gender}
              t={t}
              formatter={formatGender}
            />
          </RecordField>

          <RecordField
            label={t("myHealthInfo.sections.basic.bloodType")}
            value={bloodtypeVal || t("myHealthInfo.common.notSpecified")}
          >
            <ScalarHistory
              label={t("myHealthInfo.sections.basic.bloodType")}
              wrapper={snapshot?.bloodtype}
              t={t}
            />
          </RecordField>

          <RecordField
            label={t("myHealthInfo.sections.basic.location")}
            value={locationVal || t("myHealthInfo.common.notSpecified")}
            className="lg:col-span-2"
          >
            <PreviousLocations
              title={t("myHealthInfo.common.previouslyRecordedLocations")}
              locations={prevLocations}
              language={i18n.language}
              t={t}
            />
          </RecordField>

          <RecordField
            label={t("patients.create.placeOfBirth")}
            value={birthplaceVal || t("myHealthInfo.common.notSpecified")}
            className="lg:col-span-2"
          >
            <PreviousLocations
              title={t("myHealthInfo.common.previouslyRecordedBirthplaces")}
              locations={prevBirthplaces}
              language={i18n.language}
              t={t}
            />
          </RecordField>

          <RecordField
            label={t("myHealthInfo.sections.basic.phone")}
            value={phoneVal || t("myHealthInfo.common.notSpecified")}
            icon={Mail}
          >
            {showPhoneCountryMeta && (
              <p className="mt-1 break-words text-xs font-medium text-slate-600">
                {t("patients.create.phoneCountry")}: {phoneCountryDisplay}
              </p>
            )}
            <ScalarHistory label={t("myHealthInfo.sections.basic.phone")} wrapper={snapshot?.phone} t={t} />
          </RecordField>

          <RecordField label={t("patients.create.birthDate")} value={birthDateVal} />

          <RecordField
            label={t("myHealthInfo.sections.basic.organDonor")}
            value={organDonorLabel}
          >
            <ScalarHistory
              label={t("myHealthInfo.sections.basic.organDonor")}
              wrapper={snapshot?.organDonor}
              t={t}
              formatter={formatYesNo}
            />
          </RecordField>

          <RecordField
            label={t("myHealthInfo.sections.basic.bloodDonor")}
            value={bloodDonorLabel}
          >
            <ScalarHistory
              label={t("myHealthInfo.sections.basic.bloodDonor")}
              wrapper={snapshot?.bloodDonor}
              t={t}
              formatter={formatYesNo}
            />
          </RecordField>

          {isDeceased && (
            <>
              <RecordField label={t("patients.edit.dateOfDeath")} value={deathDateVal} />
              <RecordField
                label={t("myHealthInfo.sections.basic.causeOfDeath")}
                value={causeOfDeathVal}
                className="lg:col-span-2"
              />
            </>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title={t("myHealthInfo.sections.anthropometrics.title")}
        icon={Activity}
        tone="rose"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <RecordField
            label={t("myHealthInfo.sections.anthropometrics.height")}
            value={heightDisplay}
          >
            <ScalarHistory
              label={t("myHealthInfo.sections.anthropometrics.height")}
              wrapper={snapshot?.heightWrapper}
              t={t}
              useMetric={useMetric}
              isHeight
              formatter={(v) => {
                if (typeof v !== "number") return t("myHealthInfo.common.notSpecified");
                return useMetric
                  ? `${v.toFixed(2)} m`
                  : formatHeightForSystem({
                      measurementSystem: "imperial",
                      heightM: v,
                      notSpecified: t("myHealthInfo.common.notSpecified"),
                    });
              }}
            />
          </RecordField>

          <RecordField
            label={t("myHealthInfo.sections.anthropometrics.weight")}
            value={weightDisplay}
          >
            <ScalarHistory
              label={t("myHealthInfo.sections.anthropometrics.weight")}
              wrapper={snapshot?.weightWrapper}
              t={t}
              useMetric={useMetric}
              isWeight
              formatter={(v) => {
                if (typeof v !== "number") return t("myHealthInfo.common.notSpecified");
                return useMetric ? `${v.toFixed(2)} kg` : `${(v / 0.45359237).toFixed(2)} lb`;
              }}
            />
          </RecordField>

          <RecordField label={t("myHealthInfo.sections.anthropometrics.bmi")} value={bmiDisplay}>
            <ScalarHistory
              label={t("myHealthInfo.sections.anthropometrics.bmi")}
              wrapper={snapshot?.bmiWrapper}
              t={t}
              formatter={(v) => {
                if (typeof v !== "number") return t("myHealthInfo.common.notCalculated");
                return v.toFixed(2);
              }}
            />
          </RecordField>
        </div>
      </SectionCard>

      <SectionCard
        title={t("myHealthInfo.sections.conditions.title")}
        icon={Stethoscope}
        tone="emerald"
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ConditionColumn
            label={t("myHealthInfo.sections.conditions.diseases")}
            icon={Activity}
            iconClassName="text-rose-500"
            items={latestDiseases}
            changed={diseasesChanged}
            approved={approvedDiseases}
            added={addedDiseases}
            removed={removedDiseases}
            t={t}
          />
          <ConditionColumn
            label={t("myHealthInfo.sections.conditions.allergies")}
            icon={Droplets}
            iconClassName="text-amber-500"
            items={latestAllergies}
            changed={allergiesChanged}
            approved={approvedAllergies}
            added={addedAllergies}
            removed={removedAllergies}
            t={t}
          />
          <ConditionColumn
            label={t("myHealthInfo.sections.conditions.medications")}
            icon={Pill}
            iconClassName="text-blue-500"
            items={latestMedications}
            changed={medicationsChanged}
            approved={approvedMedications}
            added={addedMedications}
            removed={removedMedications}
            t={t}
          />
        </div>
      </SectionCard>

      {latestSource && pendingDecision && (
        <section className="rounded-3xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-amber-950">
                {t("myHealthInfo.header.pendingReview")}
              </h2>
              <p className="mt-1 break-words text-sm leading-6 text-amber-800">
                {t("myHealthInfo.actions.approveIntro")}
              </p>
            </div>
            <div className="grid gap-2 sm:flex sm:shrink-0 sm:items-center">
              <Button
                onClick={handleApprove}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                className="sm:w-auto"
              >
                {approveMutation.isPending
                  ? t("myHealthInfo.actions.approving")
                  : t("myHealthInfo.actions.approve")}
              </Button>
              <Button
                variant="secondary"
                onClick={handleReject}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                className="sm:w-auto"
              >
                {rejectMutation.isPending
                  ? t("myHealthInfo.actions.rejecting")
                  : t("myHealthInfo.actions.reject")}
              </Button>
            </div>
          </div>
        </section>
      )}

      {showHistory && <PatientHistoryModal onClose={() => setShowHistory(false)} />}
    </PageShell>
  );
}
