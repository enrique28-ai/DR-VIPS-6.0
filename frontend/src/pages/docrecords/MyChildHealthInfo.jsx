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
  Loader2,
} from "lucide-react";
import Button from "../../components/forms/Button.jsx";

import {
  useMyChildrenHealthInfo,
  useApproveChildProfile,
  useRejectChildProfile,
} from "../../features/patients/phooks.js";

import PatientHistoryModal from "../../components/patient/PatientHistoryModal.jsx";

import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import {
  localizeCountryName,
  localizeStateName,
  localizeCityName,
} from "../../utilsfront/geoLabels.js";

// --- HELPERS LÓGICOS (Traídos de MyHealthInfo) ---
function scalarValue(w) {
  return w && typeof w === "object" ? w.value ?? null : w ?? null;
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

function formatDateOnly(iso, t, locale) {
  if (!iso) return t("myHealthInfo.common.notSpecified");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t("myHealthInfo.common.notSpecified");
  try {
    return locale ? d.toLocaleDateString(locale) : d.toLocaleDateString();
  } catch {
    return d.toLocaleDateString();
  }
}

function ScalarHistory({
  label,
  wrapper,
  formatter,
  t,
  useMetric,
  isHeight,
  isWeight,
  decimals = 2,
}) {
  if (
    !wrapper ||
    typeof wrapper !== "object" ||
    !Array.isArray(wrapper.alternatives) ||
    wrapper.alternatives.length < 2
  ) {
    return null;
  }

  const curRaw = wrapper.value ?? null;

  const toNum = (x) => {
    const n = typeof x === "number" ? x : Number(x);
    return Number.isFinite(n) ? n : null;
  };

  const toDisplay = (n) => {
    if (isHeight) return useMetric ? n : n / 0.3048;
    if (isWeight) return useMetric ? n : n / 0.45359237;
    return n;
  };

  const keyFor = (x) => {
    if (x === null || x === undefined || x === "") return null;

    if (isHeight || isWeight || typeof x === "number") {
      const n = toNum(x);
      if (n == null) return null;
      return isHeight || isWeight ? toDisplay(n).toFixed(decimals) : String(n);
    }

    if (typeof x === "boolean") {
      return x ? "true" : "false";
    }

    return String(x).trim().toLowerCase();
  };

  const curKey = keyFor(curRaw);

  const seen = new Set();
  const prevList = [];

  for (const v of wrapper.alternatives.slice(1)) {
    const k = keyFor(v);
    if (k == null) continue;

    if (curKey != null && k === curKey) continue;
    if (seen.has(k)) continue;

    seen.add(k);
    prevList.push(v);
  }

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

function ChipList({ items, t, tone = "default" }) {
  if (!items || items.length === 0) {
    return (
      <p className="text-sm text-slate-500">{t("myHealthInfo.common.noneRecorded")}</p>
    );
  }
 const chipTone = {
    default: "border-slate-200 bg-slate-100 text-slate-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
  };
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <span
          key={it}
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${chipTone[tone]}`}
        >
          {it}
        </span>
      ))}
    </div>
  );
}

export default function MyChildHealthInfo() {
  const { childId } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const { data: childrenData, isLoading } = useMyChildrenHealthInfo(i18n.language);
  const approve = useApproveChildProfile();
  const reject = useRejectChildProfile();

  const [openHistory, setOpenHistory] = useState(false);

  // Encontrar la información del niño seleccionado
  const childInfo = useMemo(() => {
    const arr = Array.isArray(childrenData) ? childrenData : [];
    return arr.find(
      (c) => c.profileId === childId || (c?.snapshot?.sources || []).some((s) => s?.id === childId),
    );
  }, [childrenData, childId]);

  if (isLoading) {
    return (
      <div className="flex justify-center p-10 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!childInfo || !childInfo.hasRecords) {
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
  const { snapshot, pendingDecision, profileId, parentEmail } = childInfo;
  const latestSource = snapshot?.sources?.[0];
  const lastUpdated = formatDateTime(latestSource?.updatedAt, t, i18n.language);
  const doctorName = latestSource?.doctorName || t("myHealthInfo.history.systemUnknown");

  const useMetric = snapshot?.measurementSystem === "metric";

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
  const isDeceased = snapshot?.isDeceased === true;
  const birthDateVal = formatDateOnly(snapshot?.birthDate, t, i18n.language);
  const deathDateVal = formatDateOnly(snapshot?.dateOfDeath, t, i18n.language);
  const causeOfDeathVal = snapshot?.causeOfDeath || t("myHealthInfo.common.notSpecified");
  const countryRaw = scalarValue(snapshot?.country);
  const stateRaw = scalarValue(snapshot?.state);
  const cityRaw = scalarValue(snapshot?.city);

  const locationVal = [
    localizeCountryName(countryRaw, i18n.language) || countryRaw,
    localizeStateName({ countryName: countryRaw, stateName: stateRaw, t }) || stateRaw,
    localizeCityName({ countryName: countryRaw, stateName: stateRaw, cityName: cityRaw, t }) || cityRaw,
  ]
    .filter(Boolean)
    .join(", ");

    const getAlts = (w) =>
    w && typeof w === "object" && Array.isArray(w.alternatives) ? w.alternatives : [];

  const countryAlts = getAlts(snapshot?.country);
  const stateAlts = getAlts(snapshot?.state);
  const cityAlts = getAlts(snapshot?.city);

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
  const heightDisplay =
    typeof snapshot?.heightM === "number"
      ? useMetric
        ? `${snapshot.heightM.toFixed(2)} m`
        : `${(snapshot.heightM / 0.3048).toFixed(2)} ft`
      : t("myHealthInfo.common.notSpecified");

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

  const handleApprove = () => approve.mutate(profileId);
  const handleReject = () => reject.mutate(profileId);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* --- CABECERA --- */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {scalarValue(snapshot?.fullnameWrapper) || t("myChildren.unknownChild")}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <User2 className="h-4 w-4" /> {t("myChildren.healthInfo")}
          </p>
        </div>

        <Button variant="secondary" onClick={() => setOpenHistory(true)} className="w-full sm:w-auto">
          <History className="mr-2 h-4 w-4" />
          {t("myHealthInfo.history.button")}
        </Button>
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
                return useMetric ? `${v.toFixed(2)} m` : `${(v / 0.3048).toFixed(2)} ft`;
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
                {addedDiseases.length > 0 && <ChipList items={addedDiseases} t={t} tone="success" />}
                {removedDiseases.length > 0 && <ChipList items={removedDiseases} t={t} tone="danger" />}
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
                {addedAllergies.length > 0 && <ChipList items={addedAllergies} t={t} tone="success" />}
                {removedAllergies.length > 0 && <ChipList items={removedAllergies} t={t} tone="danger" />}
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
               {addedMedications.length > 0 && <ChipList items={addedMedications} t={t} tone="success" />}
                {removedMedications.length > 0 && <ChipList items={removedMedications} t={t} tone="danger" />}
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