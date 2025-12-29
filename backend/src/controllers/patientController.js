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
  normBmiCat,
  verifyEmail,
  computeHealthSnapshotByEmail,
  hasPendingHealthDecisionForEmail,
  FT_TO_M,
  LB_TO_KG,
  buildHealthSnapshotFromPatients,
} from "./helpers/patienthelpers.js";

/**
 * Crear paciente
 */
export const createPatient = async (req, res) => {
  try {
    const { fullname, diseases, allergies, medications, email, phone, age, bloodtype, gender, organDonor: organIn, bloodDonor: bloodIn, 
      measurementSystem, height, weight, country, state, city
    } = req.body;

    const gRaw = normGender(gender);
    const isValidGender = gRaw === "male" || gRaw === "female";
    const hasOrgan = typeof organIn  !== "undefined";
    const hasBlood = typeof bloodIn  !== "undefined";

    const ageNum = Number(age);
    const isMinor = Number.isFinite(ageNum) && ageNum < 18;

    if (
      !fullname ||
      (!isMinor && (!email || !phone)) ||
      age == null || !bloodtype || !isValidGender
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

        // 🔒 Control: si el paciente ya tiene una versión pendiente en el portal,
    // ningún doctor puede crear otro perfil hasta que el paciente decida.
    if (normalizedEmail) {
      const locked = await hasPendingHealthDecisionForEmail(normalizedEmail);
      if (locked) {
        return res.status(409).json({
          error:
            "This patient has a pending profile in the portal. Wait until the patient approves or rejects it before creating a new version.",
        });
      }
    }


    const doc = await Patient.create({
      fullname, diseases: normalize(diseases), allergies: normalize(allergies), medications: normalize(medications), ...(normalizedEmail ? { email: normalizedEmail } : {}), age, bloodtype,  gender: gRaw, 
      organDonor, bloodDonor, isDeceased: false, ...(ph.phone ? { phone: ph.phone, phoneDigits: ph.digits } : {}), 
      causeOfDeath: undefined, measurementSystem: sys, heightM, weightKg, country: String(country).trim(), state: String(state).trim(), city: String(city).trim(),
       createdBy: req.user._id,
      // NEW: cachea exactamente lo que tecleó el usuario
      originalAnthro: { system: sys, height: H, weight: W },
    });

    return res.status(201).json(doc);
  } catch (err) {
    // índices únicos compuestos (createdBy+email/phone/fullname) -> E11000
    if (err?.code === 11000) {
      return res.status(400).json({ error: "Duplicate key: patient already exists for this user" });
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
    const { category, q, gender, organDonor, bloodDonor , bmiCategory: _bmiCategory,
      weightCategory: _weightCategory, bmi: _bmi} = req.query;

    
 
    const bmiCat = normBmiCat(_bmiCategory ?? _weightCategory ?? _bmi);
    // soporta bloodtype simple o múltiple
    const rawBT = req.query.bloodtype; // puede ser string | string[] | undefined
    let bloodtypeFilter = null;
    if (rawBT && rawBT !== "All") {
      const arr = Array.isArray(rawBT) ? rawBT : [rawBT];
      const ups = arr
        .map(x => String(x || "").trim().toUpperCase())
        .filter(Boolean);                     // limpia vacíos
      if (ups.length > 0) bloodtypeFilter = ups.length === 1 ? ups[0] : { $in: ups };
    }

    const page = Math.max(1, parseInt(req.query.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? "20", 10)));
    const skip = (page - 1) * limit;

    const query = { createdBy: req.user._id };

    // filtro por país (string exacto)
    if (req.query.country) {
      const c = String(req.query.country).trim();
      if (c && c !== "All") query.country = c;
    }

    // NUEVO: filtro por estado de vida
    if (typeof req.query.deceased !== "undefined") {
      if (req.query.deceased === "true" || req.query.deceased === true) query.isDeceased = true;
      if (req.query.deceased === "false" || req.query.deceased === false) query.isDeceased = false;
    }

    // filtro por categoría de edad
    if (category && category !== "All") query.ageCategory = category;

    // filtro por tipo(s) de sangre
    if (bloodtypeFilter) query.bloodtype = bloodtypeFilter;

    // NUEVO: filtro por categoría de IMC (underweight | healthy | overweight)
    if (bmiCat) query.bmiCategory = bmiCat;

     // filtro por género
    if (gender && ["male", "female"].includes(normGender(gender))) {
      query.gender = normGender(gender);
    }

    // filtro por donante de órganos
    if (typeof organDonor !== "undefined") {
      if (organDonor === "true" || organDonor === true) query.organDonor = true;
      if (organDonor === "false" || organDonor === false) query.organDonor = false;
    }

    // filtro por donador de sangre
    if (typeof bloodDonor !== "undefined") {
      if (bloodDonor === "true" || bloodDonor === true) query.bloodDonor = true;
      if (bloodDonor === "false" || bloodDonor === false) query.bloodDonor = false;
    }

     // NUEVO: filtro por presencia de enfermedades
    if (typeof req.query.hasDiseases !== "undefined") {
      if (req.query.hasDiseases === "true" || req.query.hasDiseases === true) {
       // tiene al menos 1 (truco clásico: existe el índice 0)
        query["diseases.0"] = { $exists: true };
      } else if (req.query.hasDiseases === "false" || req.query.hasDiseases === false) {
        // array vacío
        query.diseases = { $size: 0 };
      }
    }

    // NUEVO: filtro por presencia de alergias
    if (typeof req.query.hasAllergies !== "undefined") {
      if (req.query.hasAllergies === "true" || req.query.hasAllergies === true) {
        query["allergies.0"] = { $exists: true };
      } else if (req.query.hasAllergies === "false" || req.query.hasAllergies === false) {
        query.allergies = { $size: 0 };
      }
    }

    // NUEVO: filtro por presencia de medicamentos
    if (typeof req.query.hasMedications !== "undefined") {
      if (req.query.hasMedications === "true" || req.query.hasMedications === true) {
        query["medications.0"] = { $exists: true };
      } else if (req.query.hasMedications === "false" || req.query.hasMedications === false) {
        query.medications = { $size: 0 };
      }
    }

    // búsqueda por nombre/email/teléfono
    const term = q?.trim();
    if (term) {
      query.$or = [
        { fullname: { $regex: term, $options: "i" } },
        { email:    { $regex: term, $options: "i" } },
        { phone:    { $regex: term, $options: "i" } },
      ];
      const qDigits = term.replace(/\D/g, "");
      if (qDigits) {
      // Permite pegar solo números (sin '+') y encontrar por teléfono
      query.$or.push({ phoneDigits: new RegExp(qDigits) });
      }
      
    }

    const [items, total] = await Promise.all([
      Patient.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean({ virtuals: true }),
      Patient.countDocuments(query),
    ]);

    return res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("getMyPatients error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * Obtener paciente por id
 */
export const getPatientById = async (req, res) => {
  try {
    const doc = await Patient.findOne({
      _id: req.params.id,
      createdBy: req.user._id
    }).lean({ virtuals: true });

    if (!doc) return res.status(404).json({ error: "Paciente no encontrado" });
    return res.json(doc);
  } catch (err) {
    console.error("getPatientById error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

/**
 * Actualizar paciente
 */
export const updatePatient = async (req, res) => {
  try {
    const { fullname, diseases, allergies, medications, email, phone, age, bloodtype,  gender, organDonor: organIn, bloodDonor: bloodIn,
       measurementSystem, height, weight, heightM, weightKg,  country,
     } = req.body;

     // Leemos el doc actual para validar regla adulto/menor
    const current = await Patient.findOne({ _id: req.params.id, createdBy: req.user._id }).lean();
    if (!current) return res.status(404).json({ error: "Patient not found" });
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

    const update = {};
    const unset = {};
    const nextAge = typeof age !== "undefined" ? Number(age) : current.age;
    const isMinorNext = Number.isFinite(nextAge) && nextAge < 18;
    if (typeof fullname  !== "undefined") update.fullname  = fullname;
    if (typeof diseases  !== "undefined") update.diseases  = normalize(diseases);
    if (typeof allergies  !== "undefined") update.allergies  = normalize(allergies);
    if (typeof medications  !== "undefined") update.medications  = normalize(medications);
    if (typeof age       !== "undefined") update.age       = age;
    if (typeof bloodtype !== "undefined") update.bloodtype = bloodtype;

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
        update.causeOfDeath = undefined;
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

    const updateDoc = {};
    if (Object.keys(update).length) updateDoc.$set = update;
    if (Object.keys(unset).length) updateDoc.$unset = unset;

    const updated = await Patient.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user._id },
      Object.keys(updateDoc).length ? updateDoc : { $set: {} },
      { new: true, runValidators: true, context: "query" }
    );

    if (!updated) return res.status(404).json({ error: "Paciente no encontrado" });
    return res.json(updated);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ error: "Duplicate key: patient already exists for this user" });
    }
    console.error("updatePatient error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

export const deletePatient = async (req, res) => {
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
};


// === GET /api/patients/me/health-info ===
export const getMyHealthInfo = async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ error: "Insufficient role" });
    }

    const email = (req.user.email || "").toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ error: "User has no email on file" });
    }

    // 1) Snapshot de todos los Patient con ese email
    const snapshotData = await computeHealthSnapshotByEmail(email);
    const { hasRecords, snapshot, pats } = snapshotData;

    if (pats && pats.length > 0) {
      // Poblamos el campo createdBy para obtener name y email del doctor
      await Patient.populate(pats, { path: "createdBy", select: "name email" });

      // Asumimos que snapshot.sources se corresponde en orden con pats 
      // (ambos ordenados por fecha descendente en computeHealthSnapshotByEmail)
      if (snapshot && snapshot.sources && Array.isArray(snapshot.sources)) {
        snapshot.sources.forEach((source, index) => {
          const p = pats[index];
          if (p && p.createdBy) {
            // Inyectamos datos del doctor en el objeto source
            source.doctorName = p.createdBy.name; 
            source.doctorEmail = p.createdBy.email;
          }
        });
      }
    }

    if (snapshot && pats && pats.length > 1) {
      const intersectOthers = (field) => {
        // Tomamos todas las versiones EXCEPTO la más reciente (la tuya)
        const others = pats.slice(1);
        if (!others.length) return []; 
        
        // Empezamos la intersección con el primer "otro" doctor
        let base = new Set(normalize(others[0][field]));
        
        // Intersectamos con el resto
        for (let i = 1; i < others.length; i++) {
          const current = new Set(normalize(others[i][field]));
          base = new Set([...base].filter(x => current.has(x)));
        }
        return Array.from(base);
      };

      // Sobrescribimos las listas "Comunes" con este nuevo cálculo
      snapshot.commonDiseases = intersectOthers("diseases");
      snapshot.commonAllergies = intersectOthers("allergies");
      snapshot.commonMedications = intersectOthers("medications");
    }

    // 2) Buscar la última decisión del usuario
    const user = await User.findById(req.user._id)
      .select("lastHealthDecisionAt")
      .lean();

    let pendingDecision = false;

    if (hasRecords && snapshot && Array.isArray(pats) && pats.length > 0) {
      // Patient más reciente (pats está ordenado por updatedAt DESC)
      const latestUpdate = pats[0]?.updatedAt
        ? new Date(pats[0].updatedAt).getTime()
        : NaN;

      const lastDecision = user?.lastHealthDecisionAt
        ? new Date(user.lastHealthDecisionAt).getTime()
        : NaN;

      if (!Number.isFinite(latestUpdate)) {
        pendingDecision = false;
      } else if (!Number.isFinite(lastDecision)) {
        // Nunca ha tomado decisión -> hay algo pendiente
        pendingDecision = true;
      } else {
        // Si hay un Patient más nuevo que la última decisión -> pendiente
        pendingDecision = latestUpdate > lastDecision;
      }
    }
    // ✅ NEW: si solo hay 1 doctor, mostrar cambios vs última versión aprobada (sin warnings)
