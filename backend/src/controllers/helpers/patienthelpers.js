import * as dns from "node:dns/promises";
import { Country } from "country-state-city";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import Patient from "../../models/Patient.js";
import User from "../../models/User.js";
import { AGE_BANDS } from "../../models/Patient.js";


const ALL_COUNTRIES = Country.getAllCountries();

const findCountry = (nameOrIso = "") => {
   const s = String(nameOrIso).trim().toLowerCase();
    return ALL_COUNTRIES.find(c =>
     c.isoCode.toLowerCase() === s ||
     c.name.toLowerCase() === s
   );
 };

export const normPhoneCountry = (input = {}) => {
  const phoneCountry = typeof input === "object" ? input.phoneCountry : input;
  const phoneCountryIso = typeof input === "object" ? input.phoneCountryIso : undefined;
  const countryRaw = String(phoneCountry ?? "").trim();
  const isoRaw = String(phoneCountryIso ?? "").trim();
  const countryRec = countryRaw ? findCountry(countryRaw) : undefined;
  const isoRec = isoRaw ? findCountry(isoRaw) : undefined;

  if (!countryRaw && !isoRaw) {
    return { ok:false, error:"Phone country is required" };
  }
  if (countryRaw && !countryRec) {
    return { ok:false, error:"Invalid phone country" };
  }
  if (isoRaw && !isoRec) {
    return { ok:false, error:"Invalid phone country" };
  }
  if (
    countryRec &&
    isoRec &&
    countryRec.isoCode.toUpperCase() !== isoRec.isoCode.toUpperCase()
  ) {
    return { ok:false, error:"Phone country and ISO do not match" };
  }

  const resolved = isoRec || countryRec;
  return {
    ok:true,
    phoneCountry: resolved.name,
    phoneCountryIso: resolved.isoCode.toUpperCase(),
  };
};

export const normPhoneWithCountry = (country, phoneRaw) => {
  const phoneCountry = normPhoneCountry(country);
  const iso = phoneCountry.ok ? phoneCountry.phoneCountryIso : undefined;
  const raw = String(phoneRaw || "").trim();
  const nationalDigits = raw.replace(/\D/g, "");
  if (!phoneCountry.ok) return phoneCountry;
  if (!nationalDigits) return { ok:false, error:"Invalid phone number for selected country" };

  const parsed = raw.startsWith("+")
    ? parsePhoneNumberFromString(raw)
    : parsePhoneNumberFromString(nationalDigits, iso);

  if (!parsed?.isValid() || parsed.country !== iso) {
    return { ok:false, error:"Invalid phone number for selected country" };
  }

  const phone = parsed.number;
  return {
    ok:true,
    phone,
    digits: phone.replace(/\D/g, ""),
    phoneCountry: phoneCountry.phoneCountry,
    phoneCountryIso: phoneCountry.phoneCountryIso,
  };
};

export const normalize = (v) => {
  if (Array.isArray(v)) return v.map(s=>String(s).trim()).filter(Boolean);
  const s = String(v ?? "");
  if (!s.trim()) return [];
  return s.split(",").map(x=>x.trim()).filter(Boolean);
};

// Lista informativa de proveedores comunes (no restringe; solo referencia)
const KNOWN_CONSUMER_DOMAINS = new Set([
  "gmail.com","googlemail.com",
  "outlook.com","hotmail.com","live.com","msn.com",
  "yahoo.com","yahoo.es","ymail.com",
  "icloud.com","me.com","mac.com",
  "proton.me","protonmail.com",
  "aol.com","zoho.com","gmx.com","yandex.com","mail.com"
]);

const isValidEmailFormat = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase());
const getEmailDomain = (email) => String(email || "").split("@")[1]?.toLowerCase();

async function domainHasDns(domain) {
  if (!domain) return false;
  try { const mx = await dns.resolveMx(domain); if (mx?.length) return true; } catch {}
  try { const a  = await dns.resolve4(domain); if (a?.length)  return true; } catch {}
  try { const a6 = await dns.resolve6(domain); if (a6?.length) return true; } catch {}
  return false;
}

export async function verifyEmail(email) {
  if (!isValidEmailFormat(email)) return { ok: false, error: "Invalid email format" };
  const domain = getEmailDomain(email);
  const exists = await domainHasDns(domain);
  if (!exists) return { ok: false, error: "Email domain does not exist" };
  return { ok: true, domain, isConsumer: KNOWN_CONSUMER_DOMAINS.has(domain) };
}

