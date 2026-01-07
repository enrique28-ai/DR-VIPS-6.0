import { useNavigate } from "react-router-dom";
import {
  User2,
  Pill,
  Activity,
  Droplets,
  Info,
  Mail, // <--- Importa esto de lucide-react si quieres el icono
  Stethoscope,
  History,
  X
} from "lucide-react";
import Button from "../../components/forms/Button.jsx";
import {
  useMyHealthInfo,
  useApprovePatientProfile,
  useRejectPatientProfile,
  useMyHistory,
} from "../../features/patients/phooks.js";
import { useTranslation } from "react-i18next";
import { useMemo,  useState } from "react";
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

    // ✅ NUMÉRICOS (height/weight) y números reales
    if (isHeight || isWeight || typeof x === "number") {
      const n = toNum(x);
      if (n == null) return null;
      return (isHeight || isWeight) ? toDisplay(n).toFixed(decimals) : String(n);
    }

    // ✅ BOOLEANOS
    if (typeof x === "boolean") {
      return x ? "true" : "false";
    }

    // ✅ STRINGS (fullname, gender, bloodtype, etc.)
    return String(x).trim().toLowerCase();
  };

  const curKey = keyFor(curRaw);

  const seen = new Set();
  const prevList = [];

  for (const v of wrapper.alternatives.slice(1)) {
    const k = keyFor(v);
    if (k == null) continue;

    if (curKey != null && k === curKey) continue; // si es el mismo visualmente
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
const trOr = (t, key, fallback) => {
  const v = t(key);
  return v && v !== key ? v : fallback;
};

function SnapshotViewer({ snapshot, t, i18n }) {
  if (!snapshot) return null;

  const sys = (snapshot?.measurementSystem || "metric").toLowerCase();
  const isImp = sys === "imperial";

  const height =
    typeof snapshot.heightM === "number"
      ? (isImp ? (snapshot.heightM / 0.3048).toFixed(2) + " ft" : snapshot.heightM.toFixed(2) + " m")
      : "—";

  const weight =
    typeof snapshot.weightKg === "number"
      ? (isImp ? (snapshot.weightKg * 2.2046226218).toFixed(2) + " lb" : snapshot.weightKg.toFixed(2) + " kg")
      : "—";

  const country = localizeCountryName(snapshot.country, i18n.language);
  const st = localizeStateName({ countryName: snapshot.country, stateName: snapshot.state, t });
  const ct = localizeCityName({ countryName: snapshot.country, stateName: snapshot.state, cityName: snapshot.city, t });
  const location = [country, st, ct].filter(Boolean).join(", ");

  const gender =
    snapshot.gender === "male"
      ? t("patients.card.genderMale")
      : snapshot.gender === "female"
      ? t("patients.card.genderFemale")
      : snapshot.gender || "—";

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 text-sm text-gray-700">
      <div className="col-span-full font-semibold text-gray-900 border-b pb-2 mb-1">
        {snapshot.fullname || "—"}
      </div>

      <div><span className="font-medium text-gray-500">Age:</span> {snapshot.age ?? "—"}</div>
      <div><span className="font-medium text-gray-500">Gender:</span> {gender}</div>
      <div><span className="font-medium text-gray-500">Blood:</span> {snapshot.bloodtype ?? "—"}</div>
      <div><span className="font-medium text-gray-500">Location:</span> {location || "—"}</div>

      <div><span className="font-medium text-gray-500">Height:</span> {height}</div>
      <div><span className="font-medium text-gray-500">Weight:</span> {weight}</div>

      <div className="col-span-full">
        <span className="font-medium text-gray-500">Deceased:</span>{" "}
        {snapshot.isDeceased === true ? "Yes" : snapshot.isDeceased === false ? "No" : "—"}
        {snapshot.isDeceased === true && snapshot.causeOfDeath ? ` · ${snapshot.causeOfDeath}` : ""}
      </div>

      <div className="col-span-full">
        <span className="font-medium text-gray-500">Diseases:</span>{" "}
        {Array.isArray(snapshot.diseases) && snapshot.diseases.length ? snapshot.diseases.join(", ") : "None"}
      </div>
      <div className="col-span-full">
        <span className="font-medium text-gray-500">Allergies:</span>{" "}
        {Array.isArray(snapshot.allergies) && snapshot.allergies.length ? snapshot.allergies.join(", ") : "None"}
      </div>
      <div className="col-span-full">
        <span className="font-medium text-gray-500">Medications:</span>{" "}
        {Array.isArray(snapshot.medications) && snapshot.medications.length ? snapshot.medications.join(", ") : "None"}
      </div>
    </div>
  );
}