if (
  pendingDecision &&
  snapshot &&
  Array.isArray(pats) &&
  pats.length === 1 &&
  pats[0]?.approvedSnapshot
) {

  const latest = pats[0];

  const rawSnap = latest?.approvedSnapshot;
  const prev =
    rawSnap && typeof rawSnap === "object"
      ? (rawSnap.set && typeof rawSnap.set === "object" ? rawSnap.set : rawSnap)
      : null;

  const norm = (v) => (v === undefined ? null : v);

  const attachPrev = (w, prevVal) => {
    if (!w || typeof w !== "object" || !("value" in w)) return;
    const cur = norm(w.value);
    const pv = norm(prevVal);
    if (cur === pv) return;

    w.alternatives = [cur, pv]; // [nuevo, anterior]
    w.changed = true;           // para render “before → after” en UI
    w.conflict = false;         // IMPORTANT: NO warnings
  };

const setArrayBaseline = (field, combinedKey, commonKey, changedKey) => {
  const cur = normalize(snapshot[field]);
  const prevArr = normalize(prev?.[field]);

  // Si no hay baseline, no hacemos nada
  if (!prevArr.length && !cur.length) return;

  // Si son iguales (mismo contenido), no marcamos cambio
  const s1 = [...cur].sort().join("||");
  const s2 = [...prevArr].sort().join("||");
  if (s1 === s2) return;

  snapshot[commonKey] = prevArr; // baseline (aprobado)
  snapshot[combinedKey] = Array.from(new Set([...cur, ...prevArr])); // unión
  snapshot[changedKey] = true;
};


// baseline vs aprobado (solo 1 doctor)
setArrayBaseline("diseases", "diseasesCombined", "commonDiseases", "diseasesChanged");
setArrayBaseline("allergies", "allergiesCombined", "commonAllergies", "allergiesChanged");
setArrayBaseline("medications", "medicationsCombined", "commonMedications", "medicationsChanged");


  if (prev && typeof prev === "object") {
    // fullname usa fullnameWrapper en tu UI
    if (!snapshot.fullnameWrapper || typeof snapshot.fullnameWrapper !== "object") {
      snapshot.fullnameWrapper = { value: snapshot.fullname ?? null, conflict: false };
    }
    if (!("value" in snapshot.fullnameWrapper)) {
      snapshot.fullnameWrapper.value = snapshot.fullname ?? null;
    }
    attachPrev(snapshot.fullnameWrapper, prev.fullname);

    // wrappers escalares
    attachPrev(snapshot.age, prev.age);
    attachPrev(snapshot.gender, prev.gender);
    attachPrev(snapshot.bloodtype, prev.bloodtype);
    attachPrev(snapshot.organDonor, prev.organDonor);
    attachPrev(snapshot.bloodDonor, prev.bloodDonor);
    attachPrev(snapshot.country, prev.country);
    attachPrev(snapshot.state, prev.state);
    attachPrev(snapshot.city, prev.city);
    attachPrev(snapshot.phone, prev.phone);

    // status wrapper en tu UI representa “deceased/alive”
    attachPrev(snapshot.status, prev.isDeceased);

    // antropometría (wrappers separados)
    attachPrev(snapshot.heightWrapper, prev.heightM);
    attachPrev(snapshot.weightWrapper, prev.weightKg);
    attachPrev(snapshot.bmiWrapper, prev.bmi);

    // opcional: fecha del baseline aprobado (por si luego la quieres mostrar)
    snapshot.approvedBaselineAt = latest.approvedAt || null;
  }
}


    return res.json({ hasRecords, snapshot, pendingDecision });
  } catch (err) {
    console.error("getMyHealthInfo error:", err);
    return res.status(500).json({ error: "Internal server error" });
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
];

