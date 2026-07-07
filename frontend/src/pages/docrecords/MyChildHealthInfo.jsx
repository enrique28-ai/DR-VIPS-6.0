import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  User2,
  Pill,
  Activity,
  Droplets,
  Info,
  Mail,
  Stethoscope,
  History,
  Languages,
  X,
  Loader2,
} from "lucide-react";
import Button from "../../components/forms/Button.jsx";

import {
  useMyChildrenHealthInfo,
  useApproveChildProfile,
  useRejectChildProfile,
  useTranslateMyChildrenHealthInfo,
} from "../../features/patients/phooks.js";

import PatientHistoryModal from "../../components/patient/PatientHistoryModal.jsx";

import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import {
  localizeCountryName,
  localizeStateName,
  localizeCityName,
  getDialCodeByCountryIso,
} from "../../utilsfront/geoLabels.js";
import { formatHeightForSystem } from "../../utilsfront/measurements.js";

import {
  scalarValue,
  formatDateTime,
  formatDateOnly,
  ScalarHistory,
  ChipList,
} from "./myhealthfunctions/healthfunctions.jsx";

function yesNoFromScalar(w, t) {
  const v = scalarValue(w);
  if (v === true) return t("myHealthInfo.common.yes");
  if (v === false) return t("myHealthInfo.common.no");
  return t("myHealthInfo.common.notSpecified");
}

function findChildRecord(records, childId) {
  const arr = Array.isArray(records) ? records : [];
  return arr.find(
    (c) => c.profileId === childId || (c?.snapshot?.sources || []).some((s) => s?.id === childId),
  );
}

function PageShell({ children }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </div>
    </main>
  );
}

function LoadingState({ t }) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50" aria-busy="true">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
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

