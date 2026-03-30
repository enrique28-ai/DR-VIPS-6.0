// controllers/patient.controller.js
import Patient from "../models/Patient.js";
import Diagnosis from "../models/Diagnosis.js";
//import dns from "node:dns/promises";
import User from "../models/User.js";
import {
  normPhoneWithCountry,
  normalize,
  toBool,
  normGender,
  verifyEmail,
  computeHealthSnapshotByEmail,
  hasPendingHealthDecisionForEmail,
  FT_TO_M,
  LB_TO_KG,
  buildHealthSnapshotFromPatients,
  identityQueryFromPatient,
  normStr,
  normLower,
  normUpper,
  arrKey,
  near,
  sanitizeChildren,
  normNameKey,
  parseChildrenCount,
   minorKeyOf,
  hasPendingGuardianDecisionForMinorKey,
  computeHealthSnapshotByMinorKey,
  computeDynamicAge,
  mapAgeToBand,
  applyDynamicAgeToPatient,
  applyDynamicAgeToSnapshotSet,
  minorQueryByBirthDateOrLegacy,
  t,
  isYmd,
  ymdUTC,
  parseYmdToUtcNoon,
} from "./helpers/patienthelpers.js";
import PatientHistory from "../models/PatientHistory.js";

import {
  getMyHistoryService,
  getPatientHistoryService,
  getPatientHistoryOneService,
  getMyHistoryOneService,
  getChildHistoryService,
  getChildHistoryOneService,
} from "../services/patients/patientHistoryService.js";
import {
  getPatientByIdService,
  getGlobalPatientPreviewService,
  searchGlobalPatientsService,
  importPatientService,
} from "../services/patients/patientReadService.js";
import { getMyPatientsService } from "../services/patients/patientListService.js";
import {
  getMyHealthInfoService,
  getMyChildrenHealthInfoService,
} from "../services/patients/patientPortalService.js";
import { approvePatientProfileService } from "../services/patients/patientApprovalService.js";
/**
 * Crear paciente
 */