function MyHistoryModal({ onClose, t, i18n }) {
  const { data: history, isLoading } = useMyHistory();
  const [expandedId, setExpandedId] = useState(null);

  const toggle = (id) => setExpandedId((cur) => (cur === id ? null : id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <History className="h-5 w-5" />
            {trOr(t, "myHealthInfo.history.title", "My Approved History")}
          </h2>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <p className="text-center text-gray-500 py-4">
              {trOr(t, "myHealthInfo.loading", "Loading...")}
            </p>
          )}

          {!isLoading && (!history || history.length === 0) && (
            <p className="text-center text-gray-500 py-4">
              {trOr(t, "myHealthInfo.history.empty", "No history available yet.")}
            </p>
          )}

          <div className="space-y-3">
            {history?.map((ver) => {
              const approvedAt = ver?.approvedAt ? new Date(ver.approvedAt) : null;
              const when = approvedAt ? approvedAt.toLocaleString(i18n.language || undefined) : "—";
              const editedBy = ver?.editedBy?.name || "System/Unknown";

              // ✅ IMPORTANTE: backend devuelve approvedSnapshot, no snapshot
              const snap = ver?.approvedSnapshot?.set || null;

              return (
                <div key={ver._id} className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                  <button
                    onClick={() => toggle(ver._id)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-100"
                  >
                    <div>
                      <p className="font-medium text-gray-800">{when}</p>
                      <p className="text-xs text-gray-500">
                        {trOr(t, "myHealthInfo.history.proposedBy", "Proposed by")}: {editedBy}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      {expandedId === ver._id ? trOr(t, "common.close", "Close") : trOr(t, "common.view", "View")}
                    </span>
                  </button>

                  {expandedId === ver._id && (
                    <div className="border-t border-gray-200 bg-white p-4">
                      <SnapshotViewer snapshot={snap} t={t} i18n={i18n} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-gray-100 p-3 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            {trOr(t, "common.close", "Close")}
          </Button>
        </div>
      </div>
    </div>
  );
}


export default function MyHealthInfo() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [showHistory, setShowHistory] = useState(false);


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
  
  const diseasesChanged = snapshot.diseasesChanged === true;
  const allergiesChanged = snapshot.allergiesChanged === true;
  const medicationsChanged = snapshot.medicationsChanged === true;

  const heightWrapper = snapshot.heightWrapper;
  const weightWrapper = snapshot.weightWrapper;
  const bmiWrapper = snapshot.bmiWrapper;
  const latestSource = snapshot.sources?.[0] ?? null;

 
const latestDiseases = Array.isArray(snapshot.diseases) ? snapshot.diseases : [];
const latestAllergies = Array.isArray(snapshot.allergies) ? snapshot.allergies : [];
const latestMedications = Array.isArray(snapshot.medications) ? snapshot.medications : [];

// Baseline = versión aprobada (tu backend ya lo rellena como common* cuando hay pendingDecision)
const approvedDiseases = Array.isArray(snapshot.commonDiseases) ? snapshot.commonDiseases : [];
const approvedAllergies = Array.isArray(snapshot.commonAllergies) ? snapshot.commonAllergies : [];
const approvedMedications = Array.isArray(snapshot.commonMedications) ? snapshot.commonMedications : [];

// Diff vs aprobada
const addedDiseases = latestDiseases.filter((d) => !approvedDiseases.includes(d));
const removedDiseases = approvedDiseases.filter((d) => !latestDiseases.includes(d));

const addedAllergies = latestAllergies.filter((a) => !approvedAllergies.includes(a));
const removedAllergies = approvedAllergies.filter((a) => !latestAllergies.includes(a));

const addedMedications = latestMedications.filter((m) => !approvedMedications.includes(m));
const removedMedications = approvedMedications.filter((m) => !latestMedications.includes(m));


  
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

  //
// ... después de const useMetric = ...

  // --- Lógica para detectar cambio de unidades ---
  const measurementSystemWrapper = snapshot.measurementSystemWrapper;
  // Reutilizamos tu función getAlts existente
  const msAlts = getAlts(measurementSystemWrapper); 

  const curSystem = scalarValue(measurementSystemWrapper) ?? snapshot.measurementSystem ?? null;
  // Si hay más de 1 alternativa, la segunda (índice 1) es la anterior
  const prevSystem = msAlts.length > 1 ? msAlts[1] : null;

  const systemLabel = (sys) => {
    const k = String(sys || "").toLowerCase();
    // Puedes ajustar estos textos o usar t("key") si las agregas a tu JSON
    if (k === "metric") return t("myHealthInfo.common.metric") || "Métrico (m, kg)";
    if (k === "imperial") return t("myHealthInfo.common.imperial") || "Imperial (ft, lb)";
    return sys ? String(sys) : t("myHealthInfo.common.notSpecified");
  };

  const unitsChanged =
    prevSystem != null &&
    curSystem != null &&
    String(prevSystem) !== String(curSystem);

  const unitsChangeText = (() => {
  if (!unitsChanged) return null;

  const from = systemLabel(prevSystem);
  const to = systemLabel(curSystem);

  const translated = t("myHealthInfo.changes.unitsChanged", { from, to });
  return translated !== "myHealthInfo.changes.unitsChanged"
    ? translated
    : `Units Changed: ${from} → ${to}`;
})();


  const UnitChangeMessage = () => {
  if (!pendingDecision || !unitsChangeText) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-blue-600">
      <Info className="h-3 w-3" />
      {unitsChangeText}
    </p>
  );
};

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
        ? `${snapshot.weightKg.toFixed(2)} kg`
        : `${(snapshot.weightKg / 0.45359237).toFixed(2)} lb`
      : t("myHealthInfo.common.notSpecified");

  const bmiDisplay =
    typeof snapshot.bmi === "number"
      ? `${snapshot.bmi.toFixed(2)}${
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
           <Button variant="secondary" onClick={() => setShowHistory(true)}>
          <span className="inline-flex items-center gap-2">
          <History className="h-4 w-4" />
            {trOr(t, "myHealthInfo.history.button", "History")}
          </span>
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate("/docrecords/myhealthstate")}
          >
            {t("myHealthInfo.header.backToState")}
          </Button>
        </div>
      </div>


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

              <UnitChangeMessage />
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
                ? `${v.toFixed(2)} kg`
                : `${(v / 0.45359237).toFixed(2)} lb`;
              }}
          />
            <UnitChangeMessage />
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
                    return v.toFixed(2);
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
         <div className="flex-[2] space-y-6 text-sm text-slate-800">
  {/* Diseases */}
  <div>
    <p className="mb-1 font-medium">
      {t("myHealthInfo.sections.conditions.diseases")}
    </p>
    <ChipList items={latestDiseases} t={t} />

    {diseasesChanged && (
      <>
        <div className="mt-2">
          <p className="text-xs text-slate-600">
            {t("myHealthInfo.changes.previouslyApproved")}
          </p>
          <ChipList items={approvedDiseases} t={t} />
        </div>

        {addedDiseases.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-slate-600">
              {t("myHealthInfo.changes.addedComparedToApproved")}
            </p>
            <ChipList items={addedDiseases} t={t} />
          </div>
        )}

        {removedDiseases.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-slate-600">
              {t("myHealthInfo.changes.removedComparedToApproved")}
            </p>
            <ChipList items={removedDiseases} t={t} />
          </div>
        )}
      </>
    )}
  </div>

  {/* Allergies */}
  <div>
    <p className="mb-1 font-medium">
      {t("myHealthInfo.sections.conditions.allergies")}
    </p>
    <ChipList items={latestAllergies} t={t} />

    {allergiesChanged && (
      <>
        <div className="mt-2">
          <p className="text-xs text-slate-600">
            {t("myHealthInfo.changes.previouslyApproved")}
          </p>
          <ChipList items={approvedAllergies} t={t} />
        </div>

        {addedAllergies.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-slate-600">
              {t("myHealthInfo.changes.addedComparedToApproved")}
            </p>
            <ChipList items={addedAllergies} t={t} />
          </div>
        )}

        {removedAllergies.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-slate-600">
              {t("myHealthInfo.changes.removedComparedToApproved")}
            </p>
            <ChipList items={removedAllergies} t={t} />
          </div>
        )}
      </>
    )}
  </div>

  {/* Medications */}
  <div>
    <p className="mb-1 font-medium">
      {t("myHealthInfo.sections.conditions.medications")}
    </p>
    <ChipList items={latestMedications} t={t} />

    {medicationsChanged && (
      <>
        <div className="mt-2">
          <p className="text-xs text-slate-600">
            {t("myHealthInfo.changes.previouslyApproved")}
          </p>
          <ChipList items={approvedMedications} t={t} />
        </div>

        {addedMedications.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-slate-600">
              {t("myHealthInfo.changes.addedComparedToApproved")}
            </p>
            <ChipList items={addedMedications} t={t} />
          </div>
        )}

        {removedMedications.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-slate-600">
              {t("myHealthInfo.changes.removedComparedToApproved")}
            </p>
            <ChipList items={removedMedications} t={t} />
          </div>
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

      {showHistory && (
  <MyHistoryModal
    onClose={() => setShowHistory(false)}
    t={t}
    i18n={i18n}
  />
)}

    </main>
  );
}
