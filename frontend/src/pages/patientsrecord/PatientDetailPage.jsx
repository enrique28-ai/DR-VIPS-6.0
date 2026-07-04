import { useMemo, useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Button from "../../components/forms/Button.jsx";
import { usePatient, useReassignGuardian, useTranslatePatient } from "../../features/patients/phooks.js";
import PatientHistoryModal from "../../components/patient/PatientHistoryModal.jsx";
import { ArrowLeft, Droplet, Globe, User2, Users, Activity, Heart, Pill, CalendarClock, History, X, AlertTriangle, Languages, Loader2, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { localizeCountryName } from "../../utilsfront/geoLabels.js";
import { formatHeightForSystem } from "../../utilsfront/measurements.js";


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


const Chip = ({ icon: Icon, label, value, tone = "default" }) => {
  const toneClass = tone === "danger"
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${toneClass}`}>
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      <span className="font-medium">{label}:</span>
      <span>{value}</span>
    </span>
  );
};


export default function PatientDetailPage() {
  const { t, i18n } = useTranslation();
  const [showHistory, setShowHistory] = useState(false);
  const [showGuardianForm, setShowGuardianForm] = useState(false);
  const [newParentEmail, setNewParentEmail] = useState("");


  const { id } = useParams();
  const navigate = useNavigate();

  const { data: patient, isLoading, isError } = usePatient(id);
  const reassignGuardian = useReassignGuardian(id);
  const { mutate: translatePatient, isPending: translatingPatient } = useTranslatePatient();
const [translated, setTranslated] = useState({ lang: null, data: null });

useEffect(() => {
  // si cambias de paciente, resetea traducción
  setTranslated({ lang: null, data: null });
  setShowGuardianForm(false);
  setNewParentEmail("");
}, [id]);

const guardianPanelRef = useRef(null);

useEffect(() => {
  if (!showGuardianForm) return;
  const previousActive = document.activeElement;
  guardianPanelRef.current?.focus();
  return () => {
    if (previousActive && typeof previousActive.focus === "function") {
      previousActive.focus();
    }
  };
}, [showGuardianForm]);

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

const birthplaceText = useMemo(() => {
  if (!patientView) return "";

  const country = localizeCountryName(patientView.birthCountry, i18n.language);
  const st = patientView.birthState || "";
  const ct = patientView.birthCity || "";

  return [country, st, ct].filter(Boolean).join(", ");
}, [patientView, i18n.language]);







  if (isLoading) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-slate-50" aria-busy="true">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-3 h-4 w-36 animate-pulse rounded-full bg-slate-200" />
            <div className="h-8 w-64 max-w-full animate-pulse rounded-xl bg-slate-200" />
            <p
              role="status"
              className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-slate-600"
            >
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />
              {t("patients.detail.loading")}
            </p>
          </section>
        </div>
      </main>
    );
  }
  if (isError || !patientView) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <AlertTriangle className="h-7 w-7" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{t("patients.detail.notFoundTitle")}</h1>
            <p className="text-slate-600 mt-1">{t("patients.detail.notFoundText")}</p>
            <div className="mt-4">
              <Button full={false} variant="secondary" onClick={() => navigate("/patients")}>
                {t("patients.detail.backButton")}
              </Button>
            </div>
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
      ? patientView.heightM
      : null
  );
const heightUnitUI = isImp ? "ft" : "m";
const heightTextUI = formatHeightForSystem({
  measurementSystem: sys,
  heightM: patientView?.heightM,
  heightFeet: patientView?.heightFeet,
  heightInches: patientView?.heightInches,
  heightDisplay: patientView?.heightDisplay,
  notSpecified: "",
});

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

  const patientAge = Number(patient?.age);
  const isMinorOrGuardianLinked =
    (Number.isFinite(patientAge) && patientAge < 18) ||
    Boolean(patient?.parentEmail || patient?.minorKey);
  const canReassignGuardian =
    !patient?.isDeceased &&
    isMinorOrGuardianLinked &&
    Boolean(patient?.parentEmail || patient?.minorKey);

  const closeGuardianForm = () => {
    if (reassignGuardian.isPending) return;
    setShowGuardianForm(false);
    setNewParentEmail("");
  };

  const handleGuardianSubmit = (e) => {
    e.preventDefault();
    const email = newParentEmail.trim().toLowerCase();
    if (!email) return;

    reassignGuardian.mutate(
      { newParentEmail: email },
      {
        onSuccess: () => {
          setShowGuardianForm(false);
          setNewParentEmail("");
          setTranslated({ lang: null, data: null });
        },
      }
    );
  };

 

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4">
        <Link
          to="/patients"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("patients.detail.back")}
        </Link>
      </div>

      <header className="mb-4">
        <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{fullname}</h1>

      {patientView?.isPendingApproval && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800 border border-amber-200 shadow-sm animate-pulse motion-reduce:animate-none">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
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
          <Chip icon={Activity} label={t("patients.card.status")} value={patientView.isDeceased ? t("patients.list.filters.options.deceased") : t("patients.list.filters.options.alive")} tone={patientView.isDeceased ? "danger" : "default"} />
          <Chip icon={Heart} label={t("patients.list.filters.organDonor")} value={patientView.organDonor ?  t("patients.list.filters.options.yes") : t("patients.list.filters.options.no")} />
          <Chip icon={Droplet} label={t("patients.list.filters.bloodDonor")} value={patientView.bloodDonor ? t("patients.list.filters.options.yes") : t("patients.list.filters.options.no")} />
        </div>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-slate-700 sm:grid-cols-2">
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
          <dt className="font-medium">{t("patients.create.residence")}</dt>
          <dd>{locationText || t("patients.detail.notSpecified")}</dd>
          <dt className="font-medium">{t("patients.create.placeOfBirth")}</dt>
          <dd>{birthplaceText || t("patients.detail.notSpecified")}</dd>

          {heightTextUI && (
            <>
              <dt className="font-medium">{t("patients.detail.height")}</dt>
              <dd>{heightTextUI}</dd>
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
                {bmiLabel && <span className="text-slate-600">{t("patients.detail.bmiCategoryParen", {
                      category: bmiLabel,
                    })}</span>}
              </dd>
            </>
          )}
          {patientView.isDeceased && (
            <div className="col-span-full mt-2 rounded-xl border border-red-200 bg-red-50/60 p-3 sm:col-span-2">
              <dt className="font-medium text-red-800">{t("patients.detail.causeOfDeath")}</dt>
              <dd className="text-red-700">{patientView.causeOfDeath || "—"}</dd>
            </div>
          )}

          {Array.isArray(diseases) && diseases.length > 0 && (
            <>
              <dt className="font-medium">{t("patients.detail.diseases")}</dt>
              <dd className="flex flex-wrap gap-1">
                {diseases.map((d, i) => (
                  <span key={i} className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-sm">{d}</span>
                ))}
              </dd>
            </>
          )}
          {Array.isArray(allergies) && allergies.length > 0 && (
            <>
              <dt className="font-medium">{t("patients.detail.allergies")}</dt>
              <dd className="flex flex-wrap gap-1">
                {allergies.map((a, i) => (
                  <span key={i} className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-sm">{a}</span>
                ))}
              </dd>
            </>
          )}
          {Array.isArray(patientView?.medications) && patientView.medications.length > 0 && (
            <>
              <dt className="font-medium flex items-center gap-1">
                <Pill className="h-4 w-4" aria-hidden="true" />  {t("patients.detail.medications")}
              </dt>
              <dd className="flex flex-wrap gap-1">
                {patientView.medications.map((m, i) => (
                  <span key={i} className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-sm">{m}</span>
                ))}
              </dd>
            </>
          )}
        </dl>

        <div className="mt-4 text-sm text-slate-500 inline-flex items-center gap-2">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
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
          {canReassignGuardian && (
            <Button
              full={false}
              variant="secondary"
              onClick={() => setShowGuardianForm(true)}
              disabled={reassignGuardian.isPending}
            >
              <span className="inline-flex items-center gap-2">
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                {t("patients.detail.reassignGuardian")}
              </span>
            </Button>
          )}
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
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
    ) : (
      <Languages className="h-4 w-4" aria-hidden="true" />
    )}
    {t("common.translate")}
  </span>
</Button>

          <Button full={false} variant="secondary" onClick={() => setShowHistory(true)}>
          <span className="inline-flex items-center gap-2">
          <History className="h-4 w-4" aria-hidden="true" />
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

      {showGuardianForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeGuardianForm();
          }}
        >
          <div
            ref={guardianPanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="guardian-modal-title"
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeGuardianForm();
              trapPanelFocus(e, e.currentTarget);
            }}
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl outline-none"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="guardian-modal-title" className="text-lg font-semibold text-slate-900">
                {t("patients.detail.reassignGuardian")}
              </h2>
              <button
                type="button"
                onClick={closeGuardianForm}
                disabled={reassignGuardian.isPending}
                aria-label={t("common.close")}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleGuardianSubmit} className="space-y-4">
              <div>
                <label htmlFor="guardian-email" className="mb-1 block text-sm font-medium text-slate-700">
                  {t("patients.detail.newGuardianEmail")}
                </label>
                <input
                  id="guardian-email"
                  type="email"
                  value={newParentEmail}
                  onChange={(e) => setNewParentEmail(e.target.value)}
                  onBlur={() => setNewParentEmail((value) => value.trim().toLowerCase())}
                  placeholder={t("patients.detail.newGuardianEmailPlaceholder")}
                  required
                  disabled={reassignGuardian.isPending}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                />
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  full={false}
                  variant="secondary"
                  onClick={closeGuardianForm}
                  disabled={reassignGuardian.isPending}
                >
                  {t("patients.edit.cancel")}
                </Button>
                <Button
                  type="submit"
                  full={false}
                  loading={reassignGuardian.isPending}
                  disabled={!newParentEmail.trim() || reassignGuardian.isPending}
                >
                  {t("patients.detail.reassignGuardian")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}


      </div>
    </main>
  );
}