export const createPatient = async (req, res) => {
  try {
    const { fullname, diseases, allergies, medications, email, phone, age, bloodtype, gender, organDonor: organIn, bloodDonor: bloodIn, 
      measurementSystem, height, weight, country, state, city, children, childrenCount, parentEmail, birthDate
    } = req.body;

    const gRaw = normGender(gender);
    const isValidGender = gRaw === "male" || gRaw === "female";
    const hasOrgan = typeof organIn  !== "undefined";
    const hasBlood = typeof bloodIn  !== "undefined";


    // ✅ birthDate obligatorio para nuevos pacientes
if (birthDate === undefined || birthDate === null || birthDate === "") {
  return res.status(400).json({ errorCode: "BIRTHDATE_REQUIRED" });
}

let parsedBirthDate = null;

if (birthDate !== undefined && birthDate !== null && birthDate !== "") {
  parsedBirthDate = isYmd(birthDate) ? parseYmdToUtcNoon(birthDate) : new Date(birthDate);

  if (Number.isNaN(parsedBirthDate.getTime())) {
    return res.status(400).json({ errorCode: "INVALID_BIRTHDATE" });
  }

  // ✅ compara por “día”, no por hora
  if (ymdUTC(parsedBirthDate) > ymdUTC(new Date())) {
    return res.status(400).json({ errorCode: "BIRTHDATE_IN_FUTURE" });
  }
}


const ageNum = computeDynamicAge({ birthDate: parsedBirthDate, age: Number(age) });
if (!Number.isFinite(ageNum) || ageNum < 0 || ageNum > 120) {
  return res.status(400).json({ errorCode: "INVALID_AGE" });
}
const isMinor = ageNum < 18;

    if (
      !fullname ||
      (!isMinor && (!email || !phone)) ||
       !bloodtype || !isValidGender
      || !hasOrgan || !hasBlood || !measurementSystem || !height || !weight || !country ||!state||!city
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // —— Validación antropométrica (tu schema requiere heightM/weightKg) ——
    if (measurementSystem == null || height == null || weight == null) {
      return res.status(400).json({ error: "Provide measurementSystem, height and weight" });
    }
    const sys = String(measurementSystem).toLowerCase();
    const H = Number(height);
    const W = Number(weight);
    if (!["metric","imperial"].includes(sys) || !(H > 0) || !(W > 0)) {
      return res.status(400).json({ error: "Invalid anthropometric payload" });
    }
    const heightM  = sys === "metric" ? H : H * FT_TO_M;
    const weightKg = sys === "metric" ? W : W * LB_TO_KG;
    
    const organDonor = toBool(organIn);
    const bloodDonor = toBool(bloodIn);

    // === FAMILY BUSINESS RULES ===
// Adults: can optionally declare children. If they send children/childrenCount, both are validated.
// Minors: must send parentEmail; parent must exist and must list the minor name in their children list.

// Minors cannot declare children.
if (isMinor && (typeof children !== "undefined" || typeof childrenCount !== "undefined")) {
      return res.status(400).json({ 
        errorCode: "MINOR_CANNOT_DECLARE_CHILDREN",
        error: "Minors cannot declare children." 
      });
    }

let finalChildren = [];
let finalChildrenCount = 0;
let finalParentEmail = undefined;

if (!isMinor) {
  const wantsChildren =
    typeof children !== "undefined" || typeof childrenCount !== "undefined";

  if (wantsChildren) {
        const n = parseChildrenCount(childrenCount);
        if (n === null) {
          return res.status(400).json({ 
            errorCode: "CHILDREN_COUNT_INVALID",
            error: "childrenCount must be an integer >= 0" 
          });
        }
        if (typeof n === "undefined") {
          return res.status(400).json({ 
            errorCode: "CHILDREN_COUNT_REQUIRED",
            error: "childrenCount is required when declaring children" 
          });
        }

    if (n === 0) {
      finalChildren = [];
      finalChildrenCount = 0;
    } else {
      const list = sanitizeChildren(children);
     if (list.length !== n) {
            return res.status(400).json({
              errorCode: "CHILDREN_COUNT_MISMATCH",
              error: "children must include the name of each child and match childrenCount",
            });
          }
      finalChildren = list;
      finalChildrenCount = n;
    }
  }
}

if (isMinor) {
      const peIn = normLower(parentEmail);
      if (!peIn) {
        return res.status(400).json({
          errorCode: "PARENT_EMAIL_REQUIRED",
          error: "Parent email is required to create a minor patient.",
        });
      }

  finalParentEmail = peIn;
  const parentEmailCheck = await verifyEmail(finalParentEmail);
  if (!parentEmailCheck.ok) {
    return res.status(400).json({ error: parentEmailCheck.error });
  }

  const parentDoc = await Patient.findOne({ email: finalParentEmail })
  .select("_id age children approvedAt approvedSnapshot")
  .lean();

if (!parentDoc) {
  return res.status(403).json({
    errorCode: "PARENT_NOT_FOUND",
    error: "Access denied: parent email not found in the system.",
  });
}

if (!(Number(parentDoc.age) >= 18)) {
  return res.status(403).json({
    errorCode: "PARENT_NOT_ADULT",
    error: "Access denied: parent record must be an adult.",
  });
}

// ✅ NEW: Parent must have approved at least their first version
if (!parentDoc.approvedAt) {
  return res.status(403).json({
    errorCode: "PARENT_NOT_APPROVED",
    error: "Access denied: the parent/tutor must approve their profile before registering minors.",
  });
}

const childKey = normNameKey(fullname);
const snap = parentDoc.approvedSnapshot;
const parentChildren =
  Array.isArray(snap?.set?.children) ? snap.set.children :
  Array.isArray(snap?.children) ? snap.children :
  (Array.isArray(parentDoc.children) ? parentDoc.children : []);

const isListed = parentChildren.some((c) => {
  const cName = typeof c === "string" ? c : c?.name;
  return normNameKey(cName) === childKey;
});

if (!isListed) {
  return res.status(403).json({
    errorCode: "MINOR_NOT_LISTED",
    error: "Access denied: minor name is not listed in the parent's children list.",
  });
}
}

   let mk;

if (isMinor) {
  mk = minorKeyOf(finalParentEmail, fullname);
  if (!mk) {
    return res.status(400).json({ errorCode: "MINOR_KEY_INVALID" });
  }

  const lockedMinor = await hasPendingGuardianDecisionForMinorKey(mk, finalParentEmail);
  if (lockedMinor) {
    return res.status(409).json({ errorCode: "PENDING_GUARDIAN_DECISION" });
  }
}


// ============================


     // Email: validar si viene o si es adulto
    let normalizedEmail;
    if (email) {
      const emailCheck = await verifyEmail(email);
      if (!emailCheck.ok) return res.status(400).json({ error: emailCheck.error });
      normalizedEmail = String(email).toLowerCase().trim();
    } else if (!isMinor) {
      return res.status(400).json({ error: "Email is required for adults" });
    }

    // Phone: validar si viene o si es adulto
    let ph = { ok: true, phone: undefined, digits: undefined };
    if (phone) {
      ph = normPhoneWithCountry(country, phone);
      if (!ph.ok) return res.status(400).json({ error: ph.error });
    } else if (!isMinor) {
      return res.status(400).json({ error: "Phone is required for adults" });
    }

    if (normalizedEmail) {
      const existing = await Patient.findOne({ email: normalizedEmail })
        .select("_id createdBy")
        .lean();

      if (existing) {
        return res.status(409).json({
          errorCode: "PATIENT_EMAIL_EXISTS",
          error:
            "A patient with this email already exists in the global database. Please use 'Search Global' to import them.",
          // opcional, por si luego quieres navegar al detalle (aunque hoy el createdBy lo bloquearía)
          patientId: existing._id,
        });
      }
    }

        // 🔒 Control: si el paciente ya tiene una versión pendiente en el portal,
    // ningún doctor puede crear otro perfil hasta que el paciente decida.
    if (normalizedEmail) {
      const locked = await hasPendingHealthDecisionForEmail(normalizedEmail);
      if (locked) {
        return res.status(409).json({
        errorCode: "PENDING_PORTAL",
        error:
        "This patient has a pending profile in the portal. Wait until the patient approves or rejects it before creating a new version.",
    });
      }

    }


    const doc = await Patient.create({
      fullname, diseases: normalize(diseases), allergies: normalize(allergies), medications: normalize(medications), ...(normalizedEmail ? { email: normalizedEmail } : {}), bloodtype,  gender: gRaw, 
      organDonor, bloodDonor, isDeceased: false, ...(ph.phone ? { phone: ph.phone, phoneDigits: ph.digits } : {}), 
      causeOfDeath: undefined, measurementSystem: sys, heightM, weightKg, country: String(country).trim(), state: String(state).trim(), city: String(city).trim(),
       createdBy: req.user._id,owners: [req.user._id],
      lastEditedBy: req.user._id,
      // NEW: cachea exactamente lo que tecleó el usuario
      originalAnthro: { system: sys, height: H, weight: W },
      children: finalChildren,
      childrenCount: finalChildrenCount,
      parentEmail: finalParentEmail,
      ...(isMinor ? { minorKey: mk } : {}),
      birthDate: parsedBirthDate,
      age: ageNum,
      ageCategory: mapAgeToBand(ageNum),

    });

    return res.status(201).json(applyDynamicAgeToPatient(doc.toObject({ virtuals: true })));
  } catch (err) {
    // índices únicos compuestos (createdBy+email/phone/fullname) -> E11000
   if (err?.code === 11000) {
  const isEmailDup = !!err?.keyPattern?.email || !!err?.keyValue?.email;
  return res.status(409).json({
    errorCode: isEmailDup ? "PATIENT_EMAIL_EXISTS" : "PATIENT_DUPLICATE",
    error: isEmailDup
      ? "A patient with this email already exists."
      : "Duplicate patient data.",
  });
}

    console.error("createPatient error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * Listar mis pacientes (búsqueda + filtros + paginación)
 * GET /api/patients?category=0-12|13-17|18-59|60+&q=&page=&limit=
 */
export const getMyPatients = async (req, res) => {
  try {
    const data = await getMyPatientsService({
      user: req.user,
      queryParams: req.query,
    });
     return res.json(data);
  } catch (err) {
    console.error("getMyPatients error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Server error",
    });
  }
};

/**
 * Búsqueda Global de Pacientes (excluye los que ya tienes)
 * GET /api/patients/global-search?q=...
 */
export const searchGlobalPatients = async (req, res) => {
  try {
    const data = await searchGlobalPatientsService({
      user: req.user,
      term: req.query.q,
    });
    return res.json(data);
  } catch (err) {
    console.error("searchGlobalPatients error:", err);
     return res.status(err.status || 500).json({
      error: err.message || "Server error",
    });
  }
};

/**
 * Preview (Read-only) para importar
 * GET /api/patients/global/:id
 */
export const getGlobalPatientPreview = async (req, res) => {
  try {
    const data = await getGlobalPatientPreviewService({
      user: req.user,
      patientId: req.params.id,
    });
    return res.json(data);
  } catch (err) {
    console.error("getGlobalPatientPreview error:", err);
     return res.status(err.status || 500).json({
      error: err.message || "Server error",
    });
  }
};

/**
 * Importar paciente a mi lista
 * POST /api/patients/import/:id
 */
/*export const importPatient = async (req, res) => {
  try {
    const patientId = req.params.id;

    const base = await Patient.findById(patientId).select("_id createdBy owners").lean();
    if (!base) return res.status(404).json({ error: "Patient not found" });

    const updated = await Patient.findByIdAndUpdate(
      patientId,
      { $addToSet: { owners: { $each: [req.user._id, base.createdBy] } } },
      { new: true }
    ).lean({ virtuals: true });

    return res.json({ message: "Patient imported successfully", patient: updated });
  } catch (err) {
    console.error("importPatient error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};*/

export const importPatient = async (req, res) => {
  try {
    const data = await importPatientService({
      user: req.user,
      patientId: req.params.id,
    });
    return res.json(data);
  } catch (err) {
    console.error("importPatient error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Server error",
    });
  }
};



/**
 * Obtener paciente por id
 */
export const getPatientById = async (req, res) => {
  try {
    const data = await getPatientByIdService({
      user: req.user,
      patientId: req.params.id,
      lang: (req.query.lang || "").trim(),
    });
    return res.json(data);
  } catch (err) {
    console.error("getPatientById error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Server error",
    });
  }
};

/**
 * Actualizar paciente
 */
export const updatePatient = async (req, res) => {
  try {
    const { fullname, diseases, allergies, medications, email, phone, age, bloodtype,  gender, organDonor: organIn, bloodDonor: bloodIn,
       measurementSystem, height, weight, heightM, weightKg,  country,state, city, children, childrenCount, parentEmail,  birthDate, dateOfDeath,

     } = req.body;

     // Leemos el doc actual para validar regla adulto/menor
     const accessQuery = {
  _id: req.params.id,
  $or: [{ owners: req.user._id }, { createdBy: req.user._id }],
};

const current = await Patient.findOne(accessQuery).lean();
if (!current) return res.status(404).json({ error: "Patient not found" });

   // const current = await Patient.findOne({ _id: req.params.id, createdBy: req.user._id }).lean();
   /*const current = await Patient.findOne({
  _id: req.params.id,
  $or: [{ owners: req.user._id }, { createdBy: req.user._id }],
  }).lean();
    if (!current) return res.status(404).json({ error: "Patient not found" });*/
        // 🔒 Control: si este paciente tiene una versión pendiente en el portal,
    // ningún doctor (ni siquiera el que lo creó) puede editar hasta que el paciente decida.
    if (current.email) {
      const locked = await hasPendingHealthDecisionForEmail(current.email);
      if (locked) {
        return res.status(409).json({
          error:
            "This patient has a pending profile in the portal. Wait until the patient approves or rejects it before editing.",
        });
      }
    }

    //const update = {};
    const update = { lastEditedBy: req.user._id };
    const unset = {};

    if ("dateOfDeath" in req.body && !("isDeceased" in req.body)) {
  return res.status(400).json({ errorCode: "SEND_ISDECEASED_WITH_DATEOFDEATH" });
}


const nextIsDeceased = ("isDeceased" in req.body)
  ? toBool(req.body.isDeceased)
  : !!current.isDeceased;

let nextBirthDate = current.birthDate;
if ("birthDate" in req.body) {
  // (si NO quieres permitir borrar birthDate, deja esto como error si viene "")
  const raw = req.body.birthDate;

  const bd = isYmd(raw) ? parseYmdToUtcNoon(raw) : new Date(raw);
  if (Number.isNaN(bd.getTime())) return res.status(400).json({ errorCode: "INVALID_BIRTHDATE" });
  if (ymdUTC(bd) > ymdUTC(new Date())) return res.status(400).json({ errorCode: "BIRTHDATE_IN_FUTURE" });

  nextBirthDate = bd;
  update.birthDate = bd;
}

let nextDoD = current.dateOfDeath;

// ✅ soporta clear del datepicker ("" o null)
if ("dateOfDeath" in req.body) {
  const raw = req.body.dateOfDeath;

  if (raw === "" || raw === null) {
    nextDoD = null;
    unset.dateOfDeath = 1;
    delete update.dateOfDeath;
  } else {
    const dd = isYmd(raw) ? parseYmdToUtcNoon(raw) : new Date(raw);
    if (Number.isNaN(dd.getTime())) {
      return res.status(400).json({ errorCode: "INVALID_DATE_OF_DEATH" });
    }
    nextDoD = dd;
    update.dateOfDeath = dd;
    delete unset.dateOfDeath;
  }
}

if (nextIsDeceased) {
  // ✅ si lo marcan fallecido y no hay dateOfDeath, congélalo “hoy”
  if (!nextDoD) {
    nextDoD = new Date();        // fecha/hora real del sistema
    update.dateOfDeath = nextDoD;
    delete unset.dateOfDeath;
  }

  // ✅ NO future (por día)
  if (ymdUTC(nextDoD) > ymdUTC(new Date())) {
    return res.status(400).json({ errorCode: "DATE_OF_DEATH_IN_FUTURE" });
  }

  // ✅ death >= birth
  if (nextBirthDate && ymdUTC(nextDoD) < ymdUTC(nextBirthDate)) {
    return res.status(400).json({ errorCode: "DATE_OF_DEATH_BEFORE_BIRTHDATE" });
  }
} else {
  // ✅ si vuelve a vivo, limpia dateOfDeath (recomendado)
  if (current.dateOfDeath && !("dateOfDeath" in req.body)) {
    unset.dateOfDeath = 1;
  }
}


const nextAge = computeDynamicAge({
  birthDate: nextBirthDate,
  isDeceased: nextIsDeceased,
  dateOfDeath: nextDoD,
  age: current.age
});

const isMinorNext = Number.isFinite(nextAge) && nextAge < 18;

// si doctor corrige birthDate o death -> sincroniza stored age/ageCategory
if ("birthDate" in req.body || "dateOfDeath" in req.body || "isDeceased" in req.body) {
  update.age = nextAge;
  update.ageCategory = mapAgeToBand(nextAge);
}

    if (typeof fullname !== "undefined" && !isMinorNext) update.fullname = fullname;
    if (typeof diseases  !== "undefined") update.diseases  = normalize(diseases);
    if (typeof allergies  !== "undefined") update.allergies  = normalize(allergies);
    if (typeof medications  !== "undefined") update.medications  = normalize(medications);
    if (typeof bloodtype !== "undefined") update.bloodtype = bloodtype;

    // === FAMILY BUSINESS RULES ===
// Adults (>=18): if children/childrenCount is sent, it must be consistent.
// Minors (<18): parentEmail is required (either already saved or sent now), and
// the parent's children list must include the minor fullname.

if (isMinorNext) {
  if ("fullname" in req.body) {
    const incomingNameKey = normNameKey(fullname);
    const currentNameKey = normNameKey(current.fullname);
    if (incomingNameKey && currentNameKey && incomingNameKey !== currentNameKey) {
      return res.status(400).json({ errorCode: "MINOR_FULLNAME_IMMUTABLE" });
    }
  }

   if ("parentEmail" in req.body && current.parentEmail) {
    const incomingPE = normLower(parentEmail);        // can be "" if they try to delete
    const currentPE  = normLower(current.parentEmail);

    if (!incomingPE || incomingPE !== currentPE) {
      return res.status(400).json({
        errorCode: "PARENT_EMAIL_IMMUTABLE",
        error: "You cannot modify or remove the parent email once it is registered.",
      });
    }
  }
}

const nextFullname = "fullname" in update ? update.fullname : current.fullname;

const currentAgeDyn = computeDynamicAge(current);
const isCurrentMinor = Number.isFinite(currentAgeDyn) && currentAgeDyn < 18 && current.parentEmail;

if (isCurrentMinor) {
  const mk = current.minorKey || minorKeyOf(current.parentEmail, current.fullname);
  const lockedMinor = await hasPendingGuardianDecisionForMinorKey(mk, current.parentEmail);
  if (lockedMinor) {
    return res.status(409).json({ errorCode: "PENDING_GUARDIAN_DECISION" });
  }
}


// Children updates (adults only)
// Children updates (adults only): ✅ can only ADD, cannot remove or rename existing
const wantsChildrenUpdate = ("children" in req.body) || ("childrenCount" in req.body);

if (wantsChildrenUpdate) {
  if (isMinorNext) {
    return res.status(400).json({
      errorCode: "MINOR_CANNOT_DECLARE_CHILDREN",
      error: "Minors cannot declare children.",
    });
  }

  const curChildren = Array.isArray(current.children) ? current.children : [];
  const lockedCount = curChildren.length;

  const nextCountParsed = ("childrenCount" in req.body)
    ? parseChildrenCount(childrenCount)
    : undefined;

  if (("childrenCount" in req.body) && nextCountParsed === null) {
    return res.status(400).json({
      errorCode: "CHILDREN_COUNT_INVALID",
      error: "childrenCount must be an integer >= 0",
    });
  }

  // If changing count, we REQUIRE children[] so we don't create “empty slots”
  if (!("children" in req.body)) {
    if (typeof nextCountParsed === "number" && nextCountParsed !== lockedCount) {
      return res.status(400).json({
        errorCode: "CHILDREN_LIST_REQUIRED",
        error: "To change childrenCount you must send children[] with names.",
      });
    }
  } else {
    const incoming = sanitizeChildren(children);

    // childrenCount must match children[].length (if provided)
    if (typeof nextCountParsed === "number" && incoming.length !== nextCountParsed) {
      return res.status(400).json({
        errorCode: "CHILDREN_COUNT_MISMATCH",
        error: "childrenCount must match children[].length",
      });
    }

    // ❌ Cannot remove
    if (incoming.length < lockedCount) {
      return res.status(400).json({
        errorCode: "CHILDREN_COUNT_DECREASE_FORBIDDEN",
        error: "You can only add more children; removing is not allowed.",
      });
    }

    // ❌ Existing names immutable (order + normalized name)
    for (let i = 0; i < lockedCount; i++) {
      const oldKey = normNameKey(curChildren[i]?.name);
      const newKey = normNameKey(incoming[i]?.name);
      if (!newKey || oldKey !== newKey) {
        return res.status(400).json({
          errorCode: "CHILDREN_NAMES_IMMUTABLE",
          error: "Existing children names cannot be edited.",
        });
      }
    }

    update.children = incoming;
    // childrenCount se sincroniza solo por el pre('findOneAndUpdate') del modelo cuando seteas children
  }
}


// parentEmail (minors only)
if (isMinorNext) {
  const parentEmailEffective =
    "parentEmail" in req.body ? normLower(parentEmail) : normLower(current.parentEmail);

  if (!parentEmailEffective) {
        return res.status(400).json({ 
          errorCode: "PARENT_EMAIL_REQUIRED",
          error: "Parent email is required for minors." 
        });
      }

  const parentEmailCheck = await verifyEmail(parentEmailEffective);
  if (!parentEmailCheck.ok) {
    return res.status(400).json({ error: parentEmailCheck.error });
  }

  const parentDoc = await Patient.findOne({ email: parentEmailEffective })
  .select("_id age children approvedAt approvedSnapshot")
  .lean();

if (!parentDoc) {
  return res.status(403).json({
    errorCode: "PARENT_NOT_FOUND",
    error: "Access denied: parent email not found in the system."
  });
}

if (!(Number(parentDoc.age) >= 18)) {
  return res.status(403).json({
    errorCode: "PARENT_NOT_ADULT",
    error: "Access denied: parent record must be an adult."
  });
}

// ✅ NEW: Parent must have approved at least their first version
if (!parentDoc.approvedAt) {
  return res.status(403).json({
    errorCode: "PARENT_NOT_APPROVED",
    error: "Access denied: the parent/tutor must approve their profile before registering minors.",
  });
}

const childKey = normNameKey(nextFullname);
const snap = parentDoc.approvedSnapshot;
const parentChildren =
  Array.isArray(snap?.set?.children) ? snap.set.children :
  Array.isArray(snap?.children) ? snap.children : [];
  

const isListed = parentChildren.some((c) => {
  const cName = typeof c === "string" ? c : c?.name;
  return normNameKey(cName) === childKey;
});

if (!isListed) {
  return res.status(403).json({
    errorCode: "MINOR_NOT_LISTED",
    error: "Access denied: minor name is not listed in the parent's children list.",
  });
}


      // Ensure minorKey exists (migration / first time parentEmail is set)
if (!current.minorKey) {
  const newMk = minorKeyOf(parentEmailEffective, current.fullname);
  if (!newMk) return res.status(400).json({ errorCode: "MINOR_KEY_INVALID" });
  update.minorKey = newMk;
}


  // Only set if user sent it or it's missing in DB
  if ("parentEmail" in req.body || !current.parentEmail) {
    update.parentEmail = parentEmailEffective;
  }
} else {
  // Adults: parentEmail must not be set
  if ("parentEmail" in req.body) {
        return res.status(400).json({ 
          errorCode: "PARENT_EMAIL_NOT_ALLOWED",
          error: "parentEmail is only allowed for minors." 
        });
      }
  if (current.parentEmail) {
    unset.parentEmail = 1;
  }
  if (current.minorKey) {
  unset.minorKey = 1; // ✅ detach guardian access once adult
}
}



    if ("email" in req.body) {
      const e = String(req.body.email ?? "").trim().toLowerCase();

      if (current.email && current.email !== e) {
    return res.status(400).json({ 
      error: "You can not modify the email once it is registered." 
    });
      }
      if (!e) {
        if (isMinorNext) {
          unset.email = 1;
        } else {
          return res.status(400).json({ error: "Email is required for adults" });
        }
      } else {
        const emailCheck = await verifyEmail(e);
        if (!emailCheck.ok) return res.status(400).json({ error: emailCheck.error });
        update.email = e;
      }
    }

   if ("phone" in req.body) {
      const rawDigits = String(req.body.phone ?? "").replace(/\D/g, "");
      if (!rawDigits) {
        if (isMinorNext) {
          unset.phone = 1;
          unset.phoneDigits = 1;
        } else {
          return res.status(400).json({ error: "Phone is required for adults" });
        }
      } else {
        const effectiveCountry = ("country" in req.body) ? country : current.country;
        if (!effectiveCountry) return res.status(400).json({ error: "Send country together with phone" });
        const ph = normPhoneWithCountry(effectiveCountry, rawDigits);
        if (!ph.ok) return res.status(400).json({ error: ph.error });
        update.phone = ph.phone;
        update.phoneDigits = ph.digits;
      }
    }


      // Regla: si el resultado final es adulto, debe existir email y phone
   
    if (!isMinorNext) {
      const emailAfter = (typeof update.email !== "undefined") ? !!update.email : !!current.email;
      const phoneAfter = (typeof update.phone !== "undefined") ? !!update.phone : !!current.phone;
      if (!emailAfter) return res.status(400).json({ error: "Email is required for adults" });
      if (!phoneAfter) return res.status(400).json({ error: "Phone is required for adults" });
    }

    if ("country" in req.body) {
      const c = String(country ?? "").trim();
      if (!c) return res.status(400).json({ error: "Country is required" });
      update.country = c;
    }

    if ("state" in req.body) {
   const st = String(req.body.state ?? "").trim();
   if (!st) return res.status(400).json({ error: "State/Province is required" });
   update.state = st;
 }
 if ("city" in req.body) {
   const ct = String(req.body.city ?? "").trim();
   if (!ct) return res.status(400).json({ error: "City is required" });
   update.city = ct;
 }
 
    // gender: solo si viene, validar male|female
    if ("gender" in req.body) {
      const g = normGender(gender);
      if (g !== "male" && g !== "female") {
        return res.status(400).json({ error: "Invalid gender (male|female)" });
      }
      update.gender = g;
    }
    if ("organDonor" in req.body) update.organDonor = toBool(organIn);
    if ("bloodDonor" in req.body) update.bloodDonor = toBool(bloodIn);

    // NUEVO: estado de vida
    if ("isDeceased" in req.body) {
      const deceased = toBool(req.body.isDeceased);
      update.isDeceased = deceased;
      if (deceased) {
        const cod = String(req.body.causeOfDeath ?? "").trim();
        if (!cod) {
          return res.status(400).json({ error: "Cause of death is required when marking patient as deceased" });
        }
        update.causeOfDeath = cod;
      } else {
        // Si vuelve a vivo, limpiamos la causa
        //update.causeOfDeath = undefined;
        unset.causeOfDeath = 1;
        delete update.causeOfDeath;
      }
    } else if ("causeOfDeath" in req.body) {
      // Solo acepta actualizar/limpiar causa si también llega isDeceased=true en este mismo request.
      // (Evita inconsistencias)
      return res.status(400).json({ error: "Send isDeceased together with causeOfDeath" });
    }

    // —— NUEVO: edición de antropometría coherente ——
    const touchSys = typeof measurementSystem !== "undefined";
    const touchH   = typeof height !== "undefined";
    const touchW   = typeof weight !== "undefined";
    if (touchSys || touchH || touchW) {
      if (!(touchSys && touchH && touchW)) {
        return res.status(400).json({ error: "To update anthropometrics send measurementSystem, height and weight together" });
      }
      // Pasamos tal cual; tu pre('findOneAndUpdate') convertirá a m/kg y recalculará BMI
      update.measurementSystem = measurementSystem;
      update.height = height;
      update.weight = weight;
    } else {
      // Alternativa: actualizar directo en canónico
      if (typeof heightM  !== "undefined") update.heightM  = heightM;
      if (typeof weightKg !== "undefined") update.weightKg = weightKg;
    }
// --- CHANGE DETECTION ---
// Si no hay cambios reales, regresamos 400 + errorCode NO_CHANGES
let changesFound = false;

// 1) Unsets: solo cuentan si el campo existía
for (const k of Object.keys(unset)) {
  if (typeof current[k] !== "undefined") {
    changesFound = true;
    break;
  }
}



// 2) Sets (comparación campo por campo)
if (!changesFound) {
  // Arrays
  if ("diseases" in update && arrKey(update.diseases) !== arrKey(current.diseases)) changesFound = true;
  if ("allergies" in update && arrKey(update.allergies) !== arrKey(current.allergies)) changesFound = true;
  if ("medications" in update && arrKey(update.medications) !== arrKey(current.medications)) changesFound = true;

  if ("children" in update) {
  const u = Array.isArray(update.children) ? update.children.map((c) => normNameKey(c?.name)) : [];
  const c = Array.isArray(current.children) ? current.children.map((x) => normNameKey(x?.name)) : [];
  if (u.join("|") !== c.join("|")) changesFound = true;
}


  // Scalars comunes
  if (!changesFound && "fullname" in update && normStr(update.fullname) !== normStr(current.fullname)) changesFound = true;
  if (!changesFound && "age" in update && Number(update.age) !== Number(current.age)) changesFound = true;
  if (!changesFound && "bloodtype" in update && normUpper(update.bloodtype) !== normUpper(current.bloodtype)) changesFound = true;
  if (!changesFound && "gender" in update && normLower(update.gender) !== normLower(current.gender)) changesFound = true;

  if (!changesFound && "organDonor" in update && Boolean(update.organDonor) !== Boolean(current.organDonor)) changesFound = true;
  if (!changesFound && "bloodDonor" in update && Boolean(update.bloodDonor) !== Boolean(current.bloodDonor)) changesFound = true;

  if (!changesFound && "country" in update && normStr(update.country) !== normStr(current.country)) changesFound = true;
  if (!changesFound && "state" in update && normStr(update.state) !== normStr(current.state)) changesFound = true;
  if (!changesFound && "city" in update && normStr(update.city) !== normStr(current.city)) changesFound = true;

  if (!changesFound && "phone" in update && normStr(update.phone) !== normStr(current.phone)) changesFound = true;
  if (!changesFound && "phoneDigits" in update && normStr(update.phoneDigits) !== normStr(current.phoneDigits)) changesFound = true;

  // Estado de vida
  if (!changesFound && "isDeceased" in update && Boolean(update.isDeceased) !== Boolean(current.isDeceased)) changesFound = true;
  if (!changesFound && "causeOfDeath" in update && normStr(update.causeOfDeath) !== normStr(current.causeOfDeath)) changesFound = true;

  // FAMILY scalars
if (!changesFound && "childrenCount" in update && Number(update.childrenCount) !== Number(current.childrenCount)) changesFound = true;
if (!changesFound && "parentEmail" in update && normLower(update.parentEmail) !== normLower(current.parentEmail)) changesFound = true;

// Helpers para comparar fechas (ms)

// Dentro de tu bloque "Sets (comparación campo por campo)" agrega:
if (!changesFound && "birthDate" in update && t(update.birthDate) !== t(current.birthDate)) changesFound = true;
if (!changesFound && "dateOfDeath" in update && t(update.dateOfDeath) !== t(current.dateOfDeath)) changesFound = true;

// También faltaba ageCategory (porque tú la recalculas)
if (!changesFound && "ageCategory" in update && normStr(update.ageCategory) !== normStr(current.ageCategory)) changesFound = true;


  // Antropometría: si mandaron measurementSystem + height + weight
  const touchedAnthro = ("measurementSystem" in update) || ("height" in update) || ("weight" in update);
  if (!changesFound && touchedAnthro) {
    const sys = normLower(update.measurementSystem || current.measurementSystem || "metric");
    const H = Number(update.height);
    const W = Number(update.weight);

    const nextHeightM = sys === "imperial" ? H * FT_TO_M : H;
    const nextWeightKg = sys === "imperial" ? W * LB_TO_KG : W;

    // Cambió unidad o cambió el valor real
    if (sys !== normLower(current.measurementSystem)) changesFound = true;
    else if (!near(nextHeightM, current.heightM)) changesFound = true;
    else if (!near(nextWeightKg, current.weightKg)) changesFound = true;
  }

  // Alternativa: si mandan heightM/weightKg directo
  if (!changesFound && "heightM" in update && !near(update.heightM, current.heightM)) changesFound = true;
  if (!changesFound && "weightKg" in update && !near(update.weightKg, current.weightKg)) changesFound = true;
}

if (!changesFound) {
  return res.status(400).json({
    errorCode: "NO_CHANGES",
    error: "No changes detected. Update cancelled.",
  });
}

// Si sí hubo cambios, ahora sí registramos quién editó
update.lastEditedBy = req.user._id;


    const updateDoc = {};
    if (Object.keys(update).length) updateDoc.$set = update;
    if (Object.keys(unset).length) updateDoc.$unset = unset;

   

    const updated = await Patient.findOneAndUpdate(
  { _id: req.params.id, $or: [{ owners: req.user._id }, { createdBy: req.user._id }] },
  Object.keys(updateDoc).length ? updateDoc : { $set: {} },
  { new: true, runValidators: true, context: "query" }
).lean({ virtuals: true });

    if (!updated) return res.status(404).json({ error: "Paciente no encontrado" });
    return res.json(applyDynamicAgeToPatient(updated));
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ error: "Duplicate key: patient already exists for this user" });
    }
    console.error("updatePatient error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/*export const deletePatient = async (req, res) => {
  try {
    // 1) Asegura ownership (solo puedes borrar tus pacientes)
    const patient = await Patient.findOne({
      _id: req.params.id,
      createdBy: req.user._id
    });
    if (!patient) {
      return res.status(404).json({ error: "Paciente no encontrado" });
    }

    // 2) Borra TODOS los diagnósticos que referencian al paciente
    await Diagnosis.deleteMany({ patient: patient._id }); // sin createdBy

    // 3) Borra el paciente
    await patient.deleteOne(); // (si luego agregas hook pre('deleteOne'), también se disparará)

    // 4) Respuesta
    return res.status(204).end();
  } catch (err) {
    console.error("deletePatient error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};*/


// === GET /api/patients/me/health-info ===
export const getMyHealthInfo = async (req, res) => {
  try {
    const data = await getMyHealthInfoService({
      user: req.user,
      req,
    });
    return res.json(data);
  } catch (err) {
    console.error("getMyHealthInfo error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  }
};


// Campos que vamos a sincronizar entre todos los doctors
const SYNC_FIELDS_SCALAR = [
  "fullname",
  "age",
  "ageCategory",
  "bloodtype",
  "gender",
  "organDonor",
  "bloodDonor",
  "measurementSystem",
  "heightM",
  "weightKg",
  "bmi",
  "bmiCategory",
  "isDeceased",
  "causeOfDeath",
  "country",
  "state",
  "city",
  "phone",
  "phoneDigits",
  "childrenCount",
  "birthDate",
"dateOfDeath"
];

const SYNC_FIELDS_ARRAY = ["diseases", "allergies", "medications", "children"];

/**
 * Paciente APRUEBA la versión de un doctor.
 * POST /api/patients/me/health-info/approve/:id
 */
export const approvePatientProfile = async (req, res) => {
  try {
   const data = await approvePatientProfileService({
      user: req.user,
      profileId: req.params.id,
    });
    return res.json(data);
  } catch (err) {
    console.error("approvePatientProfile error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  }
};


export const rejectPatientProfile = async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ error: "Insufficient role" });
    }

    const email = (req.user.email || "").toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ error: "User has no email on file" });
    }

    const profileId = req.params.id;

    const allPats = await Patient.find({ email }).sort({ updatedAt: -1 }).lean();
    if (!allPats.length) {
      return res.status(404).json({ error: "No patient profiles found for this user" });
    }

    const targetExists = allPats.some((p) => p._id.toString() === profileId);
    if (!targetExists) {
      return res.status(404).json({ error: "Patient profile not found for this user" });
    }

   // En vez de usar "some", necesitamos el doc para leer approvedSnapshot
const target = allPats.find((p) => String(p._id) === profileId);
if (!target) {
  return res.status(404).json({ error: "Profile not found" });
}

const withoutTarget = allPats.filter((p) => String(p._id) !== profileId);

if (withoutTarget.length === 0) {
  // Caso 1: solo existía este doctor
  // ✅ Si hay snapshot aprobado, hacemos rollback
  const snap = target.approvedSnapshot;

  const prevSet =
    snap && typeof snap === "object"
      ? (snap.set && typeof snap.set === "object" ? snap.set : snap)
      : null;

  const prevUnset =
    snap && typeof snap === "object" && snap.unset && typeof snap.unset === "object"
      ? snap.unset
      : {};

  if (prevSet && Object.keys(prevSet).length > 0) {
    const updateDoc = { $set: prevSet };
    if (Object.keys(prevUnset).length > 0) updateDoc.$unset = prevUnset;

    // ✅ acción del paciente: no dispares "pending" por timestamps
if (target?.approvedAt) {
  updateDoc.$set.updatedAt = target.approvedAt;
}

    await Patient.updateMany({ email }, updateDoc, { timestamps: false });

    await User.findByIdAndUpdate(
      req.user._id,
      { $set: { lastHealthDecisionAt: new Date() } },
      { new: false }
    );

    const { hasRecords, snapshot } = await computeHealthSnapshotByEmail(email);
    return res.json({ ok: true, hasRecords, snapshot, pendingDecision: false });
  }

  // ❌ Si NO hay snapshot (nunca hubo versión anterior aprobada) -> ahora sí borramos todo
  await Diagnosis.deleteMany({ patient: profileId });
  await Patient.deleteOne({ _id: profileId, email });

  await User.findByIdAndUpdate(
    req.user._id,
    { $set: { lastHealthDecisionAt: new Date() } },
    { new: false }
  );

  return res.json({ ok: true, hasRecords: false, snapshot: null, pendingDecision: false });
}


    // Caso 2: quedan otros -> armar snapshot con esos y copiar a todos
    const prevBase = buildHealthSnapshotFromPatients(withoutTarget, email);
    const { snapshot } = prevBase;

    const canonical = {};
    const sv = (wrapper) => {
      if (!wrapper || typeof wrapper !== "object") return undefined;
      //if (!wrapper.value && wrapper.value !== 0) return undefined;
      if (wrapper.value === undefined || wrapper.value === null) return undefined;
      return wrapper.value;
    };

    // Aquí usas exactamente la misma lógica que ya tienes
    // (solo copio la parte final para no repetir todo el bloque largo):
    if (snapshot.fullname) {
      canonical.fullname = snapshot.fullname;
    }
    if (snapshot.ageCategory) {
      canonical.ageCategory = snapshot.ageCategory;
    }

    // Estado de vida: usamos los valores directos del snapshot
    if (typeof snapshot.isDeceased === "boolean") {
      canonical.isDeceased = snapshot.isDeceased;
      if (snapshot.isDeceased && snapshot.causeOfDeath) {
        canonical.causeOfDeath = snapshot.causeOfDeath;
      } else if (!snapshot.isDeceased) {
        //canonical.causeOfDeath = undefined;
        delete canonical.causeOfDeath; 
      }
      
      if (snapshot.birthDate) canonical.birthDate = snapshot.birthDate;
      if (snapshot.dateOfDeath) canonical.dateOfDeath = snapshot.dateOfDeath;

      
    }
    const ageVal = sv(snapshot.age);
    if (ageVal !== undefined) canonical.age = ageVal;

    const genderVal = sv(snapshot.gender);
    if (genderVal !== undefined) canonical.gender = genderVal;

    const btVal = sv(snapshot.bloodtype);
    if (btVal !== undefined) canonical.bloodtype = btVal;

    const organVal = sv(snapshot.organDonor);
    if (organVal !== undefined) canonical.organDonor = organVal;

    const bloodDonVal = sv(snapshot.bloodDonor);
    if (bloodDonVal !== undefined) canonical.bloodDonor = bloodDonVal;

    const countryVal = sv(snapshot.country);
    if (countryVal !== undefined) canonical.country = countryVal;

    const stateVal = sv(snapshot.state);
    if (stateVal !== undefined) canonical.state = stateVal;

    const cityVal = sv(snapshot.city);
    if (cityVal !== undefined) canonical.city = cityVal;

    const phoneVal = sv(snapshot.phone);
if (phoneVal !== undefined) {
  canonical.phone = phoneVal;
  canonical.phoneDigits = String(phoneVal).replace(/\D/g, "");
}


    if (snapshot.measurementSystem)
      canonical.measurementSystem = snapshot.measurementSystem;
    if (typeof snapshot.heightM === "number") canonical.heightM = snapshot.heightM;
    if (typeof snapshot.weightKg === "number") canonical.weightKg = snapshot.weightKg;
    if (typeof snapshot.bmi === "number") canonical.bmi = snapshot.bmi;
    if (snapshot.bmiCategory) canonical.bmiCategory = snapshot.bmiCategory;

    canonical.diseases = Array.isArray(snapshot.diseases) ? snapshot.diseases : [];
    canonical.allergies = Array.isArray(snapshot.allergies) ? snapshot.allergies : [];
    canonical.medications = Array.isArray(snapshot.medications) ? snapshot.medications : [];

    const updateDoc = { $set: canonical };

// ✅ Si el estado final es vivo, BORRAMOS causeOfDeath del documento
if (canonical.isDeceased === false) {
  updateDoc.$unset = { causeOfDeath: 1 };
}
if (target?.approvedAt) {
  updateDoc.$set.updatedAt = target.approvedAt;
}

    // Copiar "estado anterior" a TODOS los Patient con ese email
    await Patient.updateMany({ email }, updateDoc, { timestamps: false });

    // Registrar decisión del paciente
    await User.findByIdAndUpdate(
      req.user._id,
      { $set: { lastHealthDecisionAt: new Date() } },
      { new: false }
    );

    // Devolver snapshot alineado
    const finalState = await computeHealthSnapshotByEmail(email);
    return res.json({
      ok: true,
      hasRecords: finalState.hasRecords,
      snapshot: finalState.snapshot,
      pendingDecision: false,
    });
  } catch (err) {
    console.error("rejectPatientProfile error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Helper: armar query identidad (email > phoneDigits > fallback)


/**
 * GET /api/patients/me/history  (paciente)
 */
export const getMyHistory = async (req, res) => {
  try {
    const data = await getMyHistoryService({ user: req.user });
    return res.json(data);

  } catch (err) {
    console.error("getMyHistory error:", err);
     return res.status(err.status || 500).json({
      error: err.message || "Server error fetching history",
    });
  }
};

/**
 * GET /api/patients/:id/history  (doctor)
 */
export const getPatientHistory = async (req, res) => {
  try {
    const data = await getPatientHistoryService({
      user: req.user,
      patientId: req.params.id,
    });
    return res.json(data);

  } catch (err) {
    console.error("getPatientHistory error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Server error fetching history",
    });
  }
};

// GET /api/patients/:id/history/:historyId?lang=xx  (doctor)
export const getPatientHistoryOne = async (req, res) => {
  try {
    const data = await getPatientHistoryOneService({
      user: req.user,
      patientId: req.params.id,
      historyId: req.params.historyId,
      req,
    });
    return res.json(data);
  } catch (err) {
    console.error("getPatientHistoryOne error:", err);
     return res.status(err.status || 500).json({
      error: err.message || "Server error",
    });
  }
};

// GET /api/patients/me/history/:historyId?lang=xx  (patient)
export const getMyHistoryOne = async (req, res) => {
  try {
    const data = await getMyHistoryOneService({
      user: req.user,
      historyId: req.params.historyId,
      req,
    });
    return res.json(data);
  } catch (err) {
    console.error("getMyHistoryOne error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Server error",
    });
  }
};