// Util: castea "true"/"false" a boolean
export const toBool = (v) => {
   if (v === true || v === "true" || v === 1 || v === "1") return true;
   if (v === false || v === "false" || v === 0 || v === "0") return false;
   if (typeof v === "string") {
     const s = v.trim().toLowerCase();
     if (s === "yes") return true;
     if (s === "no") return false;
   }
   return false; // por defecto
 };

// Util: normaliza gender
export const normGender = (g) => String(g ?? "").trim().toLowerCase();

// Conversión de unidades (imperial -> canónico)
export const FT_TO_M  = 0.3048;
export const LB_TO_KG = 0.45359237;



export function calculateAge(birthDate, referenceDate = new Date()) {
  if (!birthDate) return undefined;
  const b = new Date(birthDate);
  const r = new Date(referenceDate);
  if (Number.isNaN(b.getTime()) || Number.isNaN(r.getTime())) return undefined;
  let age = r.getFullYear() - b.getFullYear();
  const m = r.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && r.getDate() < b.getDate())) age--;
  return Math.max(0, age);
}

export function mapAgeToBand(age) {
  if (!Number.isFinite(age)) return undefined;
  const band = AGE_BANDS.find((b) => age >= b.min && age <= b.max);
  return band?.key;
}

// ✅ edad viva (cumpleaños) + freeze si deceased
export function computeDynamicAge(p) {
  if (p?.birthDate) {
    const ref = (p?.isDeceased && p?.dateOfDeath) ? new Date(p.dateOfDeath) : new Date();
    const a = calculateAge(p.birthDate, ref);
    if (Number.isFinite(a)) return a;
  }
  const legacy = Number(p?.age);
  return Number.isFinite(legacy) ? legacy : undefined;
}

export function applyDynamicAgeToPatient(p) {
  if (!p || typeof p !== "object") return p;
  const a = computeDynamicAge(p);
  if (Number.isFinite(a)) {
    p.age = a;
    p.ageCategory = mapAgeToBand(a);
  }
  return p;
}

export function applyDynamicAgeToSnapshotSet(setObj) {
  if (!setObj || typeof setObj !== "object") return setObj;
  const tmp = { ...setObj };
  applyDynamicAgeToPatient(tmp);
  return tmp;
}

// ✅ filtro category -> rango birthDate (para vivos)
export function ageCategoryToBirthDateQuery(categoryKey, refDate = new Date()) {
  const band = AGE_BANDS.find((b) => b.key === categoryKey);
  if (!band) return null;

  const today = new Date(refDate);
  today.setHours(23, 59, 59, 999);

  if (band.max === Infinity) {
    const cutoff = new Date(today);
    cutoff.setFullYear(today.getFullYear() - band.min);
    return { $lte: cutoff };
  }

  const upper = new Date(today);
  upper.setFullYear(today.getFullYear() - band.min);

  const lower = new Date(today);
  lower.setFullYear(today.getFullYear() - (band.max + 1));

  return { $gt: lower, $lte: upper };
}


export function minorQueryByBirthDateOrLegacy(refDate = new Date(), options = {}) {
  const { includeDeceased = false } = options;
  const cutoff18 = new Date(refDate);
  cutoff18.setFullYear(cutoff18.getFullYear() - 18);

  const query = {
    $or: [
      // ✅ nuevos: con birthDate -> minor si nació después del cutoff
      { birthDate: { $gt: cutoff18 } },

      // ✅ legacy: sin birthDate -> usamos age guardada
      { birthDate: { $exists: false }, age: { $lt: 18 } },
      { birthDate: null, age: { $lt: 18 } },
    ],
  };
  if (!includeDeceased) {
    query.isDeceased = { $ne: true }; // si está fallecido, ya no cuenta como minor
  }

  return query;
}


export const normBmiCat = (v) => {
  if (!v) return undefined;
  const s = String(v).trim().toLowerCase();
  if (s === "all") return undefined;
  if (["underweight","healthy","overweight"].includes(s)) return s;
  // alias comunes
  if (["normal","healthy weight","healthy-weight","healthy_weight"].includes(s)) return "healthy";
  if (["low","under weight","under-weight","under_weight"].includes(s)) return "underweight";
  if (["high","over weight","over-weight","over_weight"].includes(s)) return "overweight";
  return undefined;
};


// === Helpers internos para snapshot de salud del paciente ===

