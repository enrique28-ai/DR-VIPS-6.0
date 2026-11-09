import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { History, X, Languages, Loader2 } from "lucide-react";
import Button from "../forms/Button.jsx";
import { usePatientHistory, useMyHistory, useTranslatePatientHistorySnapshot, useChildHistory } from "../../features/patients/phooks.js";
import { localizeCountryName, localizeStateName, localizeCityName } from "../../utilsfront/geoLabels.js";
import { bmiBackendToKey, formatHeightForSystem } from "../../utilsfront/measurements.js";
import { useAuthStore } from "../../stores/authStore.js";

const trOr = (t, key, fallback) => {
  const v = t(key);
  return v && v !== key ? v : fallback;
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

const historySnapshot = (entry) => entry?.proposedSnapshot ?? entry?.approvedSnapshot ?? entry?.snapshot;

const attributionKeys = {
  deathStatus: "patients.history.recordedBy",
  deathRecorded: "patients.history.recordedBy",
  deathCorrected: "patients.history.recordedBy",
  unresolvedAtDeath: "myHealthInfo.history.proposedBy",
  rejected: "myHealthInfo.history.proposedBy",
};

function HistoryField({ label, value, wide = false }) {
  return (
    <div className={wide ? "col-span-full" : undefined}>
      <span className="font-medium text-slate-500">{label}:</span>{" "}{value}
    </div>
  );
}

function SnapshotViewer({ version, t, i18n, right }) {
  const snapshot = version?.set ?? version;
  if (!snapshot) return null;

  const missing = (field) => version?.unset?.[field]
    ? t("patients.history.cleared")
    : t("patients.history.notRecorded");
  const value = (field) => snapshot[field] ?? missing(field);
  const yesNo = (field) => typeof snapshot[field] === "boolean"
    ? t(snapshot[field] ? "patients.create.yes" : "patients.create.no")
    : missing(field);
  const date = (field) => {
    const parsed = snapshot[field] ? new Date(snapshot[field]) : null;
    return parsed && !Number.isNaN(parsed.getTime())
      ? parsed.toLocaleDateString(i18n.language, { timeZone: "UTC" })
      : missing(field);
  };
  const list = (field, items = snapshot[field]) => Array.isArray(items)
    ? items.length ? items.join(", ") : trOr(t, "patients.history.none", "None")
    : missing(field);
  const sys = snapshot.measurementSystem;
  const isImp = sys === "imperial";

  const heightText = formatHeightForSystem({
    measurementSystem: sys,
    heightM: snapshot.heightM,
    heightFeet: snapshot.heightFeet,
    heightInches: snapshot.heightInches,
    heightDisplay: snapshot.heightDisplay,
    notSpecified: missing("heightM"),
  });

  const weight =
    typeof snapshot.weightKg === "number"
      ? isImp
        ? `${(snapshot.weightKg * 2.2046226218).toFixed(2)} lb`
        : `${snapshot.weightKg.toFixed(2)} kg`
      : missing("weightKg");

  const country = localizeCountryName(snapshot.country, i18n.language);
  const st = localizeStateName({ countryName: snapshot.country, stateName: snapshot.state, t });
  const ct = localizeCityName({ countryName: snapshot.country, stateName: snapshot.state, cityName: snapshot.city, t });
  const location = [country, st, ct].filter(Boolean).join(", ");
  const birthCountry = localizeCountryName(snapshot.birthCountry, i18n.language);
  const birthSt = localizeStateName({ countryName: snapshot.birthCountry, stateName: snapshot.birthState, t });
  const birthCt = localizeCityName({ countryName: snapshot.birthCountry, stateName: snapshot.birthState, cityName: snapshot.birthCity, t });
  const birthplace = [birthCountry, birthSt, birthCt].filter(Boolean).join(", ");

  const gender =
    snapshot.gender === "male"
      ? t("patients.card.genderMale")
      : snapshot.gender === "female"
      ? t("patients.card.genderFemale")
      : value("gender");
  const children = Array.isArray(snapshot.children)
    ? snapshot.children.map((child) => typeof child === "string" ? child : child?.name).filter(Boolean)
    : undefined;
  const bmiKey = bmiBackendToKey(snapshot.bmiCategory);
  const bmiCategory = bmiKey ? t(`patients.detail.bmiCategories.${bmiKey}`) : null;

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 text-sm text-slate-700">
      <div className="col-span-full flex items-start justify-between border-b border-slate-100 pb-2 mb-1">
      <div className="font-semibold text-slate-900">{snapshot.fullname || "—"}</div>
        {right}
      </div>


      <HistoryField label={t("patients.card.age")} value={value("age")} />
      <HistoryField label={t("patients.list.filters.ageCategory")} value={value("ageCategory")} />
      <HistoryField label={t("patients.create.birthDate")} value={date("birthDate")} />
      <HistoryField label={t("patients.card.gender")} value={gender} />
      <HistoryField label={t("patients.card.blood")} value={value("bloodtype")} />
      <HistoryField label={t("myHealthInfo.sections.basic.phone")} value={value("phone")} />
      <HistoryField label={t("patients.create.placeOfResidence")} value={location || missing("country")} />
      <HistoryField label={t("patients.create.placeOfBirth")} value={birthplace || trOr(t, "patients.detail.notSpecified", "Not specified")} />
      <HistoryField label={t("patients.create.measurementSystem")} value={sys ? t(`myHealthInfo.common.${sys}`) : missing("measurementSystem")} />
      <HistoryField label={t("patients.detail.height")} value={heightText} />
      <HistoryField label={t("patients.detail.weight")} value={weight} />
      <HistoryField label={t("patients.detail.bmi")} value={bmiCategory ? `${value("bmi")} (${bmiCategory})` : value("bmi")} />
      <HistoryField label={t("patients.create.organDonor")} value={yesNo("organDonor")} />
      <HistoryField label={t("patients.create.bloodDonor")} value={yesNo("bloodDonor")} />
      <HistoryField label={t("patients.history.deceasedLabel")} value={yesNo("isDeceased")} />
      {(snapshot.isDeceased === true || snapshot.dateOfDeath || version?.unset?.dateOfDeath) && (
        <HistoryField label={t("patients.edit.dateOfDeath")} value={date("dateOfDeath")} />
      )}
      {(snapshot.isDeceased === true || snapshot.causeOfDeath || version?.unset?.causeOfDeath) && (
        <HistoryField label={t("patients.detail.causeOfDeath")} value={value("causeOfDeath")} wide />
      )}
      <HistoryField label={t("patients.detail.diseases")} value={list("diseases")} wide />
      <HistoryField label={t("patients.detail.allergies")} value={list("allergies")} wide />
      <HistoryField label={t("patients.detail.medications")} value={list("medications")} wide />
      <HistoryField label={t("patients.history.childrenCount")} value={value("childrenCount")} />
      <HistoryField label={t("patients.detail.children")} value={list("children", children)} wide />
    </div>
  );
}