export default function MyChildHealthInfo() {
  const { childId } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const { data: childrenData, isLoading } = useMyChildrenHealthInfo();
  const approve = useApproveChildProfile();
  const reject = useRejectChildProfile();
  const { mutate: translateChildHealthInfo, isPending: isTranslating } = useTranslateMyChildrenHealthInfo();

  const [openHistory, setOpenHistory] = useState(false);
  const [translatedData, setTranslatedData] = useState(null);
  const [translatedLang, setTranslatedLang] = useState("");

  // Encontrar la información del niño seleccionado
  const childInfo = useMemo(() => findChildRecord(childrenData, childId), [childrenData, childId]);
  const displayData =
    translatedData && translatedLang === i18n.language ? translatedData : childInfo;

  if (isLoading) {
    return <LoadingState t={t} />;
  }

  if (!displayData || !displayData.hasRecords) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <Info className="h-7 w-7" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              {t("myChildren.childNotFound")}
            </h1>
            <Button className="mt-6 sm:w-auto" onClick={() => navigate("/docrecords/mychildren")}>
              {t("myChildren.back")}
            </Button>
          </section>
        </div>
      </main>
    );
  }

  // Desestructuración y variables derivadas
  const { snapshot, pendingDecision, profileId, parentEmail } = displayData;
  const latestSource = snapshot?.sources?.[0];
  const lastUpdated = formatDateTime(latestSource?.updatedAt, t, i18n.language);
  const doctorName = latestSource?.doctorName || t("myHealthInfo.history.systemUnknown");

  const measurementSystem =
    scalarValue(snapshot?.measurementSystem) ??
    scalarValue(snapshot?.measurementSystemWrapper);
  const useMetric = measurementSystem === "metric";

  // Arrays lógicos para comparación (traídos de la lógica de Codex)
  const latestDiseases = Array.isArray(snapshot?.diseases) ? snapshot.diseases : [];
  const latestAllergies = Array.isArray(snapshot?.allergies) ? snapshot.allergies : [];
  const latestMedications = Array.isArray(snapshot?.medications) ? snapshot.medications : [];

  const approvedDiseases = Array.isArray(snapshot?.commonDiseases) ? snapshot.commonDiseases : [];
  const approvedAllergies = Array.isArray(snapshot?.commonAllergies) ? snapshot.commonAllergies : [];
  const approvedMedications = Array.isArray(snapshot?.commonMedications) ? snapshot.commonMedications : [];

  const addedDiseases = latestDiseases.filter((d) => !approvedDiseases.includes(d));
  const removedDiseases = approvedDiseases.filter((d) => !latestDiseases.includes(d));

  const addedAllergies = latestAllergies.filter((a) => !approvedAllergies.includes(a));
  const removedAllergies = approvedAllergies.filter((a) => !latestAllergies.includes(a));

  const addedMedications = latestMedications.filter((m) => !approvedMedications.includes(m));
  const removedMedications = approvedMedications.filter((m) => !latestMedications.includes(m));

  const diseasesChanged = snapshot?.diseasesChanged === true;
  const allergiesChanged = snapshot?.allergiesChanged === true;
  const medicationsChanged = snapshot?.medicationsChanged === true;

  // Manejo visual de escalares (traído de la lógica de Codex)
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
  const isDeceased = snapshot?.isDeceased === true;
  const birthDateVal = formatDateOnly(snapshot?.birthDate, t, i18n.language);
  const deathDateVal = formatDateOnly(snapshot?.dateOfDeath, t, i18n.language);
  const causeOfDeathVal = snapshot?.causeOfDeath || t("myHealthInfo.common.notSpecified");
  const organDonorLabel = yesNoFromScalar(snapshot?.organDonor, t);
  const bloodDonorLabel = yesNoFromScalar(snapshot?.bloodDonor, t);
  const countryRaw = scalarValue(snapshot?.country);
  const stateRaw = scalarValue(snapshot?.state);
  const cityRaw = scalarValue(snapshot?.city);
  const birthCountryRaw = scalarValue(snapshot?.birthCountry);
  const birthStateRaw = scalarValue(snapshot?.birthState);
  const birthCityRaw = scalarValue(snapshot?.birthCity);

  const locationVal = [
    localizeCountryName(countryRaw, i18n.language) || countryRaw,
    localizeStateName({ countryName: countryRaw, stateName: stateRaw, t }) || stateRaw,
    localizeCityName({ countryName: countryRaw, stateName: stateRaw, cityName: cityRaw, t }) || cityRaw,
  ]
    .filter(Boolean)
    .join(", ");

  const birthplaceVal = [
    localizeCountryName(birthCountryRaw, i18n.language) || birthCountryRaw,
    localizeStateName({ countryName: birthCountryRaw, stateName: birthStateRaw, t }) || birthStateRaw,
    localizeCityName({ countryName: birthCountryRaw, stateName: birthStateRaw, cityName: birthCityRaw, t }) || birthCityRaw,
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

  const maxBirthLoc = Math.max(birthCountryAlts.length, birthStateAlts.length, birthCityAlts.length);
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
            loc.country === birthCountryRaw && loc.state === birthStateRaw && loc.city === birthCityRaw;
          return !isCurrent;
        })
      : [];
  const heightMValue =
    scalarValue(snapshot?.heightM) ??
    scalarValue(snapshot?.heightWrapper);

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
    t("myChildren.unknownChild");

  const handleTranslate = () => {
    translateChildHealthInfo(
      { lang: i18n.language },
      {
        onSuccess: (data) => {
          setTranslatedData(findChildRecord(data, childId) || null);
          setTranslatedLang(i18n.language);
        },
      },
    );
  };

  const clearTranslatedData = () => {
    setTranslatedData(null);
    setTranslatedLang("");
  };

  const handleApprove = () => approve.mutate(profileId);
  const handleReject = () => reject.mutate(profileId);

  return (
    <PageShell>
      {/* --- CABECERA --- */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{fullName}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <User2 className="h-4 w-4" aria-hidden="true" /> {t("myChildren.healthInfo")}
          </p>
        </div>

        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button variant="secondary" onClick={() => setOpenHistory(true)} className="w-full sm:w-auto">
            <History className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("myHealthInfo.history.button")}
          </Button>
          <Button
            variant="secondary"
            onClick={handleTranslate}
            disabled={isTranslating}
            className="w-full sm:w-auto"
          >
            <Languages className="mr-2 h-4 w-4" aria-hidden="true" />
            {isTranslating ? t("common.loading") : t("common.translate")}
          </Button>
          {translatedData && translatedLang === i18n.language && (
            <Button variant="secondary" onClick={clearTranslatedData} className="w-full sm:w-auto">
              <X className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("myHealthInfo.actions.clearTranslation")}
            </Button>
          )}
        </div>
      </div>

      {/* --- BANNER DE ESTADO --- */}
      {pendingDecision ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-700 shadow-sm">
              <Info className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-amber-950">{t("myChildren.pending")}</h2>
              <p className="mt-1 break-words text-sm leading-6 text-amber-800">
                {doctorName} · {lastUpdated}
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
              <Info className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="min-w-0 break-words text-sm font-medium leading-6 text-emerald-900">
              {t("myChildren.upToDate")}
            </p>
          </div>
        </section>
      )}

      {/* --- SECCIÓN: DATOS BÁSICOS --- */}
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <User2 className="h-4 w-4" aria-hidden="true" />
          </div>
          <h3 className="font-semibold text-slate-950">{t("myHealthInfo.sections.basic.title")}</h3>
        </div>
        
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myHealthInfo.sections.basic.age")}
            </span>
            <span className="font-medium text-slate-900">
              {ageVal != null
                ? t("myHealthInfo.sections.basic.ageWithYears", { age: ageVal })
                : t("myHealthInfo.common.notSpecified")}
            </span>
            <ScalarHistory label={t("myHealthInfo.sections.basic.age")} wrapper={snapshot?.age} t={t} />
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myHealthInfo.sections.basic.gender")}
            </span>
            <span className="font-medium text-slate-900">{genderVal || t("myHealthInfo.common.notSpecified")}</span>
            <ScalarHistory
              label={t("myHealthInfo.sections.basic.gender")}
              wrapper={snapshot?.gender}
              t={t}
              formatter={formatGender}
            />
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myHealthInfo.sections.basic.bloodType")}
            </span>
            <span className="font-medium text-slate-900">{bloodtypeVal || t("myHealthInfo.common.notSpecified")}</span>
            <ScalarHistory
              label={t("myHealthInfo.sections.basic.bloodType")}
              wrapper={snapshot?.bloodtype}
              t={t}
            />
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 lg:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myHealthInfo.sections.basic.location")}
            </span>
            <span className="font-medium text-slate-900">{locationVal || t("myHealthInfo.common.notSpecified")}</span>
             {prevLocations.length > 0 && (
              <div className="mt-1 text-xs text-slate-600">
                <p>{t("myHealthInfo.common.previouslyRecordedLocations")}</p>
                <div className="mt-1 space-y-1">
                  {prevLocations.map((loc, idx) => (
                    <p key={idx}>
                      <span className="font-medium">
                        {[
                          localizeCountryName(loc.country, i18n.language),
                          localizeStateName({ countryName: loc.country, stateName: loc.state, t }),
                          localizeCityName({ countryName: loc.country, stateName: loc.state, cityName: loc.city, t }),
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 lg:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("patients.create.placeOfBirth")}
            </span>
            <span className="font-medium text-slate-900">{birthplaceVal || t("myHealthInfo.common.notSpecified")}</span>
            {prevBirthplaces.length > 0 && (
              <div className="mt-1 text-xs text-slate-600">
                <p>{t("myHealthInfo.common.previouslyRecordedBirthplaces")}</p>
                <div className="mt-1 space-y-1">
                  {prevBirthplaces.map((loc, idx) => (
                    <p key={idx}>
                      <span className="font-medium">
                        {[
                          localizeCountryName(loc.country, i18n.language),
                          localizeStateName({ countryName: loc.country, stateName: loc.state, t }),
                          localizeCityName({ countryName: loc.country, stateName: loc.state, cityName: loc.city, t }),
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myHealthInfo.sections.basic.phone")}
            </span>
            <span className="inline-flex items-center gap-2 font-medium text-slate-900">
              <Mail className="h-4 w-4 text-slate-500" aria-hidden="true" />
              {phoneVal || t("myHealthInfo.common.notSpecified")}
            </span>
            {showPhoneCountryMeta && (
              <p className="mt-1 text-xs text-slate-600">
                {t("patients.create.phoneCountry")}: {phoneCountryDisplay}
              </p>
            )}
            <ScalarHistory label={t("myHealthInfo.sections.basic.phone")} wrapper={snapshot?.phone} t={t} />
          </div>

           <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("patients.create.birthDate")}
            </span>
            <span className="font-medium text-slate-900">{birthDateVal}</span>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myHealthInfo.sections.basic.organDonor")}
            </span>
            <span className="font-medium text-slate-900">{organDonorLabel}</span>
            <ScalarHistory
              label={t("myHealthInfo.sections.basic.organDonor")}
              wrapper={snapshot?.organDonor}
              t={t}
              formatter={formatYesNo}
            />
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myHealthInfo.sections.basic.bloodDonor")}
            </span>
            <span className="font-medium text-slate-900">{bloodDonorLabel}</span>
            <ScalarHistory
              label={t("myHealthInfo.sections.basic.bloodDonor")}
              wrapper={snapshot?.bloodDonor}
              t={t}
              formatter={formatYesNo}
            />
          </div>

          {isDeceased && (
            <>
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {t("patients.edit.dateOfDeath")}
                </span>
                <span className="font-medium text-slate-900">{deathDateVal}</span>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 lg:col-span-2">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {t("myHealthInfo.sections.basic.causeOfDeath")}
                </span>
                <span className="font-medium text-slate-900">{causeOfDeathVal}</span>
              </div>
            </>
          )}

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myChildren.tutorEmail")}
            </span>
            <span className="inline-flex items-center gap-2 font-medium text-slate-900">
              <Mail className="h-4 w-4 text-slate-500" aria-hidden="true" />
              {parentEmail || t("myHealthInfo.common.notSpecified")}
            </span>
          </div>
        </div>
      </section>

      {/* --- SECCIÓN: ANTROPOMETRÍA --- */}
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </div>
          <h3 className="font-semibold text-slate-950">{t("myHealthInfo.sections.anthropometrics.title")}</h3>
        </div>
        
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myHealthInfo.sections.anthropometrics.height")}
            </span>
            <span className="font-medium text-slate-900">{heightDisplay}</span>
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
          </div>
          
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myHealthInfo.sections.anthropometrics.weight")}
            </span>
            <span className="font-medium text-slate-900">{weightDisplay}</span>
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
          </div>
          
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myHealthInfo.sections.anthropometrics.bmi")}
            </span>
            <span className="font-medium text-slate-900">{bmiDisplay}</span>
            <ScalarHistory
              label={t("myHealthInfo.sections.anthropometrics.bmi")}
              wrapper={snapshot?.bmiWrapper}
              t={t}
              formatter={(v) => {
                if (typeof v !== "number") return t("myHealthInfo.common.notCalculated");
                return v.toFixed(2);
              }}
            />
          </div>
        </div>
      </section>

      {/* --- SECCIÓN: CONDICIONES CLÍNICAS --- */}
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Stethoscope className="h-4 w-4" aria-hidden="true" />
          </div>
          <h3 className="font-semibold text-slate-950">{t("myHealthInfo.sections.conditions.title")}</h3>
        </div>
        
        <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-3">
          
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Activity className="h-4 w-4 text-rose-400" aria-hidden="true" /> {t("myHealthInfo.sections.conditions.diseases")}
            </h4>
            <ChipList items={latestDiseases} t={t} />
            {diseasesChanged && (
              <>
                <p className="text-xs text-slate-600">{t("myHealthInfo.changes.previouslyApproved")}</p>
                <ChipList items={approvedDiseases} t={t} />
                {addedDiseases.length > 0 && (
                  <>
                    <p className="text-xs text-emerald-700">{t("myHealthInfo.changes.thisWasAdded")}</p>
                    <ChipList items={addedDiseases} t={t} tone="success" />
                  </>
                )}
                {removedDiseases.length > 0 && (
                  <>
                    <p className="text-xs text-rose-700">{t("myHealthInfo.changes.thisWasRemoved")}</p>
                    <ChipList items={removedDiseases} t={t} tone="danger" />
                  </>
                )}
              </>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Droplets className="h-4 w-4 text-amber-400" aria-hidden="true" /> {t("myHealthInfo.sections.conditions.allergies")}
            </h4>
            <ChipList items={latestAllergies} t={t} />
            {allergiesChanged && (
              <>
                <p className="text-xs text-slate-600">{t("myHealthInfo.changes.previouslyApproved")}</p>
                <ChipList items={approvedAllergies} t={t} />
                {addedAllergies.length > 0 && (
                  <>
                    <p className="text-xs text-emerald-700">{t("myHealthInfo.changes.thisWasAdded")}</p>
                    <ChipList items={addedAllergies} t={t} tone="success" />
                  </>
                )}
                {removedAllergies.length > 0 && (
                  <>
                    <p className="text-xs text-rose-700">{t("myHealthInfo.changes.thisWasRemoved")}</p>
                    <ChipList items={removedAllergies} t={t} tone="danger" />
                  </>
                )}
              </>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Pill className="h-4 w-4 text-blue-400" aria-hidden="true" /> {t("myHealthInfo.sections.conditions.medications")}
            </h4>
            <ChipList items={latestMedications} t={t} />
            {medicationsChanged && (
              <>
                <p className="text-xs text-slate-600">{t("myHealthInfo.changes.previouslyApproved")}</p>
                <ChipList items={approvedMedications} t={t} />
               {addedMedications.length > 0 && (
                 <>
                   <p className="text-xs text-emerald-700">{t("myHealthInfo.changes.thisWasAdded")}</p>
                   <ChipList items={addedMedications} t={t} tone="success" />
                 </>
               )}
                {removedMedications.length > 0 && (
                  <>
                    <p className="text-xs text-rose-700">{t("myHealthInfo.changes.thisWasRemoved")}</p>
                    <ChipList items={removedMedications} t={t} tone="danger" />
                  </>
                )}
              </>
            )}
          </div>
          
        </div>
      </section>

      {/* --- ACCIONES --- */}
      {latestSource && pendingDecision && (
        <section className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <p className="text-sm text-slate-700">{t("myHealthInfo.actions.approveIntro")}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={handleApprove} disabled={approve.isPending || reject.isPending}>
              {approve.isPending ? t("myHealthInfo.actions.approving") : t("myHealthInfo.actions.approve")}
            </Button>
            <Button variant="secondary" onClick={handleReject} disabled={approve.isPending || reject.isPending}>
              {reject.isPending ? t("myHealthInfo.actions.rejecting") : t("myHealthInfo.actions.reject")}
            </Button>
          </div>
        </section>
      )}

      {/* --- MODAL HISTORIAL --- */}
      {openHistory && (
        <PatientHistoryModal
          patientId={profileId}
          onClose={() => setOpenHistory(false)}
          variant="child"
        />
      )}
    </PageShell>
  );
}
