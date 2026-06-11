import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCreatePatient } from "../../features/patients/phooks.js";
import Input from "../../components/forms/Input.jsx";
import Button from "../../components/forms/Button.jsx";
import { toast } from "react-hot-toast";
import { useEffect } from "react";
 import { useMemo } from "react";
import {
   getLocalizedCountries,
   getLocalizedStates,
   getLocalizedCities,
   getCountryNameByIso,
   getDialCodeByCountryIso,
 } from "../../utilsfront/geoLabels.js";
 import LocalizedDatePicker from "../../components/forms/LocalizedDatePicker.jsx";
import { useTranslation } from "react-i18next";
import { parsePhoneNumberFromString } from "libphonenumber-js";

function calcAgeFromYmd(birthYmd, refYmd) {
  if (!birthYmd) return NaN;

  const [by, bm, bd] = String(birthYmd).split("-").map(Number);
  if (!by || !bm || !bd) return NaN;

  const birth = new Date(Date.UTC(by, bm - 1, bd, 12, 0, 0));

  const ref = refYmd
    ? new Date(Date.UTC(...refYmd.split("-").map((n, i) => i === 1 ? Number(n) - 1 : Number(n)), 12, 0, 0))
    : new Date();

  let age = ref.getUTCFullYear() - birth.getUTCFullYear();
  const m = ref.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && ref.getUTCDate() < birth.getUTCDate())) age--;

  return Math.max(0, age);
}

const digitsOnly = (value) => String(value || "").replace(/\D/g, "");

const parsePhoneForCountry = (value, countryIso) => {
  const digits = digitsOnly(value);
  if (!digits || !countryIso) return null;
  return parsePhoneNumberFromString(digits, countryIso);
};

export default function PatientCreatePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const createPatient = useCreatePatient();

  const [form, setForm] = useState({
    fullname: "", email: "", phone: "", birthDate: "", diseases: "",  allergies: "", medications: "", bloodtype: "O+",
  });

  


  const AGE_MIN = 0;
  const AGE_MAX = 120;
  const ageNum = useMemo(() => calcAgeFromYmd(form.birthDate), [form.birthDate]);
  const isMinor = Number.isFinite(ageNum) && ageNum < 18;


  // === Children + Parent email ===
const [parentEmail, setParentEmail] = useState("");
const parentEmailNorm = (parentEmail || "").trim().toLowerCase();
const isParentEmailFormatValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmailNorm);

const [hasChildren, setHasChildren] = useState("no"); // "yes" | "no"
const [childrenCount, setChildrenCount] = useState(0);
const [childrenNames, setChildrenNames] = useState([]);

const clampChildrenCount = (n) => Math.max(0, Math.min(20, Number.isFinite(n) ? n : 0));
const setChildrenCountAndResize = (nextCount, seedNames = []) => {
  const n = clampChildrenCount(Number(nextCount));
  setChildrenCount(n);
  setChildrenNames(() => {
    const base = Array.isArray(seedNames) ? seedNames : [];
    const arr = base.slice(0, n).map((x) => String(x ?? ""));
    while (arr.length < n) arr.push("");
    return arr;
  });
};

const onChildNameChange = (idx, value) => {
  setChildrenNames((prev) => {
    const next = prev.slice();
    next[idx] = value;
    return next;
  });
};

