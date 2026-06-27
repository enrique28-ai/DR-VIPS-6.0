import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { usePatient, useUpdatePatient } from "../../features/patients/phooks.js";
import Input from "../../components/forms/Input.jsx";
import Button from "../../components/forms/Button.jsx";
import { toast } from "react-hot-toast";
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
import {
  feetInchesToDecimalFeet,
  feetInchesToMeters,
  formatNumber,
  isValidFeetInches,
  kgToLb,
  lbToKg,
  resolveImperialHeightParts,
  metersToFeetInches,
} from "../../utilsfront/measurements.js";
function calcAgeFromYmd(birthYmd, refYmd) {
  if (!birthYmd) return NaN;

  const [by, bm, bd] = String(birthYmd).split("-").map(Number);
  if (!by || !bm || !bd) return NaN;

  const birth = new Date(Date.UTC(by, bm - 1, bd, 12, 0, 0));

  const ref = refYmd
    ? (() => {
        const [ry, rm, rd] = String(refYmd).split("-").map(Number);
        return new Date(Date.UTC(ry, (rm || 1) - 1, rd || 1, 12, 0, 0));
      })()
    : new Date();

  let age = ref.getUTCFullYear() - birth.getUTCFullYear();
  const m = ref.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && ref.getUTCDate() < birth.getUTCDate())) age--;

  return age;
}

const FT_TO_M = 0.3048;
const LB_TO_KG = 0.45359237;

const normStr = (value) => String(value ?? "").trim();
const normLower = (value) => normStr(value).toLowerCase();
const normNameKey = (value) =>
  normStr(value).replace(/\s+/g, " ").toLowerCase();
const digitsOnly = (value) => String(value || "").replace(/\D/g, "");
const parsePhoneForCountry = (value, phoneCountryIso) => {
  const digits = digitsOnly(value);
  if (!digits || !phoneCountryIso) return null;
  return parsePhoneNumberFromString(digits, phoneCountryIso);
};
const phoneDigitsForComparison = (value, phoneCountryIso) => {
  const raw = normStr(value);
  if (!raw) return "";

  const parsed = raw.startsWith("+")
    ? parsePhoneNumberFromString(raw)
    : parsePhoneForCountry(raw, phoneCountryIso);

  if (parsed?.isValid()) return parsed.number.replace(/\D/g, "");
  return digitsOnly(raw);
};
const localYmd = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const ymdFromValue = (value) => {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};
const arrKey = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item) => normStr(item))
    .filter(Boolean)
    .sort()
    .join("||");
const near = (a, b, eps = 0.005) =>
  Math.abs(Number(a) - Number(b)) <= eps;
const childKey = (children) =>
  (Array.isArray(children) ? children : [])
    .map((child) => normNameKey(typeof child === "string" ? child : child?.name))
    .filter(Boolean)
    .join("||");

function isDeathStatusOnlyEdit(patient, payload, phoneCountryIso) {
  if (!patient || !payload || !("isDeceased" in payload)) return false;

  const nextIsDeceased = Boolean(payload.isDeceased);
  const deathChanged =
    nextIsDeceased !== Boolean(patient.isDeceased) ||
    (nextIsDeceased &&
      ymdFromValue(payload.dateOfDeath) !== ymdFromValue(patient.dateOfDeath)) ||
    (nextIsDeceased &&
      normStr(payload.causeOfDeath) !== normStr(patient.causeOfDeath));

  if (!deathChanged) return false;

  const sys = normLower(payload.measurementSystem || patient.measurementSystem || "metric");
  const nextHeightM =
    sys === "imperial" && "heightFeet" in payload && "heightInches" in payload
      ? feetInchesToMeters(Number(payload.heightFeet), Number(payload.heightInches))
      : sys === "imperial"
        ? Number(payload.height) * FT_TO_M
        : Number(payload.height);
  const nextWeightKg =
    sys === "imperial" ? Number(payload.weight) * LB_TO_KG : Number(payload.weight);
  const currentPhoneCountryIso = patient.phoneCountryIso || phoneCountryIso;
  const incomingPhoneCountryIso = payload.phoneCountryIso || phoneCountryIso;
  const currentPhoneDigits =
    phoneDigitsForComparison(patient.phone, currentPhoneCountryIso) ||
    digitsOnly(patient.phoneDigits);
  const incomingPhoneDigits = phoneDigitsForComparison(payload.phone, incomingPhoneCountryIso);
  const phoneChanged =
    "phone" in payload &&
    (incomingPhoneDigits && currentPhoneDigits
      ? !currentPhoneDigits.endsWith(incomingPhoneDigits)
      : incomingPhoneDigits !== currentPhoneDigits);

  return !(
    normStr(payload.fullname) !== normStr(patient.fullname) ||
    ymdFromValue(payload.birthDate) !== ymdFromValue(patient.birthDate) ||
    arrKey(payload.diseases) !== arrKey(patient.diseases) ||
    arrKey(payload.allergies) !== arrKey(patient.allergies) ||
    arrKey(payload.medications) !== arrKey(patient.medications) ||
    normStr(payload.bloodtype).toUpperCase() !== normStr(patient.bloodtype).toUpperCase() ||
    normLower(payload.gender) !== normLower(patient.gender) ||
    normStr(payload.country) !== normStr(patient.country) ||
    normStr(payload.state) !== normStr(patient.state) ||
    normStr(payload.city) !== normStr(patient.city) ||
    normStr(payload.birthCountry) !== normStr(patient.birthCountry) ||
    normStr(payload.birthState) !== normStr(patient.birthState) ||
    normStr(payload.birthCity) !== normStr(patient.birthCity) ||
    Boolean(payload.organDonor) !== Boolean(patient.organDonor) ||
    Boolean(payload.bloodDonor) !== Boolean(patient.bloodDonor) ||
    normLower(payload.parentEmail) !== normLower(patient.parentEmail) ||
    ("email" in payload && normLower(payload.email) !== normLower(patient.email)) ||
    phoneChanged ||
    ("childrenCount" in payload &&
      Number(payload.childrenCount) !== Number(patient.childrenCount || 0)) ||
    ("children" in payload && childKey(payload.children) !== childKey(patient.children)) ||
    sys !== normLower(patient.measurementSystem || "metric") ||
    !near(nextHeightM, patient.heightM) ||
    !near(nextWeightKg, patient.weightKg)
  );
}