const SYNC_FIELDS_ARRAY = ["diseases", "allergies", "medications"];

/**
 * Paciente APRUEBA la versión de un doctor.
 * POST /api/patients/me/health-info/approve/:id
 */
export const approvePatientProfile = async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ error: "Insufficient role" });
    }

    const email = (req.user.email || "").toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ error: "User has no email on file" });
    }

    const profileId = req.params.id;

    const doc = await Patient.findOne({ _id: profileId, email }).lean();
    if (!doc) {
      return res.status(404).json({ error: "Patient profile not found for this user" });
    }

    // 1) Canonical desde ESTA versión (doctor elegido)
    const canonical = {};

    for (const field of SYNC_FIELDS_SCALAR) {
      // Importante: no metas undefined; si no viene, luego lo limpiamos con $unset
      if (Object.prototype.hasOwnProperty.call(doc, field) && doc[field] !== undefined) {
        canonical[field] = doc[field];
      }
    }
    for (const field of SYNC_FIELDS_ARRAY) {
      canonical[field] = Array.isArray(doc[field]) ? doc[field] : [];
    }

    // 2) SET/UNSET para rollback fino (ej: causeOfDeath)
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
      },
    };

    if (Object.keys(canonicalUnset).length > 0) {
      updateDoc.$unset = canonicalUnset;
    }

    // 3) Copiar a TODOS los docs del mismo email + guardar snapshot
    await Patient.updateMany({ email }, updateDoc);

    await User.findByIdAndUpdate(
      req.user._id,
      { $set: { lastHealthDecisionAt: new Date() } },
      { new: false }
    );

    const { hasRecords, snapshot } = await computeHealthSnapshotByEmail(email);
    return res.json({ ok: true, hasRecords, snapshot, pendingDecision: false });
  } catch (err) {
    console.error("approvePatientProfile error:", err);
    return res.status(500).json({ error: "Internal server error" });
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

    await Patient.updateMany({ email }, updateDoc);

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
        const updateDoc = { $set: canonical };

// ✅ Si el estado final es vivo, BORRAMOS causeOfDeath del documento
if (canonical.isDeceased === false) {
  updateDoc.$unset = { causeOfDeath: 1 };
}
      }
      
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

    // Copiar "estado anterior" a TODOS los Patient con ese email
    await Patient.updateMany({ email }, { $set: canonical });

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