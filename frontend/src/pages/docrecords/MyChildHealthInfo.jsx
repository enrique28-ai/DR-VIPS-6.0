import { useNavigate, useParams } from "react-router-dom";
import {
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

function findChildRecord(records, childId) {
  const arr = Array.isArray(records) ? records : [];
  return arr.find(
    (c) => c.profileId === childId || (c?.snapshot?.sources || []).some((s) => s?.id === childId),
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
    return (
      <div className="flex justify-center p-10 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!displayData || !displayData.hasRecords) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-center">
        <h2 className="text-xl font-bold text-slate-800">{t("myChildren.childNotFound")}</h2>
        <Button className="mt-4" onClick={() => navigate("/docrecords/mychildren")}>
          {t("myChildren.back")}
        </Button>
      </div>
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
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* --- CABECERA --- */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{fullName}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <User2 className="h-4 w-4" /> {t("myChildren.healthInfo")}
          </p>
        </div>

        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button variant="secondary" onClick={() => setOpenHistory(true)} className="w-full sm:w-auto">
            <History className="mr-2 h-4 w-4" />
            {t("myHealthInfo.history.button")}
          </Button>
          <Button
            variant="secondary"
            onClick={handleTranslate}
            disabled={isTranslating}
            className="w-full sm:w-auto"
          >
            <Languages className="mr-2 h-4 w-4" />
            {isTranslating ? t("common.loading") : t("common.translate")}
          </Button>
          {translatedData && translatedLang === i18n.language && (
            <Button variant="secondary" onClick={clearTranslatedData} className="w-full sm:w-auto">
              <X className="mr-2 h-4 w-4" />
              {t("myHealthInfo.actions.clearTranslation")}
            </Button>
          )}
        </div>
      </div>

      {/* --- BANNER DE ESTADO --- */}
      {pendingDecision ? (
        <div className="rounded-r-lg border-l-4 border-amber-500 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-start">
            <Info className="mt-0.5 h-5 w-5 text-amber-500" />
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-bold text-amber-800">{t("myChildren.pending")}</h3>
              <p className="mt-1 text-sm text-amber-700">
                {doctorName} · {lastUpdated}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center rounded-r-lg border-l-4 border-emerald-500 bg-emerald-50 p-4 shadow-sm">
          <Info className="h-5 w-5 text-emerald-500" />
          <p className="ml-3 text-sm font-medium text-emerald-800">{t("myChildren.upToDate")}</p>
        </div>
      )}

      {/* --- SECCIÓN: DATOS BÁSICOS --- */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-4">
          <div className="rounded-lg bg-white p-2 text-indigo-500 shadow-sm">
            <User2 className="h-4 w-4" />
          </div>
          <h3 className="font-bold text-slate-800">{t("myHealthInfo.sections.basic.title")}</h3>
        </div>
        
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-100 bg-white p-3">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myHealthInfo.sections.basic.age")}
            </span>
            <span className="font-medium text-slate-800">
              {ageVal != null
                ? t("myHealthInfo.sections.basic.ageWithYears", { age: ageVal })
                : t("myHealthInfo.common.notSpecified")}
            </span>
            <ScalarHistory label={t("myHealthInfo.sections.basic.age")} wrapper={snapshot?.age} t={t} />
          </div>

          <div className="rounded-lg border border-slate-100 bg-white p-3">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myHealthInfo.sections.basic.gender")}
            </span>
            <span className="font-medium text-slate-800">{genderVal || t("myHealthInfo.common.notSpecified")}</span>
            <ScalarHistory
              label={t("myHealthInfo.sections.basic.gender")}
              wrapper={snapshot?.gender}
              t={t}
              formatter={formatGender}
            />
          </div>

          <div className="rounded-lg border border-slate-100 bg-white p-3">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myHealthInfo.sections.basic.bloodType")}
            </span>
            <span className="font-medium text-slate-800">{bloodtypeVal || t("myHealthInfo.common.notSpecified")}</span>
            <ScalarHistory
              label={t("myHealthInfo.sections.basic.bloodType")}
              wrapper={snapshot?.bloodtype}
              t={t}
            />
          </div>

          <div className="rounded-lg border border-slate-100 bg-white p-3 lg:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myHealthInfo.sections.basic.location")}
            </span>
            <span className="font-medium text-slate-800">{locationVal || t("myHealthInfo.common.notSpecified")}</span>
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

          <div className="rounded-lg border border-slate-100 bg-white p-3 lg:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("patients.create.placeOfBirth")}
            </span>
            <span className="font-medium text-slate-800">{birthplaceVal || t("myHealthInfo.common.notSpecified")}</span>
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

          <div className="rounded-lg border border-slate-100 bg-white p-3">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myHealthInfo.sections.basic.phone")}
            </span>
            <span className="inline-flex items-center gap-2 font-medium text-slate-800">
              <Mail className="h-4 w-4 text-slate-500" />
              {phoneVal || t("myHealthInfo.common.notSpecified")}
            </span>
            {showPhoneCountryMeta && (
              <p className="mt-1 text-xs text-slate-600">
                {t("patients.create.phoneCountry")}: {phoneCountryDisplay}
              </p>
            )}
            <ScalarHistory label={t("myHealthInfo.sections.basic.phone")} wrapper={snapshot?.phone} t={t} />
          </div>

           <div className="rounded-lg border border-slate-100 bg-white p-3">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("patients.create.birthDate")}
            </span>
            <span className="font-medium text-slate-800">{birthDateVal}</span>
          </div>

          {isDeceased && (
            <>
              <div className="rounded-lg border border-slate-100 bg-white p-3">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {t("patients.edit.dateOfDeath")}
                </span>
                <span className="font-medium text-slate-800">{deathDateVal}</span>
              </div>

              <div className="rounded-lg border border-slate-100 bg-white p-3 lg:col-span-2">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {t("myHealthInfo.sections.basic.causeOfDeath")}
                </span>
                <span className="font-medium text-slate-800">{causeOfDeathVal}</span>
              </div>
            </>
          )}

          <div className="rounded-lg border border-slate-100 bg-white p-3">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myChildren.tutorEmail")}
            </span>
            <span className="inline-flex items-center gap-2 font-medium text-slate-800">
              <Mail className="h-4 w-4 text-slate-500" />
              {parentEmail || t("myHealthInfo.common.notSpecified")}
            </span>
          </div>
        </div>
      </section>

      {/* --- SECCIÓN: ANTROPOMETRÍA --- */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-4">
          <div className="rounded-lg bg-white p-2 text-rose-500 shadow-sm">
            <Activity className="h-4 w-4" />
          </div>
          <h3 className="font-bold text-slate-800">{t("myHealthInfo.sections.anthropometrics.title")}</h3>
        </div>
        
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-100 bg-white p-3">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myHealthInfo.sections.anthropometrics.height")}
            </span>
            <span className="font-medium text-slate-800">{heightDisplay}</span>
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
          
          <div className="rounded-lg border border-slate-100 bg-white p-3">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myHealthInfo.sections.anthropometrics.weight")}
            </span>
            <span className="font-medium text-slate-800">{weightDisplay}</span>
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
          
          <div className="rounded-lg border border-slate-100 bg-white p-3">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t("myHealthInfo.sections.anthropometrics.bmi")}
            </span>
            <span className="font-medium text-slate-800">{bmiDisplay}</span>
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
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-4">
          <div className="rounded-lg bg-white p-2 text-emerald-500 shadow-sm">
            <Stethoscope className="h-4 w-4" />
          </div>
          <h3 className="font-bold text-slate-800">{t("myHealthInfo.sections.conditions.title")}</h3>
        </div>
        
        <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-3">
          
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <Activity className="h-4 w-4 text-rose-400" /> {t("myHealthInfo.sections.conditions.diseases")}
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
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <Droplets className="h-4 w-4 text-amber-400" /> {t("myHealthInfo.sections.conditions.allergies")}
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
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <Pill className="h-4 w-4 text-blue-400" /> {t("myHealthInfo.sections.conditions.medications")}
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
        <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
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
    </div>
  );
}