const buildDeathStatusPayload = (payload) => ({
  isDeceased: Boolean(payload.isDeceased),
  ...(payload.isDeceased
    ? {
        dateOfDeath: payload.dateOfDeath,
        causeOfDeath: payload.causeOfDeath,
      }
    : {}),
});


export default function PatientEditPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: patient, isLoading, isError } = usePatient(id);
  const updatePatient = useUpdatePatient(id);

  const [form, setForm] = useState({
    fullname: "", email: "", phone: "", birthDate: "",
dateOfDeath: "", diseases: "", allergies: "",  medications: "", bloodtype: "O+",
  });

  const [life, setLife] = useState("alive");

  const AGE_MIN = 0;
  const AGE_MAX = 120;
const ageNum = useMemo(() => {
  const ref = life === "deceased" ? form.dateOfDeath : null;
  return calcAgeFromYmd(form.birthDate, ref);
}, [form.birthDate, form.dateOfDeath, life]);

const isMinor = Number.isFinite(ageNum) && ageNum < 18;

  // === Children + Parent email ===
const [parentEmail, setParentEmail] = useState("");
const parentEmailNorm = (parentEmail || "").trim().toLowerCase();
const isParentEmailFormatValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmailNorm);

const [hasChildren, setHasChildren] = useState("no"); // "yes" | "no"
const [childrenCount, setChildrenCount] = useState(0);
const [childrenNames, setChildrenNames] = useState([]);
const [initialChildrenCount, setInitialChildrenCount] = useState(0);
const [initialChildrenNames, setInitialChildrenNames] = useState([]);

const normChildNameKey = (v) =>
  String(v || "").trim().replace(/\s+/g, " ").toLowerCase();


const clampChildrenCount = (n) => Math.max(0, Math.min(20, Number.isFinite(n) ? n : 0));
const setChildrenCountAndResize = (nextCount, seedNames = [], minOverride) => {
  const base = clampChildrenCount(Number(nextCount));
  const min = Number.isFinite(minOverride) ? minOverride : initialChildrenCount;
  const n = Math.max(min, base);

  setChildrenCount(n);

  setChildrenNames((prev) => {
    const src = seedNames.length ? seedNames : prev;
    const next = [...src];
    while (next.length < n) next.push("");
    return next.slice(0, n);
  });
};


const onChildNameChange = (idx, value) => {
  setChildrenNames((prev) => {
    if (idx < initialChildrenCount) return prev; // 🔒 no tocar existentes
    const next = prev.slice();
    next[idx] = value;
    return next;
  });
};