useEffect(() => {
  if (isMinor) {
    setHasChildren("no");
    setChildrenCountAndResize(0);

    setForm((f) => ({
      ...f,
      email: "",
      phone: "",
    }));
  } else {
    setParentEmail("");
    if (hasChildren === "yes" && childrenCount === 0) setChildrenCountAndResize(1);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [isMinor]);


  // Email: normalizar y validar formato
  const normalizedEmail = (form.email || "").trim().toLowerCase();
  const isEmailFormatValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const onEmailBlur = () => setForm((f) => ({ ...f, email: normalizedEmail }));
   // campos nuevos (requeridos)
  const [gender, setGender] = useState("");         // "male" | "female"
  const [organDonor, setOrganDonor] = useState(""); // "yes" | "no"
  const [bloodDonor, setBloodDonor] = useState(""); // "yes" | "no"
  const [system, setSystem] = useState("metric");    // "metric" | "imperial"
  const [height, setHeight] = useState("");          // m o ft según system
  const [weight, setWeight] = useState("");          // kg o lb según system
  const [hasDiseases, setHasDiseases] = useState("no"); // "yes" | "no"
  const [hasAllergies, setHasAllergies] = useState("no"); // "yes" | "no"
  const [hasMedications, setHasMedications] = useState("no"); // "yes" | "no"
  // Country/State/City
const [countryIso, setCountryIso] = useState("");
const [country, setCountry] = useState("");

const [stateIso, setStateIso] = useState("");
const [stateName, setStateName] = useState("");
const [stateText, setStateText] = useState("");

const [cityName, setCityName] = useState("");
const [cityText, setCityText] = useState("");


  // País/Estado/Ciudad — NUEVO
 const localizedCountries = useMemo(
  () => getLocalizedCountries(i18n.language),
  [i18n.language]
);

const states = useMemo(
  () => (countryIso ? getLocalizedStates(countryIso, t) : []),
  [countryIso, i18n.language, t]
);

const cities = useMemo(
  () => (countryIso && stateIso ? getLocalizedCities(countryIso, stateIso, t) : []),
  [countryIso, stateIso, i18n.language, t]
);

const dialCode = useMemo(
  () => getDialCodeByCountryIso(countryIso),
  [countryIso]
);
const phoneDigits = useMemo(() => digitsOnly(form.phone), [form.phone]);
const parsedPhone = useMemo(
  () => parsePhoneForCountry(phoneDigits, countryIso),
  [phoneDigits, countryIso]
);
const isPhoneValidForCountry = Boolean(parsedPhone?.isValid());
const isAdultPhoneInvalid =
  !isMinor && (!countryIso || !phoneDigits || !isPhoneValidForCountry);
const isMinorPhoneInvalid =
  isMinor && !!phoneDigits && (!countryIso || !isPhoneValidForCountry);

const onCountryChange = (e) => {
  const iso = e.target.value;
  setCountryIso(iso);
  setCountry(getCountryNameByIso(iso)); // guarda “Mexico” (inglés) para backend
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
 const onPhoneChange = (e) => {
   const digits = e.target.value.replace(/\D/g, "");
   setForm((f) => ({ ...f, phone: digits }));
 };
 const allowDigitKeys = (e) => {
   const k = e.key;
   const allowed = ["Backspace","Delete","Tab","ArrowLeft","ArrowRight","Home","End","Enter"];
   if (allowed.includes(k)) return;
   if (!/^[0-9]$/.test(k)) e.preventDefault();
 };
 const onPasteDigits = (e) => {
   const txt = (e.clipboardData || window.clipboardData).getData("text");
   const digits = String(txt).replace(/\D/g, "");
   e.preventDefault();
   setForm((f) => ({ ...f, phone: digits }));
 };

 // al cambiar de país, recorta automáticamente el largo permitido
  useEffect(() => {
    setForm((f) => ({ ...f, phone: digitsOnly(f.phone) }));
  }, [countryIso]);




  // Topes máximos por sistema
const MAX = {
  metric:   { h: 2.5, w: 350 },
  imperial: { h: 8.2, w: 771.6 },
};
const lim = system === "imperial" ? MAX.imperial : MAX.metric;
const H = Number(height);
const W = Number(weight);
const isHeightInvalidForBtn = !Number.isFinite(H) || H <= 0 || H > lim.h;
const isWeightInvalidForBtn = !Number.isFinite(W) || W <= 0 || W > lim.w;

const DEC = {
  metric:   { h: 2, w: 2 },
  imperial: { h: 2, w: 2 },
};

const fmt = (n, d) => {
  if (!Number.isFinite(n)) return "";
  return String(Number(n.toFixed(d))); // quita decimales basura
};

// Cambiar sistema convirtiendo valores actuales del form (igual que Edit)
const handleSystem = (next) => {
  if (next === system) return;

  // parseFloat("") => NaN (bien). Number("") => 0 (malo).
  const curH = parseFloat(height);
  const curW = parseFloat(weight);

  if (system === "metric" && next === "imperial") {
    // m -> ft
    if (Number.isFinite(curH)) setHeight(fmt(curH / 0.3048, DEC.imperial.h));
    // kg -> lb
    if (Number.isFinite(curW)) setWeight(fmt(curW * 2.2046226218, DEC.imperial.w));
  } else if (system === "imperial" && next === "metric") {
    // ft -> m
    if (Number.isFinite(curH)) setHeight(fmt(curH * 0.3048, DEC.metric.h));
    // lb -> kg
    if (Number.isFinite(curW)) setWeight(fmt(curW * 0.45359237, DEC.metric.w));
  }

  setSystem(next);
};



  
  

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = (e) => {
    e.preventDefault();

    // Validación de edad (UI amigable)
    if (!Number.isFinite(ageNum) || ageNum < AGE_MIN || ageNum > AGE_MAX) {
      toast.error(t("patients.create.ageOutOfRange", { min: AGE_MIN, max: AGE_MAX }));
      return;
    }

    // Validación de topes
    
    if (H > lim.h || W > lim.w) {
      toast.error(t("patients.create.heightWeightTooHigh", {
          maxH: lim.h,
          maxW: lim.w,
          hUnit: system === "imperial" ? "ft" : "m",
          wUnit: system === "imperial" ? "lb" : "kg",
        }));
      return;
    }

    // === Children / Parent email validation ===
const needsChildren = !isMinor && hasChildren === "yes";
const finalChildrenCount = needsChildren ? clampChildrenCount(Number(childrenCount)) : 0;

let finalChildren = [];
if (needsChildren) {
  if (!(finalChildrenCount > 0)) {
    toast.error(t("patients.create.childrenCountRequired"));
    return;
  }
  const names = (childrenNames || [])
    .slice(0, finalChildrenCount)
    .map((n) => String(n || "").trim());

  const allFilled = names.length === finalChildrenCount && names.every(Boolean);
  if (!allFilled) {
    toast.error(t("patients.create.childrenNamesRequired"));
    return;
  }
  finalChildren = names.map((name) => ({ name }));
}

if (isMinor) {
  if (!isParentEmailFormatValid) {
    toast.error(t("patients.create.parentEmailRequired"));
    return;
  }
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

    if (!gender || !organDonor || !bloodDonor) return; // front-guard simple
     if (!country) return;
     if (!system || !height || !weight) return;
     const rest = phoneDigits;
     // Phone: adultos obligatorio y válido para el país; menores opcional
    if (!isMinor) {
      if (isAdultPhoneInvalid) {
        toast.error(t("patients.create.phoneInvalidAdult"));
        return;
      }
    } else if (isMinorPhoneInvalid) {
      toast.error(t("patients.create.phoneInvalidMinor"));
      return;
    }
    // Email: adultos obligatorio formato; menores: si se escribe, validar formato
    if ((!isMinor && !isEmailFormatValid) || (isMinor && form.email && !isEmailFormatValid)) {
      toast.error(t("patients.create.invalidEmail"));
      return;
    }

  const hasState = states.length > 0 ? !!stateIso : !!stateText.trim();
 const hasCity  = cities.length > 0 ? !!cityName : !!cityText.trim();
  if (!countryIso) { toast.error(t("patients.create.countryRequired")); return; }
 if (!hasState)   { toast.error(t("patients.create.stateRequired")); return; }
 if (!hasCity)    { toast.error(t("patients.create.cityRequired")); return; }

 // ✅ Validación BirthDate
    if (!form.birthDate) {
      toast.error(t("patients.errors.birthDateRequired"));
      return;
    }
    
    createPatient.mutate(
      {
        fullname: form.fullname.trim(),
        ...(!isMinor ? { email: normalizedEmail } : {}),
        ...(!isMinor ? { phone: rest } : {}),
        birthDate: form.birthDate,
        age: ageNum,
        diseases: diseasesArr,
        allergies: allergiesArr,
        medications: medicationsArr,
        ...(isMinor ? { parentEmail: parentEmailNorm } : {}),
        ...(!isMinor ? { childrenCount: finalChildrenCount, children: finalChildren } : {}),
        bloodtype: form.bloodtype,
        gender,
        organDonor: organDonor === "yes",
        bloodDonor: bloodDonor === "yes",
        country: country,
        state: stateName || stateText,
        city: cityName || cityText,
        measurementSystem: system,
        height: Number(height),
        weight: Number(weight),
      },
      { onSuccess: () => navigate("/patients") }
    );
  };


  return (
    <main className="mx-auto max-w-2xl p-4">
      <div className="mb-4">
        <Link to="/patients" className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100">
           {t("patients.create.back")}
        </Link>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold mb-4">{t("patients.create.title")}</h1>

        <form onSubmit={onSubmit} className="space-y-4" aria-busy={createPatient.isPending}>
          <label className="block text-sm font-medium text-gray-700">{t("patients.create.fullname")}<span className="text-red-500">*</span></label>
          <Input name="fullname" value={form.fullname} onChange={onChange} required placeholder={t("patients.create.fullnamePlaceholder")} />
         {!isMinor && (
  <>
    <label className="block text-sm font-medium text-gray-700">
      {t("patients.create.email")}<span className="text-red-500">*</span>
    </label>

    <Input
      name="email"
      type="email"
      placeholder={t("patients.create.emailExample")}
      value={form.email}
      onChange={onChange}
      onBlur={onEmailBlur}
      required
    />

    {!isEmailFormatValid && form.email && (
      <p className="text-xs text-red-600 mt-1">{t("patients.create.invalidEmail")}</p>
    )}
  </>
)}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  {!isMinor && (
    <div>
      <label className="block text-sm font-medium text-gray-700">
        {t("patients.create.phone")}<span className="text-red-500">*</span>
      </label>

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
          placeholder={t("patients.create.phoneAreaDigitsPlaceholder")}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>

      <p className="text-xs mt-1">
        {t("patients.create.phoneDigitsCounter")}: {phoneDigits.length}
      </p>
    </div>
  )}

  <div className={!isMinor ? "" : "sm:col-span-2"}>
    <div>
  <label className="block text-sm font-medium text-gray-700 mb-1">
    {t("patients.create.birthDate")} <span className="text-red-500">*</span>
  </label>

  <LocalizedDatePicker
    value={form.birthDate}
    onChange={(v) => setForm((p) => ({ ...p, birthDate: v }))}
    placeholder={t("patients.create.birthDatePlaceholder")}
    maxDate={new Date()}
    required
  />

  <p className="text-xs text-gray-500 mt-1">
    {t("patients.create.computedAge")}: {Number.isFinite(ageNum) ? ageNum : "--"}
  </p>
</div>

  </div>
</div>

            {/* Children / Parent email */}
{isMinor ? (
  <div>
    <label className="block text-sm font-medium text-gray-700">
      {t("patients.create.parentEmail")}<span className="text-red-500">*</span>
    </label>
    <Input
      name="parentEmail"
      type="email"
      value={parentEmail}
      onChange={(e) => setParentEmail(e.target.value)}
      onBlur={() => setParentEmail(parentEmailNorm)}
      placeholder={t("patients.create.parentEmailPlaceholder")}
      required
      disabled={createPatient.isPending}
    />
  </div>
) : (
  <div className="sm:col-span-2">
    <label className="block text-sm font-medium text-gray-700">{t("patients.create.hasChildren")}</label>

    <div className="mt-2 flex gap-4">
      <label className="inline-flex items-center gap-2">
        <input
          type="radio"
          name="hasChildren"
          value="no"
          checked={hasChildren === "no"}
          onChange={() => {
            setHasChildren("no");
            setChildrenCountAndResize(0);
          }}
          disabled={createPatient.isPending}
        />
        <span className="text-sm">{t("patients.create.no")}</span>
      </label>

      <label className="inline-flex items-center gap-2">
        <input
          type="radio"
          name="hasChildren"
          value="yes"
          checked={hasChildren === "yes"}
          onChange={() => {
            setHasChildren("yes");
            if (childrenCount === 0) setChildrenCountAndResize(1);
          }}
          disabled={createPatient.isPending}
        />
        <span className="text-sm">{t("patients.create.yes")}</span>
      </label>
    </div>

    {hasChildren === "yes" && (
      <div className="mt-3 space-y-3">
        <Input
          label={t("patients.create.childrenCount")}
          type="number"
          min={1}
          max={20}
          value={childrenCount}
          onChange={(e) => setChildrenCountAndResize(e.target.value)}
          required
          disabled={createPatient.isPending}
        />

        <div className="space-y-2">
          {Array.from({ length: childrenCount }).map((_, idx) => (
            <Input
              key={idx}
              label={`${t("patients.create.childName")} #${idx + 1}`}
              value={childrenNames[idx] || ""}
              onChange={(e) => onChildNameChange(idx, e.target.value)}
              placeholder={t("patients.create.childNamePlaceholder")}
              required
              disabled={createPatient.isPending}
            />
          ))}
        </div>
      </div>
    )}
  </div>
)}

          <div>
            <label className="block text-sm font-medium text-gray-700">{t("patients.create.bloodType")}<span className="text-red-500">*</span></label>
            <select
              name="bloodtype"
              value={form.bloodtype}
              onChange={onChange}
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              disabled={createPatient.isPending}
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
   disabled={createPatient.isPending}
 >
   <option value=""> {t("patients.create.selectCountryOption")}</option>
   {localizedCountries.map(c => (
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
     placeholder={t("patients.create.city")}
     value={cityText}
     onChange={(e)=>setCityText(e.target.value)}
     required
   />
 )}

      </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("patients.create.hasDiseases")}</label>
            <div className="flex gap-2 mb-2">
              <Button type="button" variant={hasDiseases === "yes" ? "primary" : "secondary"} onClick={() => setHasDiseases("yes")}>{t("patients.create.yes")}</Button>
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

           {/* Allergies */}
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

    {/* Medications (recurrent) */}
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

          {/* Gender (required) */}
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

          {/* Organ donor (required) */}
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

          {/* Blood donor (required) */}
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

           {/* Measurement system + Height/Weight */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
               {t("patients.create.measurementSystem")} <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
             <Button
                type="button"
                variant={system === "metric" ? "primary" : "secondary"}
                onClick={() => handleSystem("metric")}
              >
                  {t("patients.create.systemMetric")}
              </Button>

            <Button
              type="button"
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
              placeholder={system === "imperial" ? "e.g. 5.8" : "e.g. 1.73"}
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
              placeholder={system === "imperial" ? "e.g. 150" : "e.g. 68"}
            />
          </div>

          

          <div className="flex justify-end">
            <Button type="submit" loading={createPatient.isPending}
            disabled={
              (!isMinor && !isEmailFormatValid) ||
              isAdultPhoneInvalid ||
              (isMinor && form.email && !isEmailFormatValid) ||
              (isMinor && !isParentEmailFormatValid) ||
              (!isMinor && hasChildren === "yes" && (childrenCount < 1 || childrenNames.slice(0, childrenCount).some(n => !String(n || "").trim()))) ||
              isMinorPhoneInvalid ||!gender || !organDonor || (hasDiseases === "yes" && form.diseases.trim() === "")||
               !bloodDonor || (hasAllergies === "yes" && form.allergies.trim() === "") || !system || !height 
               || !weight || !countryIso || !(states.length>0 ? !!stateIso : !!stateText.trim()) || !(cities.length>0 ? !!cityName : !!cityText.trim()) 
               ||  (hasMedications === "yes" && form.medications.trim() === "") || !Number.isFinite(ageNum) || ageNum < AGE_MIN || ageNum > AGE_MAX 
               || isHeightInvalidForBtn || isWeightInvalidForBtn || createPatient.isPending}
            >{createPatient.isPending ? t("patients.create.submitting") :  t("patients.create.submit")}</Button>
          </div>
        </form>
      </section>
    </main>
  );
}
