import { useNavigate } from "react-router-dom";
import {
  User2,
  Pill,
  Activity,
  Droplets,
  AlertTriangle,
  Info,
  Mail, // <--- Importa esto de lucide-react si quieres el icono
  Stethoscope
} from "lucide-react";
import Button from "../../components/forms/Button.jsx";
import {
  useMyHealthInfo,
  useApprovePatientProfile,
  useRejectPatientProfile,
} from "../../features/patients/phooks.js";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import {
   localizeCountryName,
   localizeStateName,
   localizeCityName,
 } from "../../utilsfront/geoLabels.js";

function scalarValue(w) {
  return w && typeof w === "object" ? w.value ?? null : w ?? null;
}

function yesNoFromScalar(w, t) {
  const v = scalarValue(w);
  if (v === true) return t("myHealthInfo.common.yes");
  if (v === false) return t("myHealthInfo.common.no");
  return t("myHealthInfo.common.notSpecified");
}

function formatDateTime(iso, t, locale) {
  if (!iso) return t("myHealthInfo.common.unknownDate");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t("myHealthInfo.common.unknownDate");
  try {
    return locale ? d.toLocaleString(locale) : d.toLocaleString();
  } catch {
    return d.toLocaleString();
  }
}

function ConflictNote({ fieldLabel, wrapper, t }) {
  if (!wrapper || !wrapper.conflict) return null;

  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
      <AlertTriangle className="h-3 w-3" />
      {t("myHealthInfo.conflicts.differentField", {
        field: fieldLabel.toLowerCase(),
      })}
    </p>
  );
}

function ScalarHistory({ label, wrapper, formatter, t, useMetric, isHeight, isWeight }) {
  if (!wrapper || !Array.isArray(wrapper.alternatives) || wrapper.alternatives.length < 2) {
    return null;
  }

  const cur = wrapper.value ?? null;
  
  // Filtrar duplicados y el valor actual
  const prevList = [...new Set(wrapper.alternatives.slice(1))].filter((v) => {
    if (v === null || v === undefined || v === "") return false;
    
    // Si es un número (estatura o peso), comparamos con tolerancia para evitar 
    // que aparezca como "cambio" al alternar entre métrico/imperial
    if (typeof v === 'number' && typeof cur === 'number' && (isHeight || isWeight)) {
      const diff = Math.abs(v - cur);
      // Tolerancia de 0.001 para evitar diferencias por redondeo
      return diff > 0.001;
    }
    
    return v !== cur;
  });

  if (prevList.length === 0) return null;

  const labelText = label
    ? t("myHealthInfo.common.previouslyRecorded", { label: label.toLowerCase() })
    : t("myHealthInfo.common.previouslyRecordedGeneric");

  return (
    <div className="mt-1 text-xs text-slate-600">
      <p>
        {labelText}{" "}
        <span className="font-medium">
          {prevList.map((v, idx) => (
            <span key={idx}>
              {idx > 0 ? ", " : ""}
              {formatter ? formatter(v) : String(v)}
            </span>
          ))}
        </span>
      </p>
    </div>
  );
}


function ChipList({ items, t }) {
  if (!items || items.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        {t("myHealthInfo.common.noneRecorded")}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <span
          key={it}
          className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800"
        >
          {it}
        </span>
      ))}
    </div>
  );
}