export default function PatientHistoryModal(props) {
  const accountId = useAuthStore((state) => state.user?._id);
  return <HistoryPanel key={JSON.stringify([accountId, props.variant, props.patientId])} {...props} />;
}

function HistoryPanel({ variant, patientId, onClose }) {
  const { t, i18n } = useTranslation();
  const [expandedId, setExpandedId] = useState(null);
  const [translations, setTranslations] = useState({});
  const [translatingKey, setTranslatingKey] = useState(null);
  const lang = i18n.language || "en";

  const panelRef = useRef(null);

useEffect(() => {
  const previousActive = document.activeElement;
  panelRef.current?.focus();
  return () => {
    if (previousActive && typeof previousActive.focus === "function") {
      previousActive.focus();
    }
  };
}, []);

const { mutate: translateSnap } = useTranslatePatientHistorySnapshot();

const handleTranslateSnap = (historyId, key) => {
  if (translations[key]) return;
  setTranslatingKey(key);

  translateSnap(
    { variant, patientId, historyId, lang },
    {
      onSuccess: (ver) => {
        const snap = historySnapshot(ver);
        if (snap) setTranslations((prev) => ({ ...prev, [key]: snap }));
      },
      onSettled: () => setTranslatingKey((current) => current === key ? null : current),
    }
  );
};


    const isDoctor = variant === "doctor";
  const isChild = variant === "child";

  const doctorQ = usePatientHistory(patientId, {
    enabled: isDoctor && !!patientId,
  });

  const childQ = useChildHistory(patientId, {
    enabled: isChild && !!patientId,
  });

  const myQ = useMyHistory({
    enabled: !isDoctor && !isChild,
  });

  const { data: history, isLoading, isFetching, isError } = isDoctor ? doctorQ : isChild ? childQ : myQ;
  const loading = isLoading || isFetching;


  const toggle = (id) => setExpandedId((cur) => (cur === id ? null : id));

  const title = isDoctor
    ? trOr(t, "patients.history.title", "Patient History")
    : trOr(t, "myHealthInfo.history.title", "My Health History");

  const emptyText = isDoctor
    ? trOr(t, "patients.history.empty", "No history versions found.")
    : trOr(t, "myHealthInfo.history.empty", "No history available yet.");

  const loadingText = isDoctor
    ? trOr(t, "patients.detail.loading", "Loading...")
    : trOr(t, "myHealthInfo.loading", "Loading...");

  const systemUnknown = isDoctor
    ? trOr(t, "patients.history.systemUnknown", "System/Unknown")
    : trOr(t, "myHealthInfo.history.systemUnknown", "System/Unknown");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-history-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          trapPanelFocus(e, e.currentTarget);
        }}
        className="flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl outline-none"
