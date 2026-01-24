import { useMemo, useState,  useEffect  } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Button from "../../components/forms/Button.jsx";
import { usePatient, useTranslatePatient } from "../../features/patients/phooks.js";
import PatientHistoryModal from "../../components/patient/PatientHistoryModal.jsx";
import { Droplet, Globe, User2, Users, Activity, Heart, Pill, CalendarClock, History, X, AlertTriangle, Languages, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { localizeCountryName } from "../../utilsfront/geoLabels.js";


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


export default function PatientDetailPage() {
  const { t, i18n } = useTranslation();
  const [showHistory, setShowHistory] = useState(false);


  const { id } = useParams();
  const navigate = useNavigate();

  const { data: patient, isLoading, isError } = usePatient(id);
  const { mutate: translatePatient, isPending: translatingPatient } = useTranslatePatient();
const [translated, setTranslated] = useState({ lang: null, data: null });

useEffect(() => {
  // si cambias de paciente, resetea traducción
  setTranslated({ lang: null, data: null });
}, [id]);

const isTranslatedActive = !!translated.data && translated.lang === i18n.language;
const patientView = isTranslatedActive ? translated.data : patient;


  /*const categoryLabel = useMemo(() => {
    if (!patient) return null;
    return ageToLabel(patient.age, t) ?? backendCategoryToLabel(patient.ageCategory, t) ?? null;
  }, [patient, t]);*/
  const categoryLabel = useMemo(() => {
  if (!patientView) return null;
  return ageToLabel(patientView.age, t) ?? backendCategoryToLabel(patientView.ageCategory, t) ?? null;
}, [patientView, t]);


  
  /*const locationText = useMemo(() => {
  if (!patient) return "";
  const country = localizeCountryName(patient.country, i18n.language);
  const st = localizeStateName({ countryName: patient.country, stateName: patient.state, t });
  const ct = localizeCityName({ countryName: patient.country, stateName: patient.state, cityName: patient.city, t });
  return [country, st, ct].filter(Boolean).join(", ");
}, [patient, i18n.language, t]);*/
const locationText = useMemo(() => {
  if (!patientView) return "";

  const country = localizeCountryName(patientView.country, i18n.language);
  const st = patientView.state || "";
  const ct = patientView.city || "";

  return [country, st, ct].filter(Boolean).join(", ");
}, [patientView, i18n.language]);







  if (isLoading) {
    return (
      <main className="mx-auto max-w-3xl p-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm text-gray-600">
           {t("patients.detail.loading")}
        </div>
      </main>
    );
  }
  if (isError || !patientView) {
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

  const { fullname, email, phone, age, diseases, allergies, bloodtype, createdAt, updatedAt } = patientView;

  
  const kidsCount = Number(
  patientView?.childrenCount ??
  (Array.isArray(patientView?.children) ? patientView.children.length : 0)
);


  const sys = (patientView?.measurementSystem || "metric").toLowerCase();
const isImp = sys === "imperial";

const heightDisplayUI =
  patientView?.heightDisplay ?? (
    patientView?.heightM != null
      ? (isImp ? (patientView.heightM / 0.3048) : patientView.heightM) // m → ft si imperial
      : null
  );
const heightUnitUI = isImp ? "ft" : "m";

const weightDisplayUI =
  patientView?.weightDisplay ?? (
    patientView?.weightKg != null
      ? (isImp ? (patientView.weightKg * 2.2046226218) : patientView.weightKg) // kg → lb si imperial
      : null
  );
const weightUnitUI = isImp ? "lb" : "kg";

const bmiKey = bmiBackendToKey(patientView?.bmiCategory);
  const bmiLabel = bmiKey
    ? t(`patients.detail.bmiCategories.${bmiKey}`)
    : patientView?.bmiCategory; // fallback: muestra el texto crudo si no se reconoce

 

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
        <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-3xl font-bold">{fullname}</h1>

      {patientView?.isPendingApproval && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800 border border-amber-200 shadow-sm animate-pulse">
          <AlertTriangle className="h-4 w-4" />
        {t("patients.detail.pendingApproval")}
      </span>
      )}
    </div>

       <div className="mt-2 flex flex-wrap gap-2">
          {age != null && <Chip label={t("patients.card.age")} value={age} />}
          {categoryLabel && <Chip label={t("patients.detail.category")} value={categoryLabel} />}
          {bloodtype && <Chip icon={Droplet} label={t("patients.card.blood")} value={bloodtype} />}
          {kidsCount > 0 && (
          <Chip icon={Users} label={t("patients.create.childrenCount")} value={kidsCount} />
)}

          {patientView.country && (
          <Chip
          icon={Globe}
          label={t("patients.card.country")}
          value={locationText || localizeCountryName(patientView.country, i18n.language)}
          />
          )}
          {patientView.gender && (
            <Chip icon={User2} label={t("patients.card.gender")} value={patientView.gender === "male" ? t("patients.card.genderMale") : t("patients.card.genderFemale")} />
          )}
          <Chip icon={Activity} label={t("patients.card.status")} value={patientView.isDeceased ? t("patients.list.filters.options.deceased") : t("patients.list.filters.options.alive")} />
          <Chip icon={Heart} label={t("patients.list.filters.organDonor")} value={patientView.organDonor ?  t("patients.list.filters.options.yes") : t("patients.list.filters.options.no")} />
          <Chip icon={Droplet} label={t("patients.list.filters.bloodDonor")} value={patientView.bloodDonor ? t("patients.list.filters.options.yes") : t("patients.list.filters.options.no")} />
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
          {patientView?.bmi != null && (
            <>
              <dt className="font-medium">{t("patients.detail.bmi")}</dt>
              <dd>
                {Number(patientView.bmi).toFixed(2)}{" "}
                {bmiLabel && <span className="text-gray-600">{t("patients.detail.bmiCategoryParen", {
                      category: bmiLabel,
                    })}</span>}
              </dd>
            </>
          )}
          {patientView.isDeceased && (
            <>
              <dt className="font-medium">{t("patients.detail.causeOfDeath")}</dt>
              <dd>{patientView.causeOfDeath || "—"}</dd>
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
          {Array.isArray(patientView?.medications) && patientView.medications.length > 0 && (
            <>
              <dt className="font-medium flex items-center gap-1">
                <Pill className="h-4 w-4" />  {t("patients.detail.medications")}
              </dt>
              <dd className="flex flex-wrap gap-1">
                {patientView.medications.map((m, i) => (
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
          <Button
  full={false}
  variant="secondary"
  disabled={translatingPatient}
  onClick={() => {
    translatePatient(
      { id, lang: i18n.language },
      { onSuccess: (data) => setTranslated({ lang: i18n.language, data }) }
    );
  }}
>
  <span className="inline-flex items-center gap-2">
    {translatingPatient ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : (
      <Languages className="h-4 w-4" />
    )}
    {t("Translate")}
  </span>
</Button>

          <Button full={false} variant="secondary" onClick={() => navigate("/patients")}>
             {t("patients.detail.backButton")}
          </Button>
          <Button full={false} variant="secondary" onClick={() => setShowHistory(true)}>
          <span className="inline-flex items-center gap-2">
          <History className="h-4 w-4" />
            {t("patients.detail.history")}
          </span>
        </Button>
        </div>
      </section>

      {showHistory && (
  <PatientHistoryModal
    variant="doctor"
    patientId={id}
    onClose={() => setShowHistory(false)}
  />
)}


    </main>
  );
}