useEffect(() => {
  if (isMinor) {
    setHasChildren("no");
    setChildrenCountAndResize(0);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [isMinor]);


  // Email: normalizar y validar formato
  const normalizedEmail = (form.email || "").trim().toLowerCase();
  const isEmailFormatValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const onEmailBlur = () => setForm((f) => ({ ...f, email: normalizedEmail }));

  const [gender, setGender] = useState("");         // "male" | "female"
  const [organDonor, setOrganDonor] = useState(""); // "yes" | "no"
  const [bloodDonor, setBloodDonor] = useState(""); // "yes" | "no"
  const [system, setSystem] = useState("metric");    // "metric" | "imperial"
  const [height, setHeight] = useState("");          // m o ft según system
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [weight, setWeight] = useState("");          // kg o lb según system
  const [cause, setCause] = useState("");            // cause of death
  const todayYmd = localYmd();
  const isDeathDateInvalid =
    life === "deceased" &&
    (!form.dateOfDeath ||
      form.dateOfDeath > todayYmd ||
      (form.birthDate && form.dateOfDeath < form.birthDate));
  const isDeathCauseInvalid = life === "deceased" && !cause.trim();
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
const [phoneCountryIso, setPhoneCountryIso] = useState("");
const [phoneCountry, setPhoneCountry] = useState("");

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

const [birthCountryIso, setBirthCountryIso] = useState("");
const [birthCountry, setBirthCountry] = useState("");
const [birthStateIso, setBirthStateIso] = useState("");
const [birthStateName, setBirthStateName] = useState("");
const [birthStateText, setBirthStateText] = useState("");
const [birthCityName, setBirthCityName] = useState("");
const [birthCityText, setBirthCityText] = useState("");

const birthStates = useMemo(
  () => (birthCountryIso ? getLocalizedStates(birthCountryIso, t) : []),
  [birthCountryIso, i18n.language, t]
);

const birthCities = useMemo(
  () => (birthCountryIso && birthStateIso ? getLocalizedCities(birthCountryIso, birthStateIso, t) : []),
  [birthCountryIso, birthStateIso, i18n.language, t]
);

const phoneDialCode = useMemo(
  () => getDialCodeByCountryIso(phoneCountryIso),
  [phoneCountryIso]
);
const phoneDigits = useMemo(() => digitsOnly(form.phone), [form.phone]);
const parsedPhone = useMemo(
  () => parsePhoneForCountry(phoneDigits, phoneCountryIso),
  [phoneDigits, phoneCountryIso]
);
const isPhoneValidForCountry = Boolean(parsedPhone?.isValid());
const phoneIssueKey = !isMinor
  ? !phoneCountryIso && !phoneDigits
    ? "patients.create.phoneCountryAndNumberRequired"
    : !phoneCountryIso
      ? "patients.create.phoneSelectCountryToValidate"
      : !phoneDigits
        ? "patients.create.phoneRequiredAdult"
        : !isPhoneValidForCountry
          ? "patients.create.phoneInvalidAdult"
          : null
  : !phoneDigits
    ? null
    : !phoneCountryIso
      ? "patients.create.phoneSelectCountryToValidate"
      : !isPhoneValidForCountry
        ? "patients.create.phoneInvalidMinor"
        : null;
const isAdultPhoneInvalid = !isMinor && Boolean(phoneIssueKey);
const isMinorPhoneInvalid = isMinor && Boolean(phoneIssueKey);

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

const onBirthCountryChange = (e) => {
  const iso = e.target.value;
  setBirthCountryIso(iso);
  setBirthCountry(getCountryNameByIso(iso));
  setBirthStateIso(""); setBirthStateName(""); setBirthStateText("");
  setBirthCityName(""); setBirthCityText("");
};

const onBirthStateChange = (e) => {
  const iso = e.target.value;
  const rec = birthStates.find((s) => s.isoCode === iso);
  setBirthStateIso(iso);
  setBirthStateName(rec?.name || "");
  setBirthCityName(""); setBirthCityText("");
};

const onBirthCityChange = (e) => setBirthCityName(e.target.value);

const birthStateValue = birthStateName || birthStateText.trim();
const birthCityValue = birthCityName || birthCityText.trim();
const hasBirthplaceInput = Boolean(
  birthCountryIso ||
  birthCountry ||
  birthStateIso ||
  birthStateText.trim() ||
  birthCityName ||
  birthCityText.trim()
);
const hasCompleteBirthplace = Boolean(birthCountry && birthStateValue && birthCityValue);
const isBirthplacePartial = hasBirthplaceInput && !hasCompleteBirthplace;
const patientHasBirthplace = Boolean(
  patient?.birthCountry ||
  patient?.birthState ||
  patient?.birthCity
);
const isClearingExistingBirthplace = patientHasBirthplace && !hasBirthplaceInput;

const onPhoneCountryChange = (e) => {
  const iso = e.target.value;
  setPhoneCountryIso(iso);
  setPhoneCountry(getCountryNameByIso(iso));
};

  // Telefono: solo digitos
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

 useEffect(() => {
    setForm((f) => ({ ...f, phone: digitsOnly(f.phone) }));
  }, [phoneCountryIso]);






  // Topes máximos por sistema
const MAX = {
  metric:   { h: 2.5, w: 350 },
  imperial: { h: 8.2,  w: 771.6 },
};
const lim = system === "imperial" ? MAX.imperial : MAX.metric;
const H = Number(height);
const W = Number(weight);
const isImperialHeightInvalidForBtn =
  system === "imperial" && !isValidFeetInches(heightFeet, heightInches);
const isHeightInvalidForBtn =
  system === "imperial"
    ? isImperialHeightInvalidForBtn
    : !Number.isFinite(H) || H <= 0 || H > lim.h;
const isWeightInvalidForBtn = !Number.isFinite(W) || W <= 0 || W > lim.w;

const DEC = {
  metric:   { h: 2, w: 4 },  // altura 2 decimales, peso 4 para preservar conversión lb<->kg
  imperial: { h: 2, w: 2 },
};

const fmt = (v, decimals) => {
  return formatNumber(v, decimals);
};



// Cambiar sistema convirtiendo valores actuales del form
/*const handleSystem = (next) => {
  if (next === system) return; // no-op
  const curH = Number(height);
  const curW = Number(weight);

  // Si no hay números válidos, solo cambia el sistema y labels
  if (Number.isFinite(curH) || Number.isFinite(curW)) {
    setSystem(next);
    return;
  }

  // Convierte de sistema actual → próximo
  if (system === "metric" && next === "imperial") {
    // m → ft, kg → lb
    setHeight(fmt(curH / 0.3048, DEC.imperial.h));
    setWeight(fmt(curW * 2.2046226218, DEC.imperial.w));
  } else if (system === "imperial" && next === "metric") {
    // ft → m, lb → kg
    setHeight(fmt(curH * 0.3048, DEC.metric.h));
    setWeight(fmt(curW * 0.45359237, DEC.metric.w));
  }
  setSystem(next);
};*/

const handleSystem = (next) => {
  if (next === system) return;

  // OJO: parseFloat("") => NaN (bien). Number("") => 0 (mal para esto)
  const curH = parseFloat(height);
  const curW = parseFloat(weight);

  if (system === "metric" && next === "imperial") {
    if (Number.isFinite(curH)) {
      const parts = metersToFeetInches(curH);
      setHeightFeet(parts.feet);
      setHeightInches(parts.inches);
    }
    // kg -> lb
    if (Number.isFinite(curW)) setWeight(fmt(kgToLb(curW), DEC.imperial.w));
  } else if (system === "imperial" && next === "metric") {
    if (isValidFeetInches(heightFeet, heightInches)) {
      setHeight(fmt(feetInchesToMeters(Number(heightFeet), Number(heightInches)), DEC.metric.h));
    }
    // lb -> kg
    if (Number.isFinite(curW)) setWeight(fmt(lbToKg(curW), DEC.metric.w));
  }

  setSystem(next);
};






  useEffect(() => {
    if (!patient) return;
    setForm({
      fullname: patient.fullname || "",
      email: patient.email || "",
      phone: patient.phone || "",
      birthDate: patient.birthDate ? new Date(patient.birthDate).toISOString().slice(0,10) : "",
      dateOfDeath: patient.dateOfDeath ? new Date(patient.dateOfDeath).toISOString().slice(0,10) : "",
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
  if (isImp) {
    const parts = resolveImperialHeightParts(patient);
    setHeightFeet(parts.feet);
    setHeightInches(parts.inches);
  } else if (patient?.heightDisplay != null) {
    hInit = patient.heightDisplay; // ya en la unidad del sistema
  } else if (patient?.heightM != null) {
    hInit = patient.heightM;
  }
  if (!isImp) {
    setHeightFeet("");
    setHeightInches("");
  }
  setHeight(fmt(hInit, DEC[sys].h));

  // peso
  let wInit = "";
  if (patient?.weightDisplay != null) {
    wInit = patient.weightDisplay; // ya en la unidad del sistema
  } else if (patient?.weightKg != null) {
    wInit = isImp ? (patient.weightKg * 2.2046226218) : patient.weightKg; // kg→lb si imperial
  }
  setWeight(fmt(wInit, DEC[sys].w));
  // Life status
  setLife(patient?.isDeceased ? "deceased" : "alive");
  setCause(patient?.causeOfDeath || "");
  setHasDiseases(Array.isArray(patient?.diseases) && patient.diseases.length > 0 ? "yes" : "no");
  setHasAllergies(Array.isArray(patient?.allergies) && patient.allergies.length > 0 ? "yes" : "no");
  setHasMedications(Array.isArray(patient?.medications) && patient.medications.length > 0 ? "yes" : "no");

  // Children / ParentEmail
setParentEmail(patient?.parentEmail || "");

const namesSeed = (patient?.children || []).map((c) =>
  typeof c === "string" ? c : c?.name || ""
);
const lockedCount = namesSeed.length;

setInitialChildrenCount(lockedCount);
setInitialChildrenNames(namesSeed.slice(0, lockedCount));

const countSeedRaw = patient?.childrenCount ?? lockedCount;
const countSeed = clampChildrenCount(
  Math.max(Number(countSeedRaw) || 0, lockedCount)
);

setHasChildren(countSeed > 0 ? "yes" : "no");
setChildrenCountAndResize(countSeed, namesSeed, lockedCount);


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

const birthCountryRec = all.find(
  (c) => c.name.toLowerCase() === String(patient.birthCountry || "").toLowerCase()
);

if (birthCountryRec) {
  setBirthCountry(birthCountryRec.name);
  setBirthCountryIso(birthCountryRec.isoCode);

  const birthStateList = getLocalizedStates(birthCountryRec.isoCode, t);
  const birthStateRec = birthStateList.find(
    (s) => s.name.toLowerCase() === String(patient.birthState || "").toLowerCase()
  );

  if (birthStateList.length > 0) {
    if (birthStateRec) {
      setBirthStateIso(birthStateRec.isoCode);
      setBirthStateName(birthStateRec.name);

      const birthCityList = getLocalizedCities(birthCountryRec.isoCode, birthStateRec.isoCode, t);
      const birthCityRec = birthCityList.find(
        (x) => x.name.toLowerCase() === String(patient.birthCity || "").toLowerCase()
      );
      if (birthCityRec) setBirthCityName(birthCityRec.name);
      else setBirthCityText(String(patient.birthCity || ""));
    } else {
      setBirthStateText(String(patient.birthState || ""));
      setBirthCityText(String(patient.birthCity || ""));
    }
  } else {
    setBirthStateText(String(patient.birthState || ""));
    setBirthCityText(String(patient.birthCity || ""));
  }
} else {
  setBirthCountry(String(patient.birthCountry || ""));
  setBirthCountryIso("");
  setBirthStateIso("");
  setBirthStateName("");
  setBirthStateText(String(patient.birthState || ""));
  setBirthCityName("");
  setBirthCityText(String(patient.birthCity || ""));
}

const parsedStoredPhone = parsePhoneNumberFromString(patient.phone || "");
const phoneCountryRec =
  (patient.phoneCountryIso
    ? all.find((c) => c.isoCode.toUpperCase() === String(patient.phoneCountryIso).toUpperCase())
    : null) ||
  (patient.phoneCountry
    ? all.find((c) => c.name.toLowerCase() === String(patient.phoneCountry).toLowerCase())
    : null) ||
  (parsedStoredPhone?.country
    ? all.find((c) => c.isoCode.toUpperCase() === parsedStoredPhone.country.toUpperCase())
    : null) ||
  cRec ||
  null;

if (phoneCountryRec) {
  setPhoneCountry(phoneCountryRec.name);
  setPhoneCountryIso(phoneCountryRec.isoCode);
} else {
  setPhoneCountry("");
  setPhoneCountryIso("");
}

// Separar telefono usando el pais telefonico, no el pais de residencia.
const digitsFull = String(patient.phone || "").replace(/\D/g, "");
const ccTxt = String(phoneCountryRec?.phonecode || "").replace(/\D/g, "");
const restPhone = parsedStoredPhone
  ? parsedStoredPhone.formatNational().replace(/\D/g, "")
  : (ccTxt && digitsFull.startsWith(ccTxt) ? digitsFull.slice(ccTxt.length) : digitsFull);
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

if (!form.birthDate) {
  toast.error(t("patients.errors.birthDateRequired"));
  return;
}

if (life === "deceased") {
  if (!form.dateOfDeath) {
    toast.error(t("patients.errors.dateOfDeathRequired"));
    return;
  }
  if (form.dateOfDeath > todayYmd) {
    toast.error(t("patients.errors.dateOfDeathInFuture"));
    return;
  }
  if (form.dateOfDeath < form.birthDate) {
    toast.error(t("patients.errors.dateOfDeathBeforeBirthDate"));
    return;
  }
}

    // Validación de edad (UI amigable)
    if (!Number.isFinite(ageNum) || ageNum < AGE_MIN || ageNum > AGE_MAX) {
        toast.error(t("patients.edit.ageOutOfRange", { min: AGE_MIN, max: AGE_MAX }));
        return;
      }

    
    if ((system === "metric" && !(H > 0)) || !(W > 0)) {
      toast.error(t("patients.edit.heightWeightPositive"));
      return;
    }
    if (system === "imperial" && !isValidFeetInches(heightFeet, heightInches)) {
      toast.error(t("patients.create.heightFeetInchesInvalid"));
      return;
    }
    // Validación de topes
    
    if ((system === "metric" && H > lim.h) || W > lim.w) {
      toast.error(t("patients.edit.heightWeightTooHigh", {
          maxH: lim.h,
          maxW: lim.w,
          hUnit: system === "imperial" ? "ft" : "m",
          wUnit: system === "imperial" ? "lb" : "kg",
        }),);
      return;
    }

    // === Children / Parent email validation ===
const minChildren = !isMinor ? initialChildrenCount : 0;
const needsChildren = !isMinor && (hasChildren === "yes" || minChildren > 0);
const minIfYes = Math.max(1, minChildren);

const desiredCount = needsChildren ? clampChildrenCount(Number(childrenCount)) : 0;
const finalChildrenCount = needsChildren ? Math.max(minIfYes, desiredCount) : 0;

let finalChildren = [];
if (needsChildren) {
  const names = (childrenNames || [])
    .slice(0, finalChildrenCount)
    .map((n) => String(n || "").trim());

  while (names.length < finalChildrenCount) names.push("");

  // 🔒 existentes no cambian
  for (let i = 0; i < minChildren; i++) {
    if (normChildNameKey(names[i]) !== normChildNameKey(initialChildrenNames[i] || "")) {
      toast.error(t("patients.edit.childrenNamesImmutable"));
      return;
    }
  }

  // ✅ nuevos obligatorios
  for (let i = minChildren; i < finalChildrenCount; i++) {
    if (!names[i]) {
      toast.error(t("patients.create.childrenNamesRequired"));
      return;
    }
  }

  // ✅ no duplicados
  const seen = new Set();
  for (const nm of names) {
    const k = normChildNameKey(nm);
    if (k && seen.has(k)) {
      toast.error(t("patients.edit.childrenNamesDuplicate"));
      return;
    }
    if (k) seen.add(k);
  }

  finalChildren = names.map((name) => ({ name }));
}


if (isMinor) {
  if (!isParentEmailFormatValid) {
    toast.error(t("patients.create.parentEmailRequired"));
    return;
  }
}


    if (isDeathCauseInvalid) {
    toast.error(t("patients.edit.causeRequired"));
    return;
   }

  const rest = phoneDigits;
  // Phone: frontend UX only; backend remains authoritative.
  if (phoneIssueKey) {
    toast.error(t(phoneIssueKey));
    return;
  }
   if (!country) {
    toast.error(t("patients.edit.countryRequired"));
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
 if (isClearingExistingBirthplace) {
   toast.error(t("patients.edit.birthplaceClearUnsupported"));
   return;
 }
 if (isBirthplacePartial) {
   toast.error(t("patients.create.birthplaceCompleteRequired"));
   return;
 }
   const heightPayload =
      system === "imperial"
        ? {
            height: feetInchesToDecimalFeet(Number(heightFeet), Number(heightInches)),
            heightFeet: Number(heightFeet),
            heightInches: Number(heightInches),
          }
        : { height: Number(height) };

   const payload = {
      fullname: form.fullname.trim(),
      // Email is adult-only; minor phone clearing must be explicit.
      birthDate: form.birthDate,
      age: ageNum,
      diseases: diseasesArr,
      allergies: allergiesArr,
      medications: medicationsArr,
      bloodtype: form.bloodtype,
      gender,
      country: country,
      state: stateName || stateText,
      city:  cityName  || cityText,
      ...(hasCompleteBirthplace
        ? {
            birthCountry,
            birthState: birthStateValue,
            birthCity: birthCityValue,
          }
        : {}),
      organDonor: organDonor === "yes",
      bloodDonor: bloodDonor === "yes",
      isDeceased: life === "deceased",
      ...(life === "deceased"
        ? {
            dateOfDeath: form.dateOfDeath,
            causeOfDeath: cause.trim(),
          }
        : {}),
      ...(isMinor ? { parentEmail: parentEmailNorm } : {}),
      ...(!isMinor ? { childrenCount: finalChildrenCount, children: finalChildren } : {}),
      measurementSystem: system,
      ...heightPayload,
      weight: Number(weight),
    };

    if (!isMinor) {
      payload.email = normalizedEmail;
    }
    const minorHadExistingPhone =
      isMinor && Boolean(digitsOnly(patient?.phone) || digitsOnly(patient?.phoneDigits));
    const shouldClearMinorPhone = minorHadExistingPhone && !phoneDigits;

    if (!isMinor || phoneDigits || shouldClearMinorPhone) {
      payload.phone = rest;
      if (!shouldClearMinorPhone) {
        payload.phoneCountry = phoneCountry;
        payload.phoneCountryIso = phoneCountryIso;
      }
    }

    const mutationPayload = isDeathStatusOnlyEdit(patient, payload, phoneCountryIso)
      ? buildDeathStatusPayload(payload)
      : payload;

    updatePatient.mutate(mutationPayload,
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
  const hasExistingParentEmail = Boolean(patient?.parentEmail);
  const noDisabled = updatePatient.isPending || initialChildrenCount > 0;
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
          {!isMinor && (
  <>
    <label className="block text-sm font-medium text-gray-700">
      {t("patients.create.email")}<span className="text-red-500">*</span>
    </label>

    <Input
      name="email"
      type="email"
      value={form.email}
      onChange={onChange}
      onBlur={onEmailBlur}
      required
      disabled={hasExistingEmail}
      className={hasExistingEmail ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""}
    />

    {hasExistingEmail && (
      <p className="text-xs text-gray-500 mt-1">{t("patients.edit.emailImmutable")}</p>
    )}

    {!isEmailFormatValid && form.email && !hasExistingEmail && (
      <p className="text-xs text-red-600 mt-1">{t("patients.edit.invalidEmail")}</p>
    )}
  </>
)}


       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <div>
      <label htmlFor="patient-edit-phone-country" className="block text-sm font-medium text-gray-700">
        {t("patients.create.phoneCountry")}{(!isMinor || phoneDigits) && <span className="text-red-500">*</span>}
      </label>
      <select
        id="patient-edit-phone-country"
        value={phoneCountryIso}
        onChange={onPhoneCountryChange}
        className="mt-1 mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
        required={!isMinor || !!phoneDigits}
        disabled={updatePatient.isPending}
      >
        <option value="">{t("patients.create.selectPhoneCountryOption")}</option>
        {localizedCountries.map((c) => {
          const optionDialCode = getDialCodeByCountryIso(c.isoCode);
          return (
            <option key={c.isoCode} value={c.isoCode}>
              {c.label}{optionDialCode ? ` (${optionDialCode})` : ""}
            </option>
          );
        })}
      </select>

      <label className="block text-sm font-medium text-gray-700">
        {t("patients.create.phone")}{!isMinor && <span className="text-red-500">*</span>}
      </label>

      <div className="flex gap-2">
        <Input
          value={phoneDialCode}
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
          required={!isMinor}
        />
      </div>

      <p className={`text-xs mt-1 ${phoneIssueKey ? "text-red-600" : "text-gray-500"}`}>
        {phoneIssueKey
          ? t(phoneIssueKey)
          : `${t("patients.create.phoneDigitsCounter")}: ${phoneDigits.length}`}
      </p>
    </div>

  <div>
    <div>
  <label className="block text-sm font-medium text-gray-700 mb-1">
    {t("patients.create.birthDate")} <span className="text-red-500">*</span>
  </label>

  <LocalizedDatePicker
    value={form.birthDate}
    onChange={(v) => setForm((p) => ({ ...p, birthDate: v }))}
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
  disabled={updatePatient.isPending || hasExistingParentEmail}
  className={
    hasExistingParentEmail
      ? "bg-gray-100 text-gray-500 cursor-not-allowed"
      : ""
  }
/>

  </div>
) : (
  <div className="sm:col-span-2">
    <label className="block text-sm font-medium text-gray-700">{t("patients.create.hasChildren")}</label>

    <div className="mt-2 flex gap-4">
  <label className={`inline-flex items-center gap-2 ${noDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
  <input
    type="radio"
    name="hasChildren"
    value="no"
    checked={hasChildren === "no"}
    onChange={() => {
      if (noDisabled) return;
      setHasChildren("no");
      setChildrenCountAndResize(0);
    }}
    disabled={noDisabled}
    className={noDisabled ? "cursor-not-allowed" : ""}
  />
  <span className={noDisabled ? "cursor-not-allowed" : ""}>
    {t("patients.create.no")}
  </span>
</label>


      <label className="inline-flex items-center gap-2">
        <input
  type="radio"
  name="hasChildren"
  value="yes"
  checked={hasChildren === "yes"}
  onChange={() => {
    setHasChildren("yes");
    const min = Math.max(1, initialChildrenCount);
    if (childrenCount < min) setChildrenCountAndResize(min, childrenNames, min);
  }}
  disabled={updatePatient.isPending}
/>

        <span className="text-sm">{t("patients.create.yes")}</span>
      </label>
    </div>

    {hasChildren === "yes" && (
      <div className="mt-3 space-y-3">
        <Input
  label={t("patients.create.childrenCount")}
  type="number"
  min={Math.max(1, initialChildrenCount)}
  max={20}
  value={childrenCount}
  onChange={(e) =>
    setChildrenCountAndResize(e.target.value, childrenNames, Math.max(1, initialChildrenCount))
  }
  required
  disabled={updatePatient.isPending}
/>


        <div className="space-y-2">
  {Array.from({ length: childrenCount }).map((_, idx) => {
  const isLocked = idx < initialChildrenCount;

  return (
    <Input
      key={idx}
      label={`${t("patients.create.childName")} #${idx + 1}`}
      value={childrenNames[idx] || ""}
      onChange={(e) => onChildNameChange(idx, e.target.value)}
      placeholder={t("patients.create.childNamePlaceholder")}
      required
      disabled={updatePatient.isPending || isLocked}
      className={
        isLocked
          ? "bg-gray-100 text-gray-500 cursor-not-allowed"
          : ""
      }
    />
  );
})}


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
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            >
              {["O+","O-","A+","A-","B+","B-","AB+","AB-"].map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>


          <div>
                    <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("patients.create.residence")}</h2>
                    {/* Country */}
          <label htmlFor="patient-edit-residence-country" className="block text-sm font-medium text-gray-700">{t("patients.create.residenceCountry")}<span className="text-red-500">*</span></label>
          <select
            id="patient-edit-residence-country"
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
          <label htmlFor={states.length > 0 ? "patient-edit-residence-state" : undefined} className="block text-sm font-medium text-gray-700">{t("patients.create.residenceState")}<span className="text-red-500">*</span></label>
          {states.length > 0 ? (
            <select
              id="patient-edit-residence-state"
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
              placeholder={t("patients.create.residenceState")}
              value={stateText}
              onChange={(e)=>setStateText(e.target.value)}
              required
            />
          )}
         
          {/* City */}
          <label htmlFor={cities.length > 0 ? "patient-edit-residence-city" : undefined} className="block text-sm font-medium text-gray-700">{t("patients.create.residenceCity")}<span className="text-red-500">*</span></label>
          {cities.length > 0 ? (
            <select
              id="patient-edit-residence-city"
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
              placeholder=  {t("patients.create.residenceCity")}
              value={cityText}
              onChange={(e)=>setCityText(e.target.value)}
              required
            />
          )}

        </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("patients.create.placeOfBirth")}</h2>
            <label htmlFor="patient-edit-birth-country" className="block text-sm font-medium text-gray-700">{t("patients.create.birthCountry")}</label>
            <select
              id="patient-edit-birth-country"
              value={birthCountryIso}
              onChange={onBirthCountryChange}
              className="mt-1 mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              disabled={updatePatient.isPending}
            >
              <option value="">{t("patients.create.selectCountryOption")}</option>
              {localizedCountries.map((c) => (
                <option key={c.isoCode} value={c.isoCode}>
                  {c.label}
                </option>
              ))}
            </select>

            <label htmlFor={birthStates.length > 0 ? "patient-edit-birth-state" : undefined} className="block text-sm font-medium text-gray-700">{t("patients.create.birthState")}</label>
            {birthStates.length > 0 ? (
              <select
                id="patient-edit-birth-state"
                value={birthStateIso}
                onChange={onBirthStateChange}
                className="mt-1 mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t("patients.create.selectStateOption")}</option>
                {birthStates.map((s) => (
                  <option key={s.isoCode} value={s.isoCode}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                placeholder={t("patients.create.birthState")}
                value={birthStateText}
                onChange={(e)=>setBirthStateText(e.target.value)}
              />
            )}

            <label htmlFor={birthCities.length > 0 ? "patient-edit-birth-city" : undefined} className="block text-sm font-medium text-gray-700">{t("patients.create.birthCity")}</label>
            {birthCities.length > 0 ? (
              <select
                id="patient-edit-birth-city"
                value={birthCityName}
                onChange={onBirthCityChange}
                className="mt-1 mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t("patients.create.selectCityOption")}</option>
                {birthCities.map((ct) => (
                  <option key={ct.name} value={ct.name}>
                    {ct.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                placeholder={t("patients.create.birthCity")}
                value={birthCityText}
                onChange={(e)=>setBirthCityText(e.target.value)}
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

      <>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {t("patients.edit.dateOfDeath")} <span className="text-red-500">*</span>
      </label>

      <LocalizedDatePicker
        value={form.dateOfDeath}
        onChange={(v) => setForm((p) => ({ ...p, dateOfDeath: v }))}
        maxDate={new Date()}
        required
      />
    </div>
       <Input
         label={t("patients.edit.causeOfDeath")}
         value={cause}
         onChange={(e) => setCause(e.target.value)}
         required
       />

       </>
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
            {system === "imperial" ? (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={`${t("patients.create.heightFeetLabel")} (ft)`}
                  type="number"
                  step={1}
                  min={1}
                  required
                  value={heightFeet}
                  onChange={(e) => setHeightFeet(e.target.value)}
                  placeholder="5"
                />
                <Input
                  label={`${t("patients.create.heightInchesLabel")} (in)`}
                  type="number"
                  step={1}
                  min={0}
                  max={11}
                  required
                  value={heightInches}
                  onChange={(e) => setHeightInches(e.target.value)}
                  placeholder="10"
                />
              </div>
            ) : (
              <Input
                label={`${t("patients.create.heightLabel")} (m)`}
                type="number"
                step="any"
                min={0}
                max={MAX.metric.h}
                required
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="e.g. 1.73"
              />
            )}
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

          <div className="flex flex-wrap gap-3 justify-end">
            <Button variant="secondary" type="button" onClick={handleBack}>{t("patients.edit.cancel")}</Button>
            <Button type="submit" loading={updatePatient.isPending} disabled={(!isMinor && !isEmailFormatValid) ||
              isAdultPhoneInvalid ||
              (isMinor && form.email && !isEmailFormatValid) ||
              (isMinor && !isParentEmailFormatValid) ||
              (!isMinor && hasChildren === "yes" && (childrenCount < 1 || childrenNames.slice(0, childrenCount).some(n => !String(n || "").trim()))) ||
              isMinorPhoneInvalid || !gender || !organDonor || !bloodDonor ||  !system
              || (system === "metric" ? !height : (!heightFeet || heightInches === "")) || !weight || !countryIso || !(states.length>0 ? !!stateIso : !!stateText.trim()) || !(cities.length>0 ? !!cityName : !!cityText.trim())
              || isBirthplacePartial || isClearingExistingBirthplace
              || (hasDiseases === "yes" && form.diseases.trim() === "") || (hasAllergies === "yes" && form.allergies.trim() === "") 
              || (hasMedications === "yes" && form.medications.trim() === "") || !Number.isFinite(ageNum) || ageNum < AGE_MIN || ageNum > AGE_MAX 
              || isDeathDateInvalid || isDeathCauseInvalid || isHeightInvalidForBtn || isWeightInvalidForBtn || updatePatient.isPending}>
              {updatePatient.isPending ? t("patients.edit.saving") : t("patients.edit.save")}
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}