>
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <h2 id="patient-history-title" className="flex items-center gap-2 text-lg font-semibold text-slate-800">
            <History className="h-5 w-5" aria-hidden="true" />
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={trOr(t, "common.close", "Close")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <p role="status" className="text-center text-slate-500 py-4">{loadingText}</p>
          )}

          {!loading && isError && <p role="alert">{t("patients.history.loadFailed")}</p>}
          {!loading && !isError && (!history || history.length === 0) && (
            <p className="text-center text-slate-500 py-4">{emptyText}</p>
          )}

          <div className="space-y-3">
            {!loading && !isError && history?.map((ver) => {
              const eventAt = ver.eventAt ?? ver.approvedAt;
              const when = eventAt ? new Date(eventAt).toLocaleString(lang) : t("patients.history.notRecorded");
              const proposedAt = ver.proposedAt ? new Date(ver.proposedAt).toLocaleString(lang) : null;
              const editedBy = ver?.editedBy?.name || systemUnknown;
              const key = JSON.stringify([ver._id, lang]);
              const snap = translations[key] ?? historySnapshot(ver);
              const historicalName = (snap?.set ?? snap)?.fullname;
              const translating = translatingKey === key;
              const eventType = ver.eventType ?? "approved";
              const actorLabel = t(attributionKeys[eventType] ?? "patients.history.editedBy");

              return (
                <div key={ver._id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => toggle(ver._id)}
                    className="flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    <div>
                      {expandedId !== ver._id && historicalName && (
                        <p className="font-medium text-slate-800">{historicalName}</p>
                      )}
                      <p className="font-medium text-slate-800">{when}</p>
                      <p className="text-xs font-semibold text-slate-700">{t(`patients.history.events.${eventType}`)}</p>
                      <p className="text-xs text-slate-500">
                        {actorLabel}: {editedBy}
                      </p>
                      {proposedAt && <p className="text-xs text-slate-500">{t("patients.history.proposedAt", { date: proposedAt })}</p>}
                    </div>
                    <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded">
                      {expandedId === ver._id
                        ? trOr(t, "common.close", "Close")
                        : trOr(t, "common.view", "View")}
                    </span>
                  </button>

                 {expandedId === ver._id && (
  <div className="border-t border-slate-200 bg-white p-4">
    <SnapshotViewer
      version={snap}
      t={t}
      i18n={i18n}
      right={
  <button
    type="button"
    onClick={() => handleTranslateSnap(ver._id, key)}
    disabled={translating}
    aria-label={trOr(t, "common.translate", "Translate")}
    className="ml-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    title={trOr(t, "common.translate", "Translate")}
  >
    {translating ? (
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
    ) : (
      <Languages className="h-4 w-4" aria-hidden="true" />
    )}
  </button>
}

    />
  </div>
)}

                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-100 p-3">
          <Button variant="secondary" full={false} onClick={onClose}>
            {trOr(t, "common.close", "Close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