export default function MyHealthInfo() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const { data, isLoading, isError } = useMyHealthInfo();
  const approveMutation = useApprovePatientProfile();
  const rejectMutation = useRejectPatientProfile();

    
  if (isLoading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-center text-slate-600">
          {t("myHealthInfo.loading")}
        </p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          <p className="font-medium">{t("myHealthInfo.error.title")}</p>
          <p className="mt-1">{t("myHealthInfo.error.description")}</p>
          <div className="mt-4 flex gap-3">
            <Button variant="secondary" onClick={() => navigate(-1)}>
              {t("myHealthInfo.error.back")}
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (!data || !data.hasRecords || !data.snapshot) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-slate-900">
          {t("navbar.myHealthInfo")}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {t("myHealthInfo.empty.description")}
        </p>
        <div className="mt-6">
          <Button onClick={() => navigate("/docrecords/myhealthstate")}>
            {t("myHealthInfo.empty.backToState")}
          </Button>
        </div>
      </main>
    );
  }

  const { snapshot, pendingDecision } = data;
  const latestSource = snapshot.sources && snapshot.sources[0];
  const sourceCount = snapshot.sources ? snapshot.sources.length : 0;
  const diseasesConflict = snapshot.diseasesConflict;
  const allergiesConflict = snapshot.allergiesConflict;
  const medicationsConflict = snapshot.medicationsConflict;
  const diseasesChanged = snapshot.diseasesChanged === true;
  const allergiesChanged = snapshot.allergiesChanged === true;
  const medicationsChanged = snapshot.medicationsChanged === true;

  const heightConflict = snapshot.heightConflict;
  const weightConflict = snapshot.weightConflict;

  const heightWrapper = snapshot.heightWrapper;
  const weightWrapper = snapshot.weightWrapper;
  const bmiWrapper = snapshot.bmiWrapper;

  const latestDiseases = Array.isArray(snapshot.diseases)
    ? snapshot.diseases
    : [];
  const latestAllergies = Array.isArray(snapshot.allergies)
    ? snapshot.allergies
    : [];
  const latestMedications = Array.isArray(snapshot.medications)
    ? snapshot.medications
    : [];

  const combinedDiseases = Array.isArray(snapshot.diseasesCombined)
    ? snapshot.diseasesCombined
    : latestDiseases;
  const combinedAllergies = Array.isArray(snapshot.allergiesCombined)
    ? snapshot.allergiesCombined
    : latestAllergies;
  const combinedMedications = Array.isArray(snapshot.medicationsCombined)
    ? snapshot.medicationsCombined
    : latestMedications;

  const extraDiseases = combinedDiseases.filter(
    (d) => !latestDiseases.includes(d)
  );
  const extraAllergies = combinedAllergies.filter(
    (a) => !latestAllergies.includes(a)
  );
  const extraMedications = combinedMedications.filter(
    (m) => !latestMedications.includes(m)
  );

  const commonDiseases = Array.isArray(snapshot.commonDiseases)
    ? snapshot.commonDiseases
    : latestDiseases;
  const commonAllergies = Array.isArray(snapshot.commonAllergies)
    ? snapshot.commonAllergies
    : latestAllergies;
  const commonMedications = Array.isArray(snapshot.commonMedications)
    ? snapshot.commonMedications
    : latestMedications;

  const addedDiseases = latestDiseases.filter(
    (d) => !commonDiseases.includes(d)
  );
  const addedAllergies = latestAllergies.filter(
    (a) => !commonAllergies.includes(a)
  );
  const addedMedications = latestMedications.filter(
    (m) => !commonMedications.includes(m)
  );

  
  const ageVal = scalarValue(snapshot.age);
  const genderRaw = scalarValue(snapshot.gender);
  const genderLower =
    typeof genderRaw === "string" ? genderRaw.toLowerCase() : genderRaw;
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

  const bloodtypeVal = scalarValue(snapshot.bloodtype);
  const countryRaw = scalarValue(snapshot.country);
  const stateRaw = scalarValue(snapshot.state);
  const cityRaw = scalarValue(snapshot.city);
  const countryVal = localizeCountryName(countryRaw, i18n.language);
const stateVal = localizeStateName({
  countryName: countryRaw,
  stateName: stateRaw,
  t,
});
const cityVal = localizeCityName({
  countryName: countryRaw,
  stateName: stateRaw,
  cityName: cityRaw,
  t,
});


  // --- location prev values from alternatives (country/state/city) ---
const getAlts = (w) =>
  w && typeof w === "object" && Array.isArray(w.alternatives) ? w.alternatives : [];

const countryAlts = getAlts(snapshot.country);
const stateAlts   = getAlts(snapshot.state);
const cityAlts    = getAlts(snapshot.city);

