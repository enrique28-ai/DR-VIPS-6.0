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

function scalarValue(w) {
  return w && typeof w === "object" ? w.value ?? null : w ?? null;
}

function formatDateTime(dateString, locale) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(locale);
}

function FieldComparison({
  label,
  wrapper,
  t,
  i18n,
  isCountry,
  isState,
  isCity,
  isHeight,
  isWeight,
}) {
  if (!wrapper) return null;
  const { value, conflict, alternatives, changed } = wrapper;
  if (value == null && !changed && !conflict) return null;

  let displayValue = value ?? t("myHealthInfo.common.notSpecified");
  let displayAlts = Array.isArray(alternatives) ? alternatives : [];

  if (isCountry) {
    displayValue = localizeCountryName(value, i18n.language) || displayValue;
    displayAlts = displayAlts.map((c) => localizeCountryName(c, i18n.language) || c);
  } else if (isState) {
    displayValue = localizeStateName({ countryName: null, stateName: value, t }) || displayValue;
    displayAlts = displayAlts.map(
      (s) => localizeStateName({ countryName: null, stateName: s, t }) || s,
    );
  } else if (isCity) {
    displayValue = localizeCityName({ countryName: null, stateName: null, cityName: value, t }) || displayValue;
    displayAlts = displayAlts.map(
      (c) => localizeCityName({ countryName: null, stateName: null, cityName: c, t }) || c,
    );
  }

  if (isHeight && typeof value === "number") displayValue = `${value.toFixed(2)} m`;
  if (isWeight && typeof value === "number") displayValue = `${value.toFixed(2)} kg`;

  const prevValue = changed && displayAlts.length > 1 ? displayAlts[1] : null;

  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        conflict
          ? "border-amber-200 bg-amber-50"
          : changed
            ? "border-blue-200 bg-blue-50"
            : "border-slate-100 bg-white"
      }`}
    >
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {changed && !conflict ? (
        <div className="flex items-center gap-2">
          <span className="text-slate-400 line-through">
            {prevValue ?? t("myHealthInfo.common.notSpecified")}
          </span>
          <span className="text-slate-400">→</span>
          <span className="font-medium text-blue-700">{displayValue}</span>
        </div>
      ) : conflict ? (
        <div>
          <span className="font-medium text-amber-800">{displayValue}</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {displayAlts
              .filter((a) => String(a) !== String(value))
              .map((alt, i) => (
                <span
                  key={i}
                  className="rounded-md border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800"
                >
                  {isHeight && typeof alt === "number"
                    ? `${alt.toFixed(2)} m`
                    : isWeight && typeof alt === "number"
                      ? `${alt.toFixed(2)} kg`
                      : String(alt)}
                </span>
              ))}
          </div>
        </div>
      ) : (
        <span className="font-medium text-slate-800">{displayValue}</span>
      )}
    </div>
  );
}


function ChipList({ items, conflict, changed, t }) {
  if (!items || items.length === 0) {
    return <span className="text-sm italic text-slate-400">{t("myHealthInfo.common.noneRecorded")}</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it, i) => (
        <span
          key={`${it}-${i}`}
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
            conflict
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : changed
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-slate-100 text-slate-700"
          }`}
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

 const childInfo = useMemo(() => {
    const arr = Array.isArray(childrenData) ? childrenData : [];
    return arr.find((c) => c.profileId === childId || (c?.snapshot?.sources || []).some((s) => s?.id === childId));
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

  const { snapshot, pendingDecision, profileId, parentEmail } = childInfo;
  const latestSource = snapshot?.sources?.[0];
  const lastUpdated = latestSource?.updatedAt
    ? formatDateTime(latestSource.updatedAt, i18n.language)
    : t("myHealthInfo.common.unknownDate");
  const doctorName = latestSource?.doctorName || t("myHealthInfo.history.systemUnknown");

  const addedDiseases = snapshot?.diseasesCombined?.filter((x) => !snapshot.commonDiseases?.includes(x)) || [];
  const removedDiseases = snapshot?.commonDiseases?.filter((x) => !snapshot.diseases?.includes(x)) || [];
  const addedAllergies = snapshot?.allergiesCombined?.filter((x) => !snapshot.commonAllergies?.includes(x)) || [];
  const removedAllergies = snapshot?.commonAllergies?.filter((x) => !snapshot.allergies?.includes(x)) || [];
  const addedMedications = snapshot?.medicationsCombined?.filter((x) => !snapshot.commonMedications?.includes(x)) || [];
  const removedMedications = snapshot?.commonMedications?.filter((x) => !snapshot.medications?.includes(x)) || [];

  const handleApprove = () => approve.mutate(profileId);
  const handleReject = () => reject.mutate(profileId);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
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

         {pendingDecision ? (
        <div className="rounded-r-lg border-l-4 border-amber-500 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-start">
            <Info className="mt-0.5 h-5 w-5 text-amber-500" />
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-bold text-amber-800">{t("myChildren.pending")}</h3>
              <p className="mt-1 text-sm text-amber-700">{doctorName} · {lastUpdated}</p>
            </div>
          </div>
        </div>
         ) : (
        <div className="flex items-center rounded-r-lg border-l-4 border-emerald-500 bg-emerald-50 p-4 shadow-sm">
          <Info className="h-5 w-5 text-emerald-500" />
          <p className="ml-3 text-sm font-medium text-emerald-800">{t("myChildren.upToDate")}</p>
        </div>
      )}

       <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-4">
          <div className="rounded-lg bg-white p-2 text-indigo-500 shadow-sm"><User2 className="h-4 w-4" /></div>
          <h3 className="font-bold text-slate-800">{t("myHealthInfo.sections.basic.title")}</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <FieldComparison label={t("myHealthInfo.sections.basic.age")} wrapper={snapshot?.age} t={t} i18n={i18n} />
          <FieldComparison label={t("myHealthInfo.sections.basic.gender")} wrapper={snapshot?.gender} t={t} i18n={i18n} />
          <FieldComparison label={t("myHealthInfo.sections.basic.bloodType")} wrapper={snapshot?.bloodtype} t={t} i18n={i18n} />
          <FieldComparison label={t("myHealthInfo.sections.basic.location")} wrapper={snapshot?.country} isCountry t={t} i18n={i18n} />
          <FieldComparison label={t("myHealthInfo.sections.basic.location")} wrapper={snapshot?.state} isState t={t} i18n={i18n} />
          <FieldComparison label={t("myHealthInfo.sections.basic.location")} wrapper={snapshot?.city} isCity t={t} i18n={i18n} />
          <div className="rounded-lg border border-slate-100 bg-white p-3 lg:col-span-3">
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

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-4">
          <div className="rounded-lg bg-white p-2 text-rose-500 shadow-sm"><Activity className="h-4 w-4" /></div>
          <h3 className="font-bold text-slate-800">{t("myHealthInfo.sections.anthropometrics.title")}</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <FieldComparison label={t("myHealthInfo.sections.anthropometrics.height")} wrapper={snapshot?.heightWrapper} isHeight t={t} i18n={i18n} />
          <FieldComparison label={t("myHealthInfo.sections.anthropometrics.weight")} wrapper={snapshot?.weightWrapper} isWeight t={t} i18n={i18n} />
          <FieldComparison label={t("myHealthInfo.sections.anthropometrics.bmi")} wrapper={snapshot?.bmiWrapper} t={t} i18n={i18n} />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-4">
          <div className="rounded-lg bg-white p-2 text-emerald-500 shadow-sm"><Stethoscope className="h-4 w-4" /></div>
          <h3 className="font-bold text-slate-800">{t("myHealthInfo.sections.conditions.title")}</h3>
        </div>
        <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-3">
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-700"><Activity className="h-4 w-4 text-rose-400" /> {t("myHealthInfo.sections.conditions.diseases")}</h4>
            {snapshot?.diseasesConflict ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <ChipList items={snapshot.diseasesCombined} conflict t={t} />
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-600">{t("myHealthInfo.changes.previouslyApproved")}</p>
                <ChipList items={snapshot?.commonDiseases} changed={snapshot?.diseasesChanged} t={t} />
                {addedDiseases.length > 0 && <ChipList items={addedDiseases} changed t={t} />}
                {removedDiseases.length > 0 && <ChipList items={removedDiseases} t={t} />}
              </>
            )}
          </div>
           <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-700"><Droplets className="h-4 w-4 text-amber-400" /> {t("myHealthInfo.sections.conditions.allergies")}</h4>
            {snapshot?.allergiesConflict ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <ChipList items={snapshot.allergiesCombined} conflict t={t} />
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-600">{t("myHealthInfo.changes.previouslyApproved")}</p>
                <ChipList items={snapshot?.commonAllergies} changed={snapshot?.allergiesChanged} t={t} />
                {addedAllergies.length > 0 && <ChipList items={addedAllergies} changed t={t} />}
                {removedAllergies.length > 0 && <ChipList items={removedAllergies} t={t} />}
              </>
            )}
          </div>
           <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-700"><Pill className="h-4 w-4 text-blue-400" /> {t("myHealthInfo.sections.conditions.medications")}</h4>
            {snapshot?.medicationsConflict ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <ChipList items={snapshot.medicationsCombined} conflict t={t} />
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-600">{t("myHealthInfo.changes.previouslyApproved")}</p>
                <ChipList items={snapshot?.commonMedications} changed={snapshot?.medicationsChanged} t={t} />
                {addedMedications.length > 0 && <ChipList items={addedMedications} changed t={t} />}
                {removedMedications.length > 0 && <ChipList items={removedMedications} t={t} />}
              </>
            )}
          </div>
        </div>
        </section>


        
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