export function buildHealthSnapshotFromPatients(pats, email) {
  if (!pats.length) {
    return { hasRecords: false, snapshot: null };
  }

  pats = pats.map((p) => applyDynamicAgeToPatient(p));


  // pats ya viene ordenado por updatedAt DESC
  const latest = pats[0];

  // Helper para campos escalares: age, gender, etc.
   const pickScalar = (field) => {
    // valores “crudos”
    const rawValues = pats
      .map((p) => p[field])
      .filter(
        (v) =>
          v !== null &&
          v !== undefined &&
          String(v).trim() !== ""
      )
      .map((v) => (typeof v === "string" ? v.trim() : v));

    let values = [...new Set(rawValues)];

    // 🔹 Para campos numéricos con tolerancia (heightM, weightKg)
    if (field === "heightM" || field === "weightKg") {
      const nums = values.filter(
        (v) => typeof v === "number" && !Number.isNaN(v)
      );

      if (nums.length) {
        const tol = field === "heightM" ? 0.005 : 0.1; // misma tolerancia que hasNumericConflict
        const uniq = [];

        for (const v of nums) {
          const isClose = uniq.some((u) => Math.abs(u - v) <= tol);
          if (!isClose) uniq.push(v);
        }

        values = uniq;
      }
    }

    return {
      value: values[0] ?? null,
      conflict: values.length > 1,
      alternatives: values,
    };
  };


   const normalizeArr = (arr) =>
    (arr || [])
      .map((v) => String(v || "").trim())
      .filter(Boolean);

  // Helper para arrays (unión sin duplicados)
  const collectArray = (field) => {
    const set = new Set();
    for (const p of pats) {
      normalizeArr(p[field]).forEach((vv) => set.add(vv));
    }
    return Array.from(set);
  };

  // Intersección: elementos que TODOS los doctores comparten
  const intersectArray = (field) => {
    if (!pats.length) return [];
    let base = new Set(normalizeArr(pats[0][field]));
    for (let i = 1; i < pats.length; i++) {
      const current = new Set(normalizeArr(pats[i][field]));
      base = new Set([...base].filter((v) => current.has(v)));
    }
    return Array.from(base);
  };

  // ¿Los doctors tienen listas diferentes para este campo?
  const hasArrayConflict = (field) => {
    if (pats.length <= 1) return false;

    const normalized = pats.map((p) => normalizeArr(p[field]));

    const first = new Set(normalized[0]);

    for (let i = 1; i < normalized.length; i++) {
      const s = new Set(normalized[i]);
      if (s.size !== first.size) return true;
      for (const v of first) {
        if (!s.has(v)) return true;
      }
    }
    return false;
  };


const hasNumericConflict = (field) => {
  const vals = pats
    .map((p) => p[field])
    .filter((v) => typeof v === "number" && !Number.isNaN(v));

  if (vals.length <= 1) return false;

  const min = Math.min(...vals);
  const max = Math.max(...vals);

  // Tolerancias:
  // - heightM: ~0.5 cm
  // - weightKg: ~0.1 kg (~0.22 lb)
  let tol = 0;
  if (field === "heightM") {
    tol = 0.005;
  } else if (field === "weightKg") {
    tol = 0.1;
  }

  return max - min > tol;
};


// Historial de location completo (country/state/city)
  const collectLocationHistory = () => {
    const seen = new Set();
    const list = [];
    for (const p of pats) {
      const c = (p.country || "").toString().trim();
      const s = (p.state || "").toString().trim();
      const ci = (p.city || "").toString().trim();
      const key = `${c}||${s}||${ci}`;
      if (!c && !s && !ci) continue;
      if (!seen.has(key)) {
        seen.add(key);
        list.push({
          country: c || null,
          state: s || null,
          city: ci || null,
        });
      }
    }
    return list;
  };

  // Wrapper especial para status (Alive/Deceased) basado en isDeceased
  const pickStatus = () => {
    const seen = new Set();
    const vals = [];
    for (const p of pats) {
      if (typeof p.isDeceased !== "boolean") continue;
      if (!seen.has(p.isDeceased)) {
        seen.add(p.isDeceased);
        vals.push(p.isDeceased);
      }
    }
    return {
      value: vals.length ? vals[0] : null,
      conflict: vals.length > 1,
      alternatives: vals,
    };
  };


  const snapshot = {
    fullname: latest.fullname,
    email,
    ageCategory: latest.ageCategory,
    isDeceased: latest.isDeceased,
    birthDate: latest.birthDate,
    dateOfDeath: latest.dateOfDeath,
    causeOfDeath: latest.causeOfDeath,

    // Scalars con info de conflicto
    fullnameWrapper: pickScalar("fullname"),
    status: pickStatus(),
    age: pickScalar("age"),
    gender: pickScalar("gender"),
    country: pickScalar("country"),
    state: pickScalar("state"),
    city: pickScalar("city"),
    birthCountry: pickScalar("birthCountry"),
    birthState: pickScalar("birthState"),
    birthCity: pickScalar("birthCity"),
    phone: pickScalar("phone"),
    phoneCountry: pickScalar("phoneCountry"),
    phoneCountryIso: pickScalar("phoneCountryIso"),
    bloodtype: pickScalar("bloodtype"),
    organDonor: pickScalar("organDonor"),
    bloodDonor: pickScalar("bloodDonor"),

    // 🔹 Wrappers numéricos para poder mostrar versiones previas
    heightWrapper: pickScalar("heightM"),
    weightWrapper: pickScalar("weightKg"),
    bmiWrapper: pickScalar("bmi"),
    measurementSystemWrapper: pickScalar("measurementSystem"),
    

    // Antropometría (tomada del registro más reciente)
    measurementSystem: latest.measurementSystem,
    heightM: latest.heightM,
    weightKg: latest.weightKg,
    bmi: latest.bmi,
    bmiCategory: latest.bmiCategory,

     // Historial de locations distintos
    locationHistory: collectLocationHistory(),

    // Flags de conflicto para antropometría
    heightConflict: hasNumericConflict("heightM"),
    weightConflict: hasNumericConflict("weightKg"),


    // Arrays: lista del doctor más reciente (esta es la versión que aprobarías)
    diseases: Array.isArray(latest.diseases) ? latest.diseases : [],
    allergies: Array.isArray(latest.allergies) ? latest.allergies : [],
    medications: Array.isArray(latest.medications) ? latest.medications : [],

    // Listas combinadas de TODOS los doctores (solo para info/conflictos)
    diseasesCombined: collectArray("diseases"),
    allergiesCombined: collectArray("allergies"),
    medicationsCombined: collectArray("medications"),

    // Listas "comunes": lo que TODOS los doctores comparten (sirve como versión anterior)
    commonDiseases: intersectArray("diseases"),
    commonAllergies: intersectArray("allergies"),
    commonMedications: intersectArray("medications"),

    diseasesConflict: hasArrayConflict("diseases"),
    allergiesConflict: hasArrayConflict("allergies"),
    medicationsConflict: hasArrayConflict("medications"),

    


    // Info de origen, para poder aprobar/rechazar por doctor
    sources: pats.map((p) => ({
      id: p._id.toString(),
      doctorId: p.createdBy?.toString?.() ?? p.createdBy,
      updatedAt: p.updatedAt,
    })),
  };

  return { hasRecords: true, snapshot };
}

