import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { usePatient, useUpdatePatient } from "../../features/patients/phooks.js";
import Input from "../../components/forms/Input.jsx";
import Button from "../../components/forms/Button.jsx";
import { toast } from "react-hot-toast";
 import { useMemo } from "react";
import {
  getLocalizedCountries,
  getLocalizedStates,
  getLocalizedCities,
  getCountryNameByIso,
  getDialCodeByCountryIso,
} from "../../utilsfront/geoLabels.js";

 import { useTranslation } from "react-i18next";


export default function PatientEditPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: patient, isLoading, isError } = usePatient(id);
  const updatePatient = useUpdatePatient(id);

  const [form, setForm] = useState({
    fullname: "", email: "", phone: "", age: "", diseases: "", allergies: "",  medications: "", bloodtype: "O+",
  });

  const AGE_MIN = 0;
  const AGE_MAX = 120;
  const ageNum = Number(form.age);
  const isMinor = Number.isFinite(ageNum) && ageNum < 18;

  // Email: normalizar y validar formato
  const normalizedEmail = (form.email || "").trim().toLowerCase();
  const isEmailFormatValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const onEmailBlur = () => setForm((f) => ({ ...f, email: normalizedEmail }));

  const [gender, setGender] = useState("");         // "male" | "female"
  const [organDonor, setOrganDonor] = useState(""); // "yes" | "no"
  const [bloodDonor, setBloodDonor] = useState(""); // "yes" | "no"
  const [system, setSystem] = useState("metric");    // "metric" | "imperial"
  const [height, setHeight] = useState("");          // m o ft según system
  const [weight, setWeight] = useState("");          // kg o lb según system
  const [life, setLife] = useState("alive");         // "alive" | "deceased"
  const [cause, setCause] = useState("");            // cause of death
  const [hasDiseases, setHasDiseases] = useState("no"); // "yes" | "no"
  const [hasAllergies, setHasAllergies] = useState("no"); // "yes" | "no"
  const [hasMedications, setHasMedications] = useState("no"); // "yes" | "no"
   // País/Estado/Ciudad — NUEVO
// País/Estado/Ciudad — usando utilsfront/geoLabels.js

const localizedCountries = useMemo(
  () => getLocalizedCountries(i18n.language),
  [i18n.language]
);

const [countryIso, setCountryIso] = useState("");
const [country, setCountry] = useState("");

const states = useMemo(
  () => (countryIso ? getLocalizedStates(countryIso, t) : []),
  [countryIso, i18n.language, t]
);

const [stateIso, setStateIso] = useState("");
const [stateName, setStateName] = useState("");
const [stateText, setStateText] = useState("");

const cities = useMemo(
  () => (countryIso && stateIso ? getLocalizedCities(countryIso, stateIso, t) : []),
  [countryIso, stateIso, i18n.language, t]
);

const [cityName, setCityName] = useState("");
const [cityText, setCityText] = useState("");

const dialCode = useMemo(
  () => getDialCodeByCountryIso(countryIso),
  [countryIso]
);

const onCountryChange = (e) => {
  const iso = e.target.value;
  setCountryIso(iso);
  setCountry(getCountryNameByIso(iso)); // guardas el name (como lo espera tu backend)
  setStateIso(""); setStateName(""); setStateText("");
  setCityName(""); setCityText("");
};

const onStateChange = (e) => {
  const iso = e.target.value;
  const rec = states.find((s) => s.isoCode === iso);
  setStateIso(iso);
  setStateName(rec?.name || "");
  setCityName(""); setCityText("");
};

const onCityChange = (e) => setCityName(e.target.value);

  // Teléfono: solo dígitos (máx 10)
 const maxRest = 10;
 const onPhoneChange = (e) => {
   const digits = e.target.value.replace(/\D/g, "");
   setForm((f) => ({ ...f, phone: digits.slice(0, maxRest) }));
 };
 const allowDigitKeys = (e) => {
   const k = e.key;
   const allowed = ["Backspace","Delete","Tab","ArrowLeft","ArrowRight","Home","End","Enter"];
   if (allowed.includes(k)) return;
   if (!/^[0-9]$/.test(k)) e.preventDefault();
 };
 const onPasteDigits = (e) => {
   const txt = (e.clipboardData || window.clipboardData).getData("text");
   const digits = String(txt).replace(/\D/g, "").slice(0, maxRest);
   e.preventDefault();
   setForm((f) => ({ ...f, phone: digits }));
 };

 useEffect(() => {
    setForm((f) => ({ ...f, phone: (f.phone || "").replace(/\D/g, "").slice(0, maxRest) }));
  }, [countryIso]);






  // Topes máximos por sistema
