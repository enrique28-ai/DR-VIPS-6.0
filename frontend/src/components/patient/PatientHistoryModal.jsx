import { useState } from "react";
import { useTranslation } from "react-i18next";
import { History, X, Languages, Loader2 } from "lucide-react";
import Button from "../forms/Button.jsx";
import { usePatientHistory, useMyHistory, useTranslatePatientHistorySnapshot } from "../../features/patients/phooks.js";
import { localizeCountryName, localizeStateName, localizeCityName } from "../../utilsfront/geoLabels.js";

const trOr = (t, key, fallback) => {
  const v = t(key);
  return v && v !== key ? v : fallback;
};

function SnapshotViewer({ snapshot, t, i18n, right }) {
  if (!snapshot) return null;

  const sys = (snapshot?.measurementSystem || "metric").toLowerCase();
  const isImp = sys === "imperial";

  const height =
    typeof snapshot.heightM === "number"
      ? isImp
        ? `${(snapshot.heightM / 0.3048).toFixed(2)} ft`
        : `${snapshot.heightM.toFixed(2)} m`
      : "—";

  const weight =
    typeof snapshot.weightKg === "number"
      ? isImp
        ? `${(snapshot.weightKg * 2.2046226218).toFixed(2)} lb`
        : `${snapshot.weightKg.toFixed(2)} kg`
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

const yes = trOr(t, "patients.create.yes", "Yes");
const no = trOr(t, "patients.create.no", "No");
const none = trOr(t, "patients.history.none", "None");


  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 text-sm text-gray-700">
      <div className="col-span-full flex items-start justify-between border-b pb-2 mb-1">
      <div className="font-semibold text-gray-900">{snapshot.fullname || "—"}</div>
        {right}
      </div>


      <div>
        <span className="font-medium text-gray-500">{t("patients.card.age")}:</span> {snapshot.age ?? "—"}
      </div>
      <div>
        <span className="font-medium text-gray-500">{t("patients.card.gender")}:</span> {gender}
      </div>
      <div>
        <span className="font-medium text-gray-500">{t("patients.card.blood")}:</span> {snapshot.bloodtype ?? "—"}
      </div>
      <div>
        <span className="font-medium text-gray-500">{t("patients.history.location")}:</span> {location || "—"}
      </div>

      <div>
        <span className="font-medium text-gray-500">{t("patients.detail.height")}:</span> {height}
      </div>
      <div>
        <span className="font-medium text-gray-500">{t("patients.detail.weight")}:</span> {weight}
      </div>

      <div className="col-span-full">
        <span className="font-medium text-gray-500">{t("patients.history.deceasedLabel")}:</span>{" "}
        {snapshot.isDeceased === true ? yes : snapshot.isDeceased === false ? no : "—"}
        {snapshot.isDeceased === true && snapshot.causeOfDeath ? ` · ${snapshot.causeOfDeath}` : ""}
      </div>

      <div className="col-span-full">
        <span className="font-medium text-gray-500">{t("patients.detail.diseases")}:</span>{" "}
        {Array.isArray(snapshot.diseases) && snapshot.diseases.length ? snapshot.diseases.join(", ") : none}
      </div>
      <div className="col-span-full">
        <span className="font-medium text-gray-500">{t("patients.detail.allergies")}:</span>{" "}
        {Array.isArray(snapshot.allergies) && snapshot.allergies.length ? snapshot.allergies.join(", ") : none}
      </div>
      <div className="col-span-full">
        <span className="font-medium text-gray-500">{t("patients.detail.medications")}:</span>{" "}
        {Array.isArray(snapshot.medications) && snapshot.medications.length ? snapshot.medications.join(", ") : none}
      </div>
    </div>
  );
}