const maxLoc = Math.max(countryAlts.length, stateAlts.length, cityAlts.length);

const prevLocations =
  maxLoc > 1
    ? Array.from({ length: maxLoc - 1 }, (_, k) => {
        const i = k + 1;
        return {
          country: countryAlts[i] ?? countryAlts[0] ?? countryRaw,
          state:   stateAlts[i]   ?? stateAlts[0]   ?? stateRaw,
          city:    cityAlts[i]    ?? cityAlts[0]    ?? cityRaw,
        };
      })
    : [];

  const phoneVal = scalarValue(snapshot.phone); 
  const fullnameWrapper = snapshot.fullnameWrapper;
  const statusWrapper = snapshot.status;
  

  const organDonorLabel = yesNoFromScalar(snapshot.organDonor, t);
  const bloodDonorLabel = yesNoFromScalar(snapshot.bloodDonor, t);

  const isDeceased = snapshot.isDeceased === true;
  const causeOfDeath = snapshot.causeOfDeath?.trim?.() || null;

  const useMetric = snapshot.measurementSystem === "metric";

  const bmiCategoryLabel = () => {
    const cat = snapshot.bmiCategory;
    if (!cat) return "";
    const key = String(cat).toLowerCase();
    switch (key) {
      case "underweight":
        return t("patients.detail.bmiCategories.underweight");
      case "normal":
        return t("patients.detail.bmiCategories.normal");
      case "overweight":
        return t("patients.detail.bmiCategories.overweight");
      default:
        return cat;
    }
  };

  const heightDisplay =
    typeof snapshot.heightM === "number"
      ? useMetric
        ? `${snapshot.heightM.toFixed(2)} m`
        : `${(snapshot.heightM / 0.3048).toFixed(2)} ft`
      : t("myHealthInfo.common.notSpecified");

  const weightDisplay =
    typeof snapshot.weightKg === "number"
      ? useMetric
        ? `${snapshot.weightKg.toFixed(1)} kg`
        : `${(snapshot.weightKg / 0.45359237).toFixed(1)} lb`
      : t("myHealthInfo.common.notSpecified");

  const bmiDisplay =
    typeof snapshot.bmi === "number"
      ? `${snapshot.bmi.toFixed(1)}${
          snapshot.bmiCategory ? ` (${bmiCategoryLabel()})` : ""
        }`
      : t("myHealthInfo.common.notCalculated");

  const approving = approveMutation.isPending;
  const rejecting = rejectMutation.isPending;

  const handleApprove = () => {
    if (!latestSource) return;
    approveMutation.mutate(latestSource.id);
  };

  const handleReject = () => {
    if (!latestSource) return;
    rejectMutation.mutate(latestSource.id);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {t("navbar.myHealthInfo")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t("myHealthInfo.header.description")}
          </p>
          {pendingDecision === false && latestSource && (
            <p className="mt-1 text-xs text-emerald-700">
              {t("myHealthInfo.header.allUpToDate")}
            </p>
          )}
          {latestSource && (
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <Info className="h-3 w-3" />
              {t("myHealthInfo.header.lastUpdate")}{" "}
              <span className="font-medium">
                {formatDateTime(
                  latestSource.updatedAt,
                  t,
                  i18n.language || undefined
                )}
              </span>
            </p>
            
          )}
          {pendingDecision && (
                <>
                  {/* Separador visual */}
                  <div className="hidden h-3 w-px bg-slate-300 sm:block"></div>

                  {latestSource.doctorName && (
                    <div className="flex items-center gap-1.5">
                      <User2 className="h-3.5 w-3.5 text-slate-400" />
                      <span>
                         {t("myHealthInfo.header.doctor")}:{" "}
                        <span className="font-medium text-slate-900">
                          {latestSource.doctorName}
                        </span>
                      </span>
                    </div>
                  )}

                  {latestSource.doctorEmail && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      <span>
                        {t("myHealthInfo.header.email")}:{" "}
                        <span className="font-medium text-slate-900">
                          {latestSource.doctorEmail}
                        </span>
                      </span>
                    </div>
                  )}
                 </>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => navigate("/docrecords/myhealthstate")}
          >
            {t("myHealthInfo.header.backToState")}
          </Button>
        </div>
      </div>

      {sourceCount > 1 && pendingDecision && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-[2px] h-4 w-4" />
            <div>
              <p className="font-medium">
                {t("myHealthInfo.multiDoctor.title")}
              </p>
              <p className="mt-1">{t("myHealthInfo.multiDoctor.body")}</p>
            </div>
          </div>
        </div>
      )}

      <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Basic info */}
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <User2 className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-900">
                {t("myHealthInfo.sections.basic.title")}
              </h2>
            </div>
            <p className="text-sm text-slate-600">
              {t("myHealthInfo.sections.basic.description")}
            </p>
          </div>
          <div className="flex-[2] space-y-4 text-sm text-slate-800">
            {/* Full name */}
            <div>
              <p className="font-medium">
                {t("myHealthInfo.sections.basic.fullname")}
              </p>
              <p>{snapshot.fullname || t("myHealthInfo.common.notSpecified")}</p>
              <ScalarHistory
                label={t("myHealthInfo.sections.basic.fullname")}
                wrapper={fullnameWrapper}
                t={t}
              />
              <ConflictNote
                fieldLabel={t("myHealthInfo.sections.basic.fullname")}
                wrapper={fullnameWrapper}
                t={t}
              />
            </div>

            {/* Age / Gender / Blood type */}
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="font-medium">
                  {t("myHealthInfo.sections.basic.age")}
                </p>
                <p>
                  {ageVal != null
                    ? t("myHealthInfo.sections.basic.ageWithYears", {
                        age: ageVal,
                      })
                    : t("myHealthInfo.common.notSpecified")}
                </p>
                <ScalarHistory
                  label={t("myHealthInfo.sections.basic.age")}
                  wrapper={snapshot.age}
                  t={t}
                />
                <ConflictNote
                  fieldLabel={t("myHealthInfo.sections.basic.age")}
                  wrapper={snapshot.age}
                  t={t}
                />
              </div>
              <div>
                <p className="font-medium">
                  {t("myHealthInfo.sections.basic.gender")}
                </p>
                <p>{genderVal || t("myHealthInfo.common.notSpecified")}</p>
                <ScalarHistory
                  label={t("myHealthInfo.sections.basic.gender")}
                  wrapper={snapshot.gender}
                  t={t}
                  formatter={formatGender}
                />
                <ConflictNote
                  fieldLabel={t("myHealthInfo.sections.basic.gender")}
                  wrapper={snapshot.gender}
                  t={t}
                />
              </div>
              <div>
                <p className="font-medium">
                  {t("myHealthInfo.sections.basic.bloodType")}
                </p>
                <p>{bloodtypeVal || t("myHealthInfo.common.notSpecified")}</p>
                <ScalarHistory
                  label={t("myHealthInfo.sections.basic.bloodType")}
                  wrapper={snapshot.bloodtype}
                  t={t}
                />
                <ConflictNote
                  fieldLabel={t("myHealthInfo.sections.basic.bloodType")}
                  wrapper={snapshot.bloodtype}
                  t={t}
                />
              </div>
            </div>

            {/* Location & phone */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="font-medium">
                  {t("myHealthInfo.sections.basic.location")}
                </p>
                <p>
                  {countryVal || t("myHealthInfo.common.notSpecified")},{" "}
                  {stateVal || t("myHealthInfo.common.notSpecified")},{" "}
                  {cityVal || t("myHealthInfo.common.notSpecified")}
                </p>

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


                <ConflictNote
                  fieldLabel={t("myHealthInfo.sections.basic.location")}
                  wrapper={snapshot.country}
                  t={t}
                />
              </div>

              <div>
                <p className="font-medium">
                  {t("myHealthInfo.sections.basic.phone")}
                </p>
                <p>{phoneVal || t("myHealthInfo.common.notSpecified")}</p>
                <ScalarHistory
                  label={t("myHealthInfo.sections.basic.phone")}
                  wrapper={snapshot.phone}
                  t={t}
                />
                <ConflictNote
                  fieldLabel={t("myHealthInfo.sections.basic.phone")}
                  wrapper={snapshot.phone}
                  t={t}
                />
              </div>
            </div>

            {/* Organ / Blood donor */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="font-medium">
                  {t("myHealthInfo.sections.basic.organDonor")}
                </p>
                <p>{organDonorLabel}</p>
                <ScalarHistory
                  label={t("myHealthInfo.sections.basic.organDonor")}
                  wrapper={snapshot.organDonor}
                  t={t}
                  formatter={(v) =>
                    v === true
                      ? t("myHealthInfo.common.yes")
                      : v === false
                      ? t("myHealthInfo.common.no")
                      : t("myHealthInfo.common.notSpecified")
                  }
                />
                <ConflictNote
                  fieldLabel={t("myHealthInfo.sections.basic.organDonor")}
                  wrapper={snapshot.organDonor}
                  t={t}
                />
              </div>

              <div>
                <p className="font-medium">
                  {t("myHealthInfo.sections.basic.bloodDonor")}
                </p>
                <p>{bloodDonorLabel}</p>
                <ScalarHistory
                  label={t("myHealthInfo.sections.basic.bloodDonor")}
                  wrapper={snapshot.bloodDonor}
                  t={t}
                  formatter={(v) =>
                    v === true
                      ? t("myHealthInfo.common.yes")
                      : v === false
                      ? t("myHealthInfo.common.no")
                      : t("myHealthInfo.common.notSpecified")
                  }
                />
                <ConflictNote
                  fieldLabel={t("myHealthInfo.sections.basic.bloodDonor")}
                  wrapper={snapshot.bloodDonor}
                  t={t}
                />
              </div>
            </div>

            {/* Status & cause of death */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="font-medium">
                  {t("myHealthInfo.sections.basic.status")}
                </p>
                <p>
                  {isDeceased
                    ? t("myHealthInfo.common.deceased")
                    : t("myHealthInfo.common.alive")}
                </p>
                <ScalarHistory
                  label={t("myHealthInfo.sections.basic.status")}
                  wrapper={statusWrapper}
                  t={t}
                  formatter={(v) =>
                    v
                      ? t("myHealthInfo.common.deceased")
                      : t("myHealthInfo.common.alive")
                  }
                />
                <ConflictNote
                  fieldLabel={t("myHealthInfo.sections.basic.status")}
                  wrapper={statusWrapper}
                  t={t}
                />
              </div>

              {isDeceased && (
                <div>
                  <p className="font-medium">
                    {t("myHealthInfo.sections.basic.causeOfDeath")}
                  </p>
                  <p>
                    {causeOfDeath || t("myHealthInfo.common.notSpecified")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Anthropometrics */}
        <div className="flex flex-col gap-6 border-t border-slate-100 pt-6 md:flex-row md:items-start">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-600" />
              <h2 className="text-lg font-semibold text-slate-900">
                {t("myHealthInfo.sections.anthropometrics.title")}
              </h2>
            </div>
            <p className="text-sm text-slate-600">
              {t("myHealthInfo.sections.anthropometrics.description")}
            </p>
          </div>
          <div className="flex-[2] space-y-4 text-sm text-slate-800">
            <div className="grid gap-4 md:grid-cols-3">
              {/* Height */}
              <div>
                <p className="font-medium">
                  {t("myHealthInfo.sections.anthropometrics.height")}
                </p>
                <p>{heightDisplay}</p>
                <ScalarHistory
                label={t("myHealthInfo.sections.anthropometrics.height")}
                wrapper={heightWrapper}
                t={t}
                useMetric={useMetric}
                isHeight={true} // <--- Añadir esto
                formatter={(v) => {
                if (typeof v !== "number") return t("myHealthInfo.common.notSpecified");
                return useMetric
              ? `${v.toFixed(2)} m`
              : `${(v / 0.3048).toFixed(2)} ft`;
               }}
            />
                <ConflictNote
                  fieldLabel={t("myHealthInfo.sections.anthropometrics.height")}
                  wrapper={heightWrapper || heightConflict}
                  t={t}
                />
              </div>

              {/* Weight */}
              <div>
                <p className="font-medium">
                  {t("myHealthInfo.sections.anthropometrics.weight")}
                </p>
                <p>{weightDisplay}</p>
                <ScalarHistory
                  label={t("myHealthInfo.sections.anthropometrics.weight")}
                  wrapper={weightWrapper}
                  t={t}
                  useMetric={useMetric}
                  isWeight={true} // <--- Añadir esto
                  formatter={(v) => {
                  if (typeof v !== "number") return t("myHealthInfo.common.notSpecified");
                return useMetric
                ? `${v.toFixed(1)} kg`
                : `${(v / 0.45359237).toFixed(1)} lb`;
              }}
          />
                <ConflictNote
                  fieldLabel={t("myHealthInfo.sections.anthropometrics.weight")}
                  wrapper={weightWrapper || weightConflict}
                  t={t}
                />
              </div>

              {/* BMI */}
              <div>
                <p className="font-medium">
                  {t("myHealthInfo.sections.anthropometrics.bmi")}
                </p>
                <p>{bmiDisplay}</p>
                <ScalarHistory
                  label={t("myHealthInfo.sections.anthropometrics.bmi")}
                  wrapper={bmiWrapper}
                  t={t}
                  formatter={(v) => {
                    if (typeof v !== "number")
                      return t("myHealthInfo.common.notCalculated");
                    return v.toFixed(1);
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Diseases / allergies */}
        <div className="flex flex-col gap-6 border-t border-slate-100 pt-6 md:flex-row md:items-start">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Droplets className="h-5 w-5 text-red-500" />
              <h2 className="text-lg font-semibold text-slate-900">
                {t("myHealthInfo.sections.conditions.title")}
              </h2>
            </div>
            <p className="text-sm text-slate-600">
              {t("myHealthInfo.sections.conditions.description")}
            </p>
          </div>
          <div className="flex-[2] space-y-4 text-sm text-slate-800">
            <div>
              <p className="mb-1 font-medium">
                {t("myHealthInfo.sections.conditions.diseases")}
              </p>
              <ChipList items={latestDiseases} t={t} />

    {(diseasesConflict || diseasesChanged) && (
  <>
    {(addedDiseases.length > 0 || extraDiseases.length > 0) && (
      <div className="mt-2">
        <p className="text-xs text-slate-600">
          {diseasesConflict
            ? t("myHealthInfo.conflicts.previouslyAllAgreed")
            : t("myHealthInfo.changes.previouslyApproved")}
        </p>
        <ChipList items={commonDiseases} t={t} />
      </div>
    )}

    {addedDiseases.length > 0 && (
      <div className="mt-2">
        <p className="text-xs text-slate-600">
          {t("myHealthInfo.conflicts.newInLatest")}
        </p>
        <ChipList items={addedDiseases} t={t} />
      </div>
    )}

    {extraDiseases.length > 0 && (
      <div className="mt-2">
        <p className="text-xs text-slate-600">
          {diseasesConflict
            ? t("myHealthInfo.conflicts.othersStillPresentDiseases")
            : t("myHealthInfo.changes.removedComparedToApproved")}
        </p>
        <ChipList items={extraDiseases} t={t} />
      </div>
    )}

    {/* warning SOLO si es multi-doctor */}
    {diseasesConflict && (
      <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
        <AlertTriangle className="h-3 w-3" />
        {t("myHealthInfo.conflicts.diseasesWarning")}
      </p>
    )}
  </>
)}

            </div>

            <div>
              <p className="mb-1 font-medium">
                {t("myHealthInfo.sections.conditions.allergies")}
              </p>
              <ChipList items={latestAllergies} t={t} />

            {(allergiesConflict || allergiesChanged) && (
  <>
    {(addedAllergies.length > 0 || extraAllergies.length > 0) && (
      <div className="mt-2">
        <p className="text-xs text-slate-600">
          {allergiesConflict
            ? t("myHealthInfo.conflicts.previouslyAllAgreed")
            : t("myHealthInfo.changes.previouslyApproved")}
        </p>
        <ChipList items={commonAllergies} t={t} />
      </div>
    )}

    {addedAllergies.length > 0 && (
      <div className="mt-2">
        <p className="text-xs text-slate-600">
          {t("myHealthInfo.conflicts.newInLatest")}
        </p>
        <ChipList items={addedAllergies} t={t} />
      </div>
    )}

    {extraAllergies.length > 0 && (
      <div className="mt-2">
        <p className="text-xs text-slate-600">
          {allergiesConflict
            ? t("myHealthInfo.conflicts.othersStillPresentAllergies")
            : t("myHealthInfo.changes.removedComparedToApproved")}
        </p>
        <ChipList items={extraAllergies} t={t} />
      </div>
    )}

    {/* warning SOLO si es multi-doctor */}
    {allergiesConflict && (
      <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
        <AlertTriangle className="h-3 w-3" />
        {t("myHealthInfo.conflicts.allergiesWarning")}
      </p>
    )}
  </>
)}
            </div>
          </div>
        </div>

        {/* Medications */}
        <div className="flex flex-col gap-6 border-t border-slate-100 pt-6 md:flex-row md:items-start">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Pill className="h-5 w-5 text-purple-600" />
              <h2 className="text-lg font-semibold text-slate-900">
                {t("myHealthInfo.sections.medications.title")}
              </h2>
            </div>
            <p className="text-sm text-slate-600">
              {t("myHealthInfo.sections.medications.description")}
            </p>
          </div>
          <div className="flex-[2] space-y-4 text-sm text-slate-800">
            <div>
              <p className="mb-1 font-medium">
                {t("myHealthInfo.sections.medications.medications")}
              </p>
              <ChipList items={latestMedications} t={t} />

              {(medicationsConflict || medicationsChanged) && (
  <>
    {(addedMedications.length > 0 || extraMedications.length > 0) && (
      <div className="mt-2">
        <p className="text-xs text-slate-600">
          {medicationsConflict
            ? t("myHealthInfo.conflicts.previouslyAllAgreed")
            : t("myHealthInfo.changes.previouslyApproved")}
        </p>
        <ChipList items={commonMedications} t={t} />
      </div>
    )}

    {addedMedications.length > 0 && (
      <div className="mt-2">
        <p className="text-xs text-slate-600">
          {t("myHealthInfo.conflicts.newInLatest")}
        </p>
        <ChipList items={addedMedications} t={t} />
      </div>
    )}

    {extraMedications.length > 0 && (
      <div className="mt-2">
        <p className="text-xs text-slate-600">
          {medicationsConflict
            ? t("myHealthInfo.conflicts.othersStillPresentMedications")
            : t("myHealthInfo.changes.removedComparedToApproved")}
        </p>
        <ChipList items={extraMedications} t={t} />
      </div>
    )}

    {/* warning SOLO si es multi-doctor */}
    {medicationsConflict && (
      <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
        <AlertTriangle className="h-3 w-3" />
        {t("myHealthInfo.conflicts.medicationsWarning")}
      </p>
    )}
  </>
)}

            </div>
          </div>
        </div>
      </section>

      {/* Approve / reject actions */}
      {latestSource && pendingDecision && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-700">
            {t("myHealthInfo.actions.approveIntro")}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              onClick={handleApprove}
              disabled={approving || rejecting}
            >
              {approving
                ? t("myHealthInfo.actions.approving")
                : t("myHealthInfo.actions.approve")}
            </Button>
            <Button
              variant="secondary"
              onClick={handleReject}
              disabled={approving || rejecting}
            >
              {rejecting
                ? t("myHealthInfo.actions.rejecting")
                : t("myHealthInfo.actions.reject")}
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