const MAX = {
  metric:   { h: 2.5, w: 350 },
  imperial: { h: 8.2,  w: 771.6 },
};
const lim = system === "imperial" ? MAX.imperial : MAX.metric;
const H = Number(height);
const W = Number(weight);
const isHeightInvalidForBtn = !Number.isFinite(H) || H <= 0 || H > lim.h;
const isWeightInvalidForBtn = !Number.isFinite(W) || W <= 0 || W > lim.w;


// Cambiar sistema convirtiendo valores actuales del form
const handleSystem = (next) => {
  if (next === system) return; // no-op
  const curH = parseFloat(height);
  const curW = parseFloat(weight);

  // Si no hay números válidos, solo cambia el sistema y labels
  if (Number.isNaN(curH) || Number.isNaN(curW)) {
    setSystem(next);
    return;
  }

  // Convierte de sistema actual → próximo
  if (system === "metric" && next === "imperial") {
    // m → ft, kg → lb
    setHeight(String(curH / 0.3048));
    setWeight(String(curW * 2.2046226218));
  } else if (system === "imperial" && next === "metric") {
    // ft → m, lb → kg
    setHeight(String(curH * 0.3048));
    setWeight(String(curW * 0.45359237));
  }
  setSystem(next);
};





  useEffect(() => {
    if (!patient) return;
    setForm({
      fullname: patient.fullname || "",
      email: patient.email || "",
      phone: patient.phone || "",
      age: patient.age ?? "",
      diseases: Array.isArray(patient.diseases) ? patient.diseases.join(", ") : "",
      allergies: Array.isArray(patient.allergies) ? patient.allergies.join(", ") : "",
      medications: Array.isArray(patient.medications) ? patient.medications.join(", ") : "",
      bloodtype: patient.bloodtype || "O+",
    });
    setGender(patient.gender || "");
    setOrganDonor(patient.organDonor ? "yes" : "no");
    setBloodDonor(patient.bloodDonor ? "yes" : "no");
    // inicializa sistema/valores desde el backend
  const sys = (patient.measurementSystem || "metric").toLowerCase();
  setSystem(sys);
  const isImp = sys === "imperial";

  // altura
  let hInit = "";
  if (patient?.heightDisplay != null) {
    hInit = patient.heightDisplay; // ya en la unidad del sistema
  } else if (patient?.heightM != null) {
    hInit = isImp ? (patient.heightM / 0.3048) : patient.heightM; // m→ft si imperial
  }
  setHeight(hInit !== "" ? String(hInit) : "");

  // peso
  let wInit = "";
  if (patient?.weightDisplay != null) {
    wInit = patient.weightDisplay; // ya en la unidad del sistema
  } else if (patient?.weightKg != null) {
    wInit = isImp ? (patient.weightKg * 2.2046226218) : patient.weightKg; // kg→lb si imperial
  }
  setWeight(wInit !== "" ? String(wInit) : "");
  // Life status
  setLife(patient?.isDeceased ? "deceased" : "alive");
  setCause(patient?.causeOfDeath || "");
  setHasDiseases(Array.isArray(patient?.diseases) && patient.diseases.length > 0 ? "yes" : "no");
  setHasAllergies(Array.isArray(patient?.allergies) && patient.allergies.length > 0 ? "yes" : "no");
  setHasMedications(Array.isArray(patient?.medications) && patient.medications.length > 0 ? "yes" : "no");

  // Resolver country ISO2 desde el nombre
// Resolver country ISO2 desde el nombre (sin Country import)
const all = getLocalizedCountries("en"); // "name" siempre viene en inglés del dataset
const cRec = all.find(
  (c) => c.name.toLowerCase() === String(patient.country || "").toLowerCase()
);

if (cRec) {
  setCountry(cRec.name);
  setCountryIso(cRec.isoCode);

  // Estados
  const stList = getLocalizedStates(cRec.isoCode, t);
  const sRec = stList.find(
    (s) => s.name.toLowerCase() === String(patient.state || "").toLowerCase()
  );

  if (stList.length > 0) {
    if (sRec) {
      setStateIso(sRec.isoCode);
      setStateName(sRec.name);

      // Ciudades
      const ctList = getLocalizedCities(cRec.isoCode, sRec.isoCode, t);
      const ctRec = ctList.find(
        (x) => x.name.toLowerCase() === String(patient.city || "").toLowerCase()
      );
      if (ctRec) setCityName(ctRec.name);
      else setCityText(String(patient.city || ""));
    } else {
      setStateText(String(patient.state || ""));
      setCityText(String(patient.city || ""));
    }
  } else {
    setStateText(String(patient.state || ""));
    setCityText(String(patient.city || ""));
  }
} else {
  setCountry(String(patient.country || ""));
  setStateText(String(patient.state || ""));
  setCityText(String(patient.city || ""));
}

// Separar teléfono (remover código de país real)
const digitsFull = String(patient.phone || "").replace(/\D/g, "");
const ccTxt = String(cRec?.phonecode || "").replace(/\D/g, "");
const restPhone = ccTxt && digitsFull.startsWith(ccTxt) ? digitsFull.slice(ccTxt.length) : digitsFull;
setForm((f) => ({ ...f, phone: restPhone }));

  }, [patient]);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else if (location.state?.from === "detail") navigate(`/patients/${id}`);
    else navigate("/patients");
  };

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = (e) => {
    e.preventDefault();

    // Validación de edad (UI amigable)
    if (!Number.isFinite(ageNum) || ageNum < AGE_MIN || ageNum > AGE_MAX) {
        toast.error(t("patients.edit.ageOutOfRange", { min: AGE_MIN, max: AGE_MAX }));
        return;
      }

    
    if (!(H > 0) || !(W > 0)) {
      toast.error(t("patients.edit.heightWeightPositive"));
      return;
    }
    // Validación de topes
    
    if (H > lim.h || W > lim.w) {
      toast.error(t("patients.edit.heightWeightTooHigh", {
          maxH: lim.h,
          maxW: lim.w,
          hUnit: system === "imperial" ? "ft" : "m",
          wUnit: system === "imperial" ? "lb" : "kg",
        }),);
      return;
    }

    if (life === "deceased" && !cause.trim()) {
    toast.error(t("patients.edit.causeRequired"));
    return;
   }

   if (!country) {
    toast.error(t("patients.edit.countryRequired"));
    return;
  }
    // Teléfono: validar total=10 y normalizar
  const rest = String(form.phone || "").replace(/\D/g, "");
  const totalDigits = rest.length;
 if (!isMinor) {
    if (!countryIso|| totalDigits !== 10) {
      toast.error(t("patients.create.phoneInvalidAdult"));
      return;
    }
  } else if (totalDigits !== 0 && totalDigits !== 10) {
    toast.error(t("patients.create.phoneInvalidMinor"));
    return;
  }
  if ((!isMinor && !isEmailFormatValid) || (isMinor && form.email && !isEmailFormatValid)) {
    toast.error(t("patients.edit.invalidEmail"));
    return;
  }

    const diseasesArr = hasDiseases === "yes"
      ? form.diseases.split(",").map(s=>s.trim()).filter(Boolean)
      : [];
    if (hasDiseases === "yes" && diseasesArr.length === 0) {
      toast.error(t("patients.create.diseasesRequired"));
      return;
    }

    const allergiesArr = hasAllergies === "yes"
      ? form.allergies.split(",").map(s=>s.trim()).filter(Boolean)
      : [];
    if (hasAllergies === "yes" && allergiesArr.length === 0) {
      toast.error(t("patients.create.allergiesRequired"));
      return;
    }

    const medicationsArr = hasMedications === "yes"
      ? form.medications.split(",").map(s=>s.trim()).filter(Boolean)
      : [];
    if (hasMedications === "yes" && medicationsArr.length === 0) {
      toast.error(t("patients.create.medicationsRequired"));
      return;
    }

    const hasState = states.length > 0 ? !!stateIso : !!stateText.trim();
 const hasCity  = cities.length > 0 ? !!cityName : !!cityText.trim();
 if (!countryIso) { toast.error(t("patients.create.countryRequired")); return; }
 if (!hasState)   { toast.error(t("patients.create.stateRequired")); return; }
 if (!hasCity)    { toast.error(t("patients.create.cityRequired")); return; }
    updatePatient.mutate(
      {
        fullname: form.fullname.trim(),
        email: normalizedEmail,
        phone: rest,
        age: Number(form.age),
        diseases: diseasesArr,
        allergies: allergiesArr,
        medications: medicationsArr,
        bloodtype: form.bloodtype,
        gender,
        country: country,
        state: stateName || stateText,
        city:  cityName  || cityText,
        organDonor: organDonor === "yes",
        bloodDonor: bloodDonor === "yes",
         isDeceased: life === "deceased",
        ...(life === "deceased" ? { causeOfDeath: cause.trim() } : {}),
       // ...( !isMinor || normalizedEmail ? { email: normalizedEmail } : {} ),
       // ...( !isMinor || totalDigits > 0 ? { phone: rest } : {} ),
        measurementSystem: system,
        height: Number(height),
        weight: Number(weight),
      },
      {
        onSuccess: () => {
          if (location.state?.from === "detail") navigate(`/patients/${id}`, { replace: true });
          else navigate("/patients", { replace: true });
        },
      }
    );
  };

  if (isLoading) return null; // si prefieres, muestra un spinner aquí
  if (isError || !patient) {
    return (
      <main className="mx-auto max-w-2xl p-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">{t("patients.edit.notFoundTitle")}</h1>
          <div className="mt-4">
            <Button full={false} variant="secondary" onClick={() => navigate("/patients")}>
              {t("patients.edit.backToPatients")}
            </Button>
          </div>
        </div>
      </main>
    );
  }
  const hasExistingEmail = Boolean(patient?.email);
  return (
    <main className="mx-auto max-w-2xl p-4">
      <div className="mb-4">
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100"
        >
          ← {t("patients.edit.back")}
        </button>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold mb-4">{t("patients.edit.title")}</h1>

        <form onSubmit={onSubmit} className="space-y-4" aria-busy={updatePatient.isPending}>
          <label className="block text-sm font-medium text-gray-700">{t("patients.create.fullname")}<span className="text-red-500">*</span></label>
          <Input name="fullname" value={form.fullname} onChange={onChange} required />
          <label className="block text-sm font-medium text-gray-700">{t("patients.create.email")}{!isMinor && <span className="text-red-500">*</span>}</label>
          <Input
          name="email"
          type="email"
          value={form.email}
          onChange={onChange}
          onBlur={onEmailBlur}
          required={!isMinor}
          disabled={hasExistingEmail}
    // Opcional: Estilo visual para indicar que está bloqueado
          className={hasExistingEmail ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""}
        />
        {hasExistingEmail && (
        <p className="text-xs text-gray-500 mt-1">
          {/* Puedes usar una key de traducción o texto directo */}
            {t("patients.edit.emailImmutable")}
          </p>
          )}
        {!isEmailFormatValid && form.email && !hasExistingEmail && (
          <p className="text-xs text-red-600 mt-1">{t("patients.edit.invalidEmail")}</p>
        )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-gray-700">{t("patients.create.phone")}{!isMinor && <span className="text-red-500">*</span>}</label>
             <div className="flex gap-2">
            <Input
              value={dialCode}
              readOnly
              className="w-28 rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-gray-700"
              placeholder="+CC"
            />
            <Input
              value={form.phone}
              onChange={onPhoneChange}
              onKeyDown={allowDigitKeys}
              onPaste={onPasteDigits}
              inputMode="numeric"
              pattern="[0-9]*"
              disabled={!countryIso}
              placeholder={country ? t("patients.create.phoneAreaDigitsPlaceholder") : t("patients.create.selectCountryFirst")}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              required={!isMinor}
            />
            </div>
          <p className="text-xs mt-1">
          {t("patients.create.phoneDigitsCounter")}: {(form.phone || "").length}/10
          </p>
            <Input label={t("patients.create.age")} type="number" min={AGE_MIN} max={AGE_MAX} name="age" value={form.age} onChange={onChange} required />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">{t("patients.create.bloodType")}<span className="text-red-500">*</span></label>
            <select
              name="bloodtype"
              value={form.bloodtype}
              onChange={onChange}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            >
              {["O+","O-","A+","A-","B+","B-","AB+","AB-"].map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>


          <div>
                    {/* Country */}
          <label className="block text-sm font-medium text-gray-700">{t("patients.create.country")}<span className="text-red-500">*</span></label>
          <select
            value={countryIso}
            onChange={onCountryChange}
            className="mt-1 mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={updatePatient.isPending}
          >
            <option value="">{t("patients.create.selectCountryOption")}</option>
            {localizedCountries.map((c) => (
          <option key={c.isoCode} value={c.isoCode}>
          {c.label}
        </option>
          ))}

          </select>
         
          {/* State/Province */}
          <label className="block text-sm font-medium text-gray-700">{t("patients.create.state")}<span className="text-red-500">*</span></label>
          {states.length > 0 ? (
            <select
              value={stateIso}
              onChange={onStateChange}
              className="mt-1 mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">{t("patients.create.selectStateOption")}</option>
              {states.map((s) => (
            <option key={s.isoCode} value={s.isoCode}>
            {s.label}
            </option>
        ))}

            </select>
          ) : (
            <Input
              placeholder={t("patients.create.state")}
              value={stateText}
              onChange={(e)=>setStateText(e.target.value)}
              required
            />
          )}
         
          {/* City */}
          <label className="block text-sm font-medium text-gray-700">{t("patients.create.city")}<span className="text-red-500">*</span></label>
          {cities.length > 0 ? (
            <select
              value={cityName}
              onChange={onCityChange}
              className="mt-1 mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">{t("patients.create.selectCityOption")}</option>
              {cities.map((ct) => (
              <option key={ct.name} value={ct.name}>
                {ct.label}
              </option>
            ))}

            </select>
          ) : (
            <Input
              placeholder=  {t("patients.create.city")}
              value={cityText}
              onChange={(e)=>setCityText(e.target.value)}
              required
            />
          )}

        </div>

           {/* Diseases toggle + input condicional */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.create.hasDiseases")}</label>
            <div className="flex gap-2 mb-2">
              <Button type="button" variant={hasDiseases === "yes" ? "primary" : "secondary"} onClick={() => setHasDiseases("yes")}> {t("patients.create.yes")}</Button>
              <Button type="button" variant={hasDiseases === "no"  ? "primary" : "secondary"} onClick={() => setHasDiseases("no")}>{t("patients.create.no")}</Button>
            </div>
            {hasDiseases === "yes" && (
              <Input
                label={t("patients.detail.diseases")}
                name="diseases"
                value={form.diseases}
                onChange={onChange}
                placeholder={t("patients.create.diseasesPlaceholder")}
                required
              />
            )}
          </div>

          {/* Allergies toggle + input condicional */}
         <div>
           <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.create.hasAllergies")}</label>
           <div className="flex gap-2 mb-2">
           <Button type="button" variant={hasAllergies === "yes" ? "primary" : "secondary"} onClick={() => setHasAllergies("yes")}>{t("patients.create.yes")}</Button>
           <Button type="button" variant={hasAllergies === "no"  ? "primary" : "secondary"} onClick={() => setHasAllergies("no")}>{t("patients.create.no")}</Button>
         </div>
           {hasAllergies === "yes" && (
         <Input
             label={t("patients.detail.allergies")}
             name="allergies"
             value={form.allergies}
             onChange={(e) => setForm((f) => ({ ...f, allergies: e.target.value }))}
             placeholder={t("patients.create.allergiesPlaceholder")}
             required
         />
       )}
       </div>

       {/* Medications toggle + input condicional */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.create.hasMedications")}</label>
        <div className="flex gap-2 mb-2">
          <Button type="button" variant={hasMedications === "yes" ? "primary" : "secondary"} onClick={() => setHasMedications("yes")}>{t("patients.create.yes")}</Button>
          <Button type="button" variant={hasMedications === "no"  ? "primary" : "secondary"} onClick={() => setHasMedications("no")}>{t("patients.create.no")}</Button>
        </div>
        {hasMedications === "yes" && (
          <Input
            label={t("patients.detail.medications")}
            name="medications"
            value={form.medications}
            onChange={(e) => setForm((f) => ({ ...f, medications: e.target.value }))}
            placeholder={t("patients.create.medicationsPlaceholder")}
            required
          />
        )}
      </div>

           {/* Gender */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
               {t("patients.create.gender")} <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={gender === "male" ? "primary" : "secondary"}
                onClick={() => setGender("male")}
              >
                 {t("patients.card.genderMale")}
              </Button>
              <Button
                type="button"
                variant={gender === "female" ? "primary" : "secondary"}
                onClick={() => setGender("female")}
              >
                 {t("patients.card.genderFemale")}
              </Button>
            </div>
          </div>

          {/* Organ donor */}
          <div>
           <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("patients.create.organDonor")} <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={organDonor === "yes" ? "primary" : "secondary"}
                onClick={() => setOrganDonor("yes")}
              >
                {t("patients.create.yes")}
              </Button>
              <Button
                type="button"
                variant={organDonor === "no" ? "primary" : "secondary"}
                onClick={() => setOrganDonor("no")}
              >
                {t("patients.create.no")}
              </Button>
            </div>
          </div>

          {/* Blood donor */}
          <div>
           <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("patients.create.bloodDonor")} <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={bloodDonor === "yes" ? "primary" : "secondary"}
                onClick={() => setBloodDonor("yes")}
              >
                {t("patients.create.yes")}
              </Button>
              <Button
                type="button"
                variant={bloodDonor === "no" ? "primary" : "secondary"}
                onClick={() => setBloodDonor("no")}
              >
                {t("patients.create.no")}
              </Button>
            </div>
          </div>


          {/* Life status */}
       <div>
         <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.edit.status")}</label>
        <div className="flex gap-2">
        <Button type="button" variant={life === "alive" ? "primary" : "secondary"} onClick={() => setLife("alive")}>
           {t("patients.edit.alive")}
         </Button>
         <Button type="button" variant={life === "deceased" ? "primary" : "secondary"} onClick={() => setLife("deceased")}>
           {t("patients.edit.deceased")}
         </Button>
         </div>
       </div>

     {life === "deceased" && (
       <Input
         label={t("patients.edit.causeOfDeath")}
         value={cause}
         onChange={(e) => setCause(e.target.value)}
         required
       />
     )}

           {/* Measurement system + Height/Weight */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("patients.create.measurementSystem")} <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <Button type="button"
                    variant={system === "metric" ? "primary" : "secondary"}
                    onClick={() => handleSystem("metric")}
                >
                    {t("patients.create.systemMetric")}
              </Button>

              <Button type="button"
              variant={system === "imperial" ? "primary" : "secondary"}
              onClick={() => handleSystem("imperial")}
              >
              {t("patients.create.systemImperial")}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={`${t("patients.create.heightLabel")} (${system === "imperial" ? "ft" : "m"})`}
              type="number"
              step="any"
              min={0}
              max={system === "imperial" ? MAX.imperial.h : MAX.metric.h}
              required
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
            <Input
              label={`${t("patients.create.weightLabel")} (${system === "imperial" ? "lb" : "kg"})`}
              type="number"
              step="any"
              min={0}
              max={system === "imperial" ? MAX.imperial.w : MAX.metric.w}
              required
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-3 justify-end">
            <Button variant="secondary" type="button" onClick={handleBack}>{t("patients.edit.cancel")}</Button>
            <Button type="submit" loading={updatePatient.isPending} disabled={(!isMinor && !isEmailFormatValid) ||
              (!isMinor && (form.phone || "").length !== 10) ||
              (isMinor && form.email && !isEmailFormatValid) ||
              (isMinor && (form.phone || "").length !== 0 && (form.phone || "").length !== 10) || !gender || !organDonor || !bloodDonor ||  !system 
              || !height || !weight || !countryIso || !(states.length>0 ? !!stateIso : !!stateText.trim()) || !(cities.length>0 ? !!cityName : !!cityText.trim()) 
              || (hasDiseases === "yes" && form.diseases.trim() === "") || (hasAllergies === "yes" && form.allergies.trim() === "") 
              || (hasMedications === "yes" && form.medications.trim() === "") || !Number.isFinite(ageNum) || ageNum < AGE_MIN || ageNum > AGE_MAX 
              || isHeightInvalidForBtn || isWeightInvalidForBtn || updatePatient.isPending}>
              {updatePatient.isPending ? t("patients.edit.saving") : t("patients.edit.save")}
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}