export const getMyChildrenHealthInfo = async (req, res) => {
  try {
   const data = await getMyChildrenHealthInfoService({
      user: req.user,
      req,
    });
    return res.json(data);
  } catch (err) {
    console.error("getMyChildrenHealthInfo error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  }
};

export const approveChildProfile = async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ error: "Insufficient role" });
    }

    const parentEmail = normLower(req.user.email);
    const profileId = req.params.id;

    const doc = await Patient.findOne({
      _id: profileId,
      parentEmail,
      ...minorQueryByBirthDateOrLegacy(new Date(), { includeDeceased: true }),
    }).lean();

    if (!doc) {
      return res.status(404).json({ errorCode: "CHILD_PROFILE_NOT_FOUND" });
    }

    const oldKey = doc.minorKey || minorKeyOf(parentEmail, doc.fullname);
    const newKey = minorKeyOf(parentEmail, doc.fullname);

    // Canonical (igual que adulto)
    const canonical = {};
    for (const field of SYNC_FIELDS_SCALAR) {
      if (Object.prototype.hasOwnProperty.call(doc, field) && doc[field] !== undefined) {
        canonical[field] = doc[field];
      }
    }
    for (const field of SYNC_FIELDS_ARRAY) {
      canonical[field] = Array.isArray(doc[field]) ? doc[field] : [];
    }

    const canonicalSet = { ...canonical };
    const canonicalUnset = {};
    for (const f of SYNC_FIELDS_SCALAR) {
      if (!(f in canonicalSet)) canonicalUnset[f] = 1;
    }
    for (const f of SYNC_FIELDS_ARRAY) {
      if (!(f in canonicalSet)) canonicalSet[f] = [];
    }

    const approvedAt = new Date();
    const approvedSnapshot = { set: canonicalSet, unset: canonicalUnset };

    const updateDoc = {
      $set: {
        ...canonicalSet,
        approvedSnapshot,
        approvedAt,
         updatedAt: approvedAt,
        minorKey: newKey,
        parentEmail,
      },
    };
    if (Object.keys(canonicalUnset).length > 0) updateDoc.$unset = canonicalUnset;

    await Patient.updateMany(
      { parentEmail, age: { $lt: 18 }, minorKey: oldKey },
      updateDoc, { timestamps: false }
    );

    // Historial (para menores por patientKey)
    await PatientHistory.create({
      patientKey: newKey,
      approvedAt,
      approvedSnapshot,
      approvedFromProfile: profileId,
      editedBy: doc.lastEditedBy || doc.createdBy || null,
    });

    const { hasRecords, snapshot } = await computeHealthSnapshotByMinorKey(newKey, parentEmail);
    return res.json({ ok: true, hasRecords, snapshot, pendingDecision: false });
  } catch (err) {
    console.error("approveChildProfile error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const rejectChildProfile = async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ error: "Insufficient role" });
    }

    const parentEmail = normLower(req.user.email);
    const profileId = req.params.id;

    const target = await Patient.findOne({
      _id: profileId,
      parentEmail,
      ...minorQueryByBirthDateOrLegacy(new Date(), { includeDeceased: true }),
    }).lean();

    if (!target) {
      return res.status(404).json({ errorCode: "CHILD_PROFILE_NOT_FOUND" });
    }

    const key = target.minorKey || minorKeyOf(parentEmail, target.fullname);

    const allPats = await Patient.find({
      parentEmail,
      minorKey: key,
      age: { $lt: 18 },
    })
      .sort({ updatedAt: -1 })
      .lean();

    if (!allPats.length) {
      return res.status(404).json({ errorCode: "CHILD_GROUP_NOT_FOUND" });
    }

    const withoutTarget = allPats.filter((p) => String(p._id) !== String(profileId));

    const decidedAt = new Date();

    // Caso 1: solo existía esa versión
    if (withoutTarget.length === 0) {
      const snap = target.approvedSnapshot;

      const prevSet =
        snap && typeof snap === "object"
          ? (snap.set && typeof snap.set === "object" ? snap.set : snap)
          : null;

      const prevUnset =
        snap && typeof snap === "object" && snap.unset && typeof snap.unset === "object"
          ? snap.unset
          : {};

      // Si existe snapshot anterior -> rollback y marcamos aprobado (para quitar pending)
      if (prevSet && Object.keys(prevSet).length > 0) {
        const updateDoc = {
          $set: {
            ...prevSet,
            approvedSnapshot: snap,
            approvedAt: decidedAt,
          },
        };
        if (Object.keys(prevUnset).length > 0) updateDoc.$unset = prevUnset;

        await Patient.updateMany(
          { parentEmail, minorKey: key, age: { $lt: 18 } },
          updateDoc,
  { timestamps: false }
        );

        const finalState = await computeHealthSnapshotByMinorKey(key, parentEmail);
        return res.json({
          ok: true,
          hasRecords: finalState.hasRecords,
          snapshot: finalState.snapshot,
          pendingDecision: false,
        });
      }

      // Si nunca hubo snapshot anterior aprobada -> eliminar todo (igual que adulto)
      await Diagnosis.deleteMany({ patient: profileId });
      await Patient.deleteOne({ _id: profileId, parentEmail });

      return res.json({ ok: true, hasRecords: false, snapshot: null, pendingDecision: false });
    }

    // Caso 2: quedan otras versiones -> reconstruimos snapshot desde las restantes
    const prevBase = buildHealthSnapshotFromPatients(withoutTarget, null);
    const { snapshot } = prevBase;

    // Convertir snapshot wrapper -> canonical
    const canonical = {};
    const sv = (w) => (w && typeof w === "object" ? w.value : undefined);

    if (snapshot.fullname) canonical.fullname = snapshot.fullname;
    if (snapshot.ageCategory) canonical.ageCategory = snapshot.ageCategory;

    const ageVal = sv(snapshot.age);
    if (ageVal !== undefined) canonical.age = ageVal;

    const genderVal = sv(snapshot.gender);
    if (genderVal !== undefined) canonical.gender = genderVal;

    const btVal = sv(snapshot.bloodtype);
    if (btVal !== undefined) canonical.bloodtype = btVal;

    const organVal = sv(snapshot.organDonor);
    if (organVal !== undefined) canonical.organDonor = organVal;

    const bloodVal = sv(snapshot.bloodDonor);
    if (bloodVal !== undefined) canonical.bloodDonor = bloodVal;

    const countryVal = sv(snapshot.country);
    if (countryVal !== undefined) canonical.country = countryVal;

    const stateVal = sv(snapshot.state);
    if (stateVal !== undefined) canonical.state = stateVal;

    const cityVal = sv(snapshot.city);
    if (cityVal !== undefined) canonical.city = cityVal;

    if (snapshot.measurementSystem) canonical.measurementSystem = snapshot.measurementSystem;
    if (typeof snapshot.heightM === "number") canonical.heightM = snapshot.heightM;
    if (typeof snapshot.weightKg === "number") canonical.weightKg = snapshot.weightKg;
    if (typeof snapshot.bmi === "number") canonical.bmi = snapshot.bmi;
    if (snapshot.bmiCategory) canonical.bmiCategory = snapshot.bmiCategory;

    canonical.diseases = Array.isArray(snapshot.diseases) ? snapshot.diseases : [];
    canonical.allergies = Array.isArray(snapshot.allergies) ? snapshot.allergies : [];
    canonical.medications = Array.isArray(snapshot.medications) ? snapshot.medications : [];

    // Nuevo baseline aprobado (para quitar pending)
    const canonicalSet = { ...canonical };
    const canonicalUnset = {};
    for (const f of SYNC_FIELDS_SCALAR) {
      if (!(f in canonicalSet)) canonicalUnset[f] = 1;
    }
    for (const f of SYNC_FIELDS_ARRAY) {
      if (!(f in canonicalSet)) canonicalSet[f] = [];
    }

    const approvedSnapshot = { set: canonicalSet, unset: canonicalUnset };

    const updateDoc = {
      $set: {
        ...canonicalSet,
        approvedSnapshot,
        approvedAt: decidedAt,
      },
    };
    if (Object.keys(canonicalUnset).length > 0) updateDoc.$unset = canonicalUnset;

    await Patient.updateMany(
      { parentEmail, minorKey: key, age: { $lt: 18 } },
      updateDoc,
  { timestamps: false }
    );

    const finalState = await computeHealthSnapshotByMinorKey(key, parentEmail);
    return res.json({
      ok: true,
      hasRecords: finalState.hasRecords,
      snapshot: finalState.snapshot,
      pendingDecision: false,
    });
  } catch (err) {
    console.error("rejectChildProfile error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getChildHistory = async (req, res) => {
  try {
    const data = await getChildHistoryService({
      user: req.user,
      childId: req.params.childId,
    });
    return res.json(data);
  } catch (err) {
    console.error("getChildHistory error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  }
};

export const getChildHistoryOne = async (req, res) => {
  try {
    const data = await getChildHistoryOneService({
      user: req.user,
      childId: req.params.childId,
      historyId: req.params.historyId,
      req,
    });
    return res.json(data);
  } catch (err) {
    console.error("getChildHistoryOne error:", err);
    return res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  }
};