export default function PatientHistoryModal({ variant, patientId, onClose }) {
  const { t, i18n } = useTranslation();
  const [expandedId, setExpandedId] = useState(null);
  const [translatedById, setTranslatedById] = useState({});
const [translatedSnaps, setTranslatedSnaps] = useState({});
const [translatingId, setTranslatingId] = useState(null);

const { mutate: translateSnap } = useTranslatePatientHistorySnapshot();

const handleTranslateSnap = (historyId) => {
  const lang = i18n.language || "en";
  if (translatedById[historyId] === lang) return;

  setTranslatingId(historyId);

  translateSnap(
    { variant, patientId, historyId, lang },
    {
      onSuccess: (ver) => {
        const snap = ver?.approvedSnapshot?.set || ver?.snapshot || ver?.approvedSnapshot || null;
        if (!snap) return;

        setTranslatedSnaps((prev) => ({ ...prev, [historyId]: snap }));
        setTranslatedById((prev) => ({ ...prev, [historyId]: lang }));
      },
      onSettled: () => setTranslatingId(null),
    }
  );
};


  const isDoctor = variant === "doctor";

   const doctorQ = usePatientHistory(patientId, {
    enabled: isDoctor && !!patientId,
  });

  const myQ = useMyHistory({
    enabled: !isDoctor,
  });

  const history = isDoctor ? doctorQ.data : myQ.data;
  const isLoading = isDoctor ? doctorQ.isLoading : myQ.isLoading;


  const toggle = (id) => setExpandedId((cur) => (cur === id ? null : id));

  const title = isDoctor
    ? trOr(t, "patients.history.title", "Patient History")
    : trOr(t, "myHealthInfo.history.title", "My Approved History");

  const emptyText = isDoctor
    ? trOr(t, "patients.history.empty", "No history versions found.")
    : trOr(t, "myHealthInfo.history.empty", "No history available yet.");

  const loadingText = isDoctor
    ? trOr(t, "patients.detail.loading", "Loading...")
    : trOr(t, "myHealthInfo.loading", "Loading...");

  const actorLabel = isDoctor
    ? trOr(t, "patients.history.editedBy", "Edited by")
    : trOr(t, "myHealthInfo.history.proposedBy", "Proposed by");

  const systemUnknown = isDoctor
    ? trOr(t, "patients.history.systemUnknown", "System/Unknown")
    : trOr(t, "myHealthInfo.history.systemUnknown", "System/Unknown");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <History className="h-5 w-5" />
            {title}
          </h2>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <p className="text-center text-gray-500 py-4">{loadingText}</p>
          )}

          {!isLoading && (!history || history.length === 0) && (
            <p className="text-center text-gray-500 py-4">{emptyText}</p>
          )}

          <div className="space-y-3">
            {history?.map((ver) => {
              const approvedAt = ver?.approvedAt ? new Date(ver.approvedAt) : null;
              const when = approvedAt ? approvedAt.toLocaleString(i18n.language || undefined) : "—";
              const editedBy = ver?.editedBy?.name || systemUnknown;

              // ✅ soporte para ambos formatos (por si en algún momento regresa snapshot directo)
              const baseSnap = ver?.approvedSnapshot?.set || ver?.snapshot || null;
              const snap = translatedSnaps[ver._id] || baseSnap;


              return (
                <div key={ver._id} className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                  <button
                    onClick={() => toggle(ver._id)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-100 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-gray-800">{when}</p>
                      <p className="text-xs text-gray-500">
                        {actorLabel}: {editedBy}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      {expandedId === ver._id
                        ? trOr(t, "common.close", "Close")
                        : trOr(t, "common.view", "View")}
                    </span>
                  </button>

                 {expandedId === ver._id && (
  <div className="border-t border-gray-200 bg-white p-4">
    <SnapshotViewer
      snapshot={snap}
      t={t}
      i18n={i18n}
      right={
        <button
          onClick={() => handleTranslateSnap(ver._id)}
          disabled={translatingId === ver._id}
          className="ml-3 rounded-full p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
          title={trOr(t, "common.translate", "Translate")}
        >
          {translatingId === ver._id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Languages className="h-4 w-4" />
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

        <div className="border-t border-gray-100 p-3 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            {trOr(t, "common.close", "Close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