export async function computeHealthSnapshotByEmail(email) {
  //const pats = await Patient.find({ email })
  const normalized = String(email).toLowerCase().trim();
  const pats = await Patient.find({ email: normalized })
    .sort({ updatedAt: -1 })
    .populate("createdBy", "name email")
    .lean();

  const base = buildHealthSnapshotFromPatients(pats, normalized);
  return { ...base, pats };
}

/*export async function hasPendingHealthDecisionForEmail(email) {
  if (!email) return false;

  // 1) ¿Existe un usuario portal-paciente con ese correo?
  const user = await User.findOne({ email, role: "patient" })
    .select("lastHealthDecisionAt")
    .lean();
  if (!user) return false; // si no hay portal, no bloqueamos

  // 2) ¿Hay perfiles Patient para ese email?
  const pats = await Patient.find({ email })
    .sort({ updatedAt: -1 })
    .select("_id updatedAt")
    .lean();
  if (!pats.length) return false; // ningún perfil aún → no hay bloqueo

  const latestUpdate = pats[0]?.updatedAt
    ? new Date(pats[0].updatedAt).getTime()
    : NaN;
  const lastDecision = user.lastHealthDecisionAt
    ? new Date(user.lastHealthDecisionAt).getTime()
    : NaN;

  if (!Number.isFinite(latestUpdate)) return false;

  // Nunca ha decidido nada y ya hay registros → hay algo pendiente
  if (!Number.isFinite(lastDecision)) return true;

  // Si hay un Patient más nuevo que la última decisión → sigue pendiente
  return latestUpdate > lastDecision;
}*/

