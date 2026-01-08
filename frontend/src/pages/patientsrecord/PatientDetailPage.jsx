import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Button from "../../components/forms/Button.jsx";
import { usePatient, usePatientHistory } from "../../features/patients/phooks.js";
import { Droplet, Globe, User2, Activity, Heart, Pill, CalendarClock, History, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { localizeCountryName, localizeStateName, localizeCityName } from "../../utilsfront/geoLabels.js";


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
    case "0-12": return t("patients.list.ageCategories.child");
    case "13-17": return  t("patients.list.ageCategories.teenager");
    case "18-59": return t("patients.list.ageCategories.adult");
    case "60+": return t("patients.list.ageCategories.senior");
    default: return cat;
  }
};

const bmiBackendToKey = (cat) => {
  if (!cat) return null;
  const c = String(cat).toLowerCase();

  // Ajusta estas reglas a lo que mande tu backend
  if (c.includes("under")) return "underweight";
  if (c.includes("normal")) return "normal";
  if (c.includes("over")) return "overweight";
  return null;
};


const Chip = ({ icon: Icon, label, value }) => (
   <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-700">
     {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
     <span className="font-medium">{label}:</span>
     <span>{value}</span>
   </span>
 );

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

  const yes = t("patients.create.yes");
  const no = t("patients.create.no");
  const none = t("patients.history.none");

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 text-sm text-gray-700">
      <div className="col-span-full font-semibold text-gray-900 border-b pb-2 mb-1">
        {snapshot.fullname || "—"}
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


 function HistoryModal({ patientId, onClose, t, i18n }) {
  const { data: history, isLoading } = usePatientHistory(patientId);
  const [expandedId, setExpandedId] = useState(null);

  const toggle = (id) => setExpandedId((cur) => (cur === id ? null : id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <History className="h-5 w-5" />
            {trOr(t, "patients.history.title", "Patient History")}
          </h2>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <p className="text-center text-gray-500 py-4">
              {trOr(t, "patients.detail.loading", "Loading...")}
            </p>
          )}

          {!isLoading && (!history || history.length === 0) && (
            <p className="text-center text-gray-500 py-4">
              {trOr(t, "patients.history.empty", "No history versions found.")}
            </p>
          )}

          <div className="space-y-3">
            {history?.map((ver) => {
              const approvedAt = ver?.approvedAt ? new Date(ver.approvedAt) : null;
              const when = approvedAt ? approvedAt.toLocaleString(i18n.language || undefined) : "—";
              const editedBy = ver?.editedBy?.name || "System/Unknown";

              // ✅ IMPORTANTE: tu backend devuelve approvedSnapshot, no snapshot
              const snap = ver?.approvedSnapshot?.set || null;

              return (
                <div key={ver._id} className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                  <button
                    onClick={() => toggle(ver._id)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-100 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-gray-800">{when}</p>
                      <p className="text-xs text-gray-500">
                        {trOr(t, "patients.history.editedBy", "Edited by")}: {editedBy}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      {expandedId === ver._id
                        ? trOr(t, "common.close", "Close")
                        : trOr(t, "common.view", "View Details")}
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
          <Button full={false} variant="secondary" onClick={onClose}>
            {trOr(t, "common.close", "Close")}
          </Button>
        </div>
      </div>
    </div>
  );
}


export default function PatientDetailPage() {
  const { t, i18n } = useTranslation();
  const [showHistory, setShowHistory] = useState(false);


  const { id } = useParams();
  const navigate = useNavigate();

  const { data: patient, isLoading, isError } = usePatient(id);

  const categoryLabel = useMemo(() => {
    if (!patient) return null;
    return ageToLabel(patient.age, t) ?? backendCategoryToLabel(patient.ageCategory, t) ?? null;
  }, [patient, t]);

  
  const locationText = useMemo(() => {
  if (!patient) return "";
  const country = localizeCountryName(patient.country, i18n.language);
  const st = localizeStateName({ countryName: patient.country, stateName: patient.state, t });
  const ct = localizeCityName({ countryName: patient.country, stateName: patient.state, cityName: patient.city, t });
  return [country, st, ct].filter(Boolean).join(", ");
}, [patient, i18n.language, t]);






  if (isLoading) {
    return (
      <main className="mx-auto max-w-3xl p-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm text-gray-600">
           {t("patients.detail.loading")}
        </div>
      </main>
    );
  }
  if (isError || !patient) {
    return (
      <main className="mx-auto max-w-3xl p-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">{t("patients.detail.notFoundTitle")}</h1>
          <p className="text-gray-600 mt-1">{t("patients.detail.notFoundText")}</p>
          <div className="mt-4">
            <Button full={false} variant="secondary" onClick={() => navigate("/patients")}>
              {t("patients.detail.backButton")}
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const { fullname, email, phone, age, diseases, allergies, bloodtype, createdAt, updatedAt } = patient;

  

  const sys = (patient?.measurementSystem || "metric").toLowerCase();
const isImp = sys === "imperial";

const heightDisplayUI =
  patient?.heightDisplay ?? (
    patient?.heightM != null
      ? (isImp ? (patient.heightM / 0.3048) : patient.heightM) // m → ft si imperial
      : null
  );
const heightUnitUI = isImp ? "ft" : "m";

const weightDisplayUI =
  patient?.weightDisplay ?? (
    patient?.weightKg != null
      ? (isImp ? (patient.weightKg * 2.2046226218) : patient.weightKg) // kg → lb si imperial
      : null
  );
const weightUnitUI = isImp ? "lb" : "kg";

const bmiKey = bmiBackendToKey(patient?.bmiCategory);
  const bmiLabel = bmiKey
    ? t(`patients.detail.bmiCategories.${bmiKey}`)
    : patient?.bmiCategory; // fallback: muestra el texto crudo si no se reconoce

 

  return (
    <main className="mx-auto max-w-3xl p-4">
      <div className="mb-4">
        <Link
          to="/patients"
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100"
        >
          ← {t("patients.detail.back")}
        </Link>
      </div>

      <header className="mb-4">
        <h1 className="text-3xl font-bold">{fullname}</h1>
       <div className="mt-2 flex flex-wrap gap-2">
          {age != null && <Chip label={t("patients.card.age")} value={age} />}
          {categoryLabel && <Chip label={t("patients.detail.category")} value={categoryLabel} />}
          {bloodtype && <Chip icon={Droplet} label={t("patients.card.blood")} value={bloodtype} />}
          {patient.country && (
          <Chip
          icon={Globe}
          label={t("patients.card.country")}
          value={locationText || localizeCountryName(patient.country, i18n.language)}

          />
          )}
          {patient.gender && (
            <Chip icon={User2} label={t("patients.card.gender")} value={patient.gender === "male" ? t("patients.card.genderMale") : t("patients.card.genderFemale")} />
          )}
          <Chip icon={Activity} label={t("patients.card.status")} value={patient.isDeceased ? t("patients.list.filters.options.deceased") : t("patients.list.filters.options.alive")} />
          <Chip icon={Heart} label={t("patients.list.filters.organDonor")} value={patient.organDonor ?  t("patients.list.filters.options.yes") : t("patients.list.filters.options.no")} />
          <Chip icon={Droplet} label={t("patients.list.filters.bloodDonor")} value={patient.bloodDonor ? t("patients.list.filters.options.yes") : t("patients.list.filters.options.no")} />
        </div>
      </header>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-gray-700 sm:grid-cols-2">
          {email && (
            <>
              <dt className="font-medium"> {t("patients.detail.email")}</dt>
              <dd>{email}</dd>
            </>
          )}
          {phone && (
            <>
              <dt className="font-medium"> {t("patients.detail.phone")}</dt>
              <dd>{phone}</dd>
            </>
          )}

          {heightDisplayUI != null && (
            <>
              <dt className="font-medium">{t("patients.detail.height")}</dt>
              <dd>{Number(heightDisplayUI).toFixed(2)} {heightUnitUI}</dd>
            </>
          )}
          {weightDisplayUI != null && (
            <>
              <dt className="font-medium">{t("patients.detail.weight")}</dt>
              <dd>{Number(weightDisplayUI).toFixed(2)} {weightUnitUI}</dd>
            </>
          )}
          {patient?.bmi != null && (
            <>
              <dt className="font-medium">{t("patients.detail.bmi")}</dt>
              <dd>
                {Number(patient.bmi).toFixed(2)}{" "}
                {bmiLabel && <span className="text-gray-600">{t("patients.detail.bmiCategoryParen", {
                      category: bmiLabel,
                    })}</span>}
              </dd>
            </>
          )}
          {patient.isDeceased && (
            <>
              <dt className="font-medium">{t("patients.detail.causeOfDeath")}</dt>
              <dd>{patient.causeOfDeath || "—"}</dd>
            </>
          )}

          {Array.isArray(diseases) && diseases.length > 0 && (
            <>
              <dt className="font-medium">{t("patients.detail.diseases")}</dt>
              <dd className="flex flex-wrap gap-1">
                {diseases.map((d, i) => (
                  <span key={i} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm">{d}</span>
                ))}
              </dd>
            </>
          )}
          {Array.isArray(allergies) && allergies.length > 0 && (
            <>
              <dt className="font-medium">{t("patients.detail.allergies")}</dt>
              <dd className="flex flex-wrap gap-1">
                {allergies.map((a, i) => (
                  <span key={i} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm">{a}</span>
                ))}
              </dd>
            </>
          )}
          {Array.isArray(patient?.medications) && patient.medications.length > 0 && (
            <>
              <dt className="font-medium flex items-center gap-1">
                <Pill className="h-4 w-4" />  {t("patients.detail.medications")}
              </dt>
              <dd className="flex flex-wrap gap-1">
                {patient.medications.map((m, i) => (
                  <span key={i} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm">{m}</span>
                ))}
              </dd>
            </>
          )}
        </dl>

        <div className="mt-4 text-sm text-gray-500 inline-flex items-center gap-2">
          <CalendarClock className="h-4 w-4" />
          <span>
            {t("patients.detail.created")}: {createdAt ? new Date(createdAt).toLocaleString() : "—"} · {t("patients.detail.updated")}: {updatedAt ? new Date(updatedAt).toLocaleString() : "—"}
          </span>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to={`/patients/${id}/edit`} state={{ from: "detail" }}>
            <Button full={false}>{t("patients.detail.edit")}</Button>
          </Link>
          <Button full={false} variant="secondary" onClick={() => navigate(`/diagnosis/patient/${id}`)}>
            {t("patients.detail.viewDiagnoses")}
          </Button>
          <Button full={false} variant="secondary" onClick={() => navigate("/patients")}>
             {t("patients.detail.backButton")}
          </Button>
          <Button full={false} variant="secondary" onClick={() => setShowHistory(true)}>
          <span className="inline-flex items-center gap-2">
          <History className="h-4 w-4" />
            {trOr(t, "patients.detail.history", "History")}
          </span>
        </Button>
        </div>
      </section>

      {showHistory && (
      <HistoryModal
        patientId={id}
        onClose={() => setShowHistory(false)}
          t={t}
        i18n={i18n}
      />
    )}

    </main>
  );
}