export async function hasPendingHealthDecisionForEmail(email) {
  // ✅ Menor sin correo => nunca bloquees
  if (!email) return false;

  const normalized = String(email).toLowerCase().trim();

  // 1) Debe existir al menos 1 Patient con ese email (si no, no hay nada que bloquear)
  const pats = await Patient.find({ email: normalized })
    .sort({ updatedAt: -1 })
    .select("_id updatedAt")
    .lean();

  if (!pats.length) return false;

  const latestUpdate = pats[0]?.updatedAt
    ? new Date(pats[0].updatedAt).getTime()
    : NaN;

  if (!Number.isFinite(latestUpdate)) return false;

  // 2) Buscar usuario portal-paciente
  const user = await User.findOne({ email: normalized, role: "patient" })
    .select("lastHealthDecisionAt")
    .lean();

  // ✅ Si NO hay user: asumimos que nunca aprobó nada => 0 => bloquea si hay registro Patient
  const lastDecision = user?.lastHealthDecisionAt
    ? new Date(user.lastHealthDecisionAt).getTime()
    : 0;

  // 3) Si hay cambios después de la última decisión (o nunca decidió), bloquea
  return latestUpdate > lastDecision;
}


export function identityQueryFromPatient(p) {
  if (p?.email) return { patientEmail: String(p.email).toLowerCase().trim() };
  if (p?.phoneDigits) return { patientPhoneDigits: String(p.phoneDigits).trim() };
  return null;
}

export const normStr = (v) => String(v ?? "").trim();
export const normLower = (v) => normStr(v).toLowerCase();
export const normUpper = (v) => normStr(v).toUpperCase();
export const arrKey = (v) => normalize(v).slice().sort().join("||");
export const near = (a, b, eps = 0.005) => Math.abs(Number(a) - Number(b)) <= eps;

export const getLang = (req) => (req.query.lang || "").trim();


// === FAMILY HELPERS ===
export const normNameKey = (v) =>
  String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

export function sanitizeChildren(childrenLike) {
  if (!Array.isArray(childrenLike)) return [];
  const out = [];
  const seen = new Set();
  for (const c of childrenLike) {
    const nameRaw = typeof c === "string" ? c : c?.name;
    const name = String(nameRaw ?? "").trim().replace(/\s+/g, " ");
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name });
  }
  return out;
}

export function parseChildrenCount(v) {
  if (v === null || typeof v === "undefined" || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}
// =======================
export const minorKeyOf = (parentEmail, childFullname) => {
  const pe = normLower(parentEmail);
  const nk = normNameKey(childFullname); // <--- CORRECCIÓN (usa la función exportada)
  return pe && nk ? `${pe}::${nk}` : "";
};

export async function hasPendingGuardianDecisionForMinorKey(minorKey, parentEmail) {
  const mk = normLower(minorKey);
  const pe = normLower(parentEmail);
  if (!mk || !pe) return false;

  const latest = await Patient.findOne({
    parentEmail: pe,
    minorKey: mk,
    ...minorQueryByBirthDateOrLegacy(new Date(), { includeDeceased: true }),
  })
    .sort({ updatedAt: -1 })
    .select("updatedAt approvedAt")
    .lean();

  if (!latest) return false;
  if (!latest.approvedAt) return true;

  return new Date(latest.updatedAt).getTime() > new Date(latest.approvedAt).getTime();
}

export async function computeHealthSnapshotByMinorKey(minorKey, parentEmail) {
  const mk = normLower(minorKey);
  const pe = normLower(parentEmail);

  const pats = await Patient.find({
    parentEmail: pe,
    minorKey: mk,
    ...minorQueryByBirthDateOrLegacy(new Date(), { includeDeceased: true }),
  })
    .sort({ updatedAt: -1 })
    .populate("createdBy", "name email role")
    .lean({ virtuals: true });

  if (!pats.length) return { hasRecords: false, snapshot: null, patients: [] };

  // reutiliza tu helper existente
  const base = buildHealthSnapshotFromPatients(pats, null);
  return { ...base, patients: pats };
}
export const t = (d) => (d ? new Date(d).getTime() : null);


// ✅ YYYY-MM-DD helpers (date-only sin desfase)
export const isYmd = (s) =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const ymdUTC = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// Guardamos date-only como UTC noon para evitar que al verlo en local “se vaya al día anterior”
export const parseYmdToUtcNoon = (ymd) => {
  const [y, m, d] = String(ymd).split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
};
