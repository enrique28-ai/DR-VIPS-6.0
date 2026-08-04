// controllers/diagnosis.controller.js
import mongoose from "mongoose";
import Diagnosis from "../models/Diagnosis.js";
import Patient from "../models/Patient.js";
import DiagnosisHistory from "../models/DiagnosisHistory.js";
import { translateDiagnosisDoc, translateDiagnosisTitles } from "../utils/deeplTranslate.js";

const DIAGNOSIS_PATIENT_DECEASED = "DIAGNOSIS_PATIENT_DECEASED";
const DIAGNOSIS_PATIENT_DECEASED_ERROR =
  "Cannot create or edit diagnoses for a deceased patient.";

const diagnosisPatientDeceasedBody = () => ({
  errorCode: DIAGNOSIS_PATIENT_DECEASED,
  error: DIAGNOSIS_PATIENT_DECEASED_ERROR,
});



// Helper: confirmar que el paciente pertenece al usuario autenticado
const ownsPatient = async (patientId, userId, session) => {
  const query = Patient.exists({
    _id: patientId,
    $or: [{ owners: userId }, { createdBy: userId }],
  });
  return !!(await (session ? query.session(session) : query));
};

const patientIsDeceased = async (patientId, session) => {
  let query = Patient.findOne({ _id: patientId }).select("isDeceased");
  if (session) query = query.session(session);
  const patient = await query.lean();
  return patient?.isDeceased === true;
};

const normalize = (v) => {
  if (Array.isArray(v)) return v.map(s => String(s).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map(s => s.trim()).filter(Boolean);
  return [];
};

const getLang = (req) => (req.query.lang || "").trim();




// POST /api/diagnoses
export const createDiagnosis = async (req, res, next) => {
  try {
    const result = await mongoose.connection.transaction(async (session) => {
      const { title, description, medicine, treatment, operation, patient } = req.body;
      const meds = normalize(medicine);
      const txs  = normalize(treatment);
      const ops  = normalize(operation);

      if (!title?.trim() || !patient) {
        return { status: 400, body: { error: "title and patient are required" } };
      }

      if (!(await ownsPatient(patient, req.user._id, session))) {
        return { status: 403, body: { error: "Not authorized for this patient" } };
      }

      if (await patientIsDeceased(patient, session)) {
        return { status: 409, body: diagnosisPatientDeceasedBody() };
      }

      const [doc] = await Diagnosis.create([{
        title: title.trim(),
        description: description?.trim() ?? "",
        medicine: meds,
        treatment: txs,
        operation: ops,
        patient,
        createdBy: req.user._id,
      }], { session });

      await DiagnosisHistory.create([{
        diagnosisId: doc._id,
        editedBy: req.user._id,
        snapshot: doc.toObject(),
        changeType: "created",
      }], { session });

      return { status: 201, body: doc };
    });

    return res.status(result.status).json(result.body);
  } catch {
    console.error("[diagnosis-write] atomic_write_failed");
    return res.status(500).json({ error: "Internal server error" });
  }
};

// GET /api/diagnoses/patient/:patientId?q=&page=&limit=
// Si envías q, usa el índice de texto (title/description); ordena por relevancia y luego recientes
export const getDiagnosesByPatient = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const q = req.query.q?.trim();
    const date = req.query.date?.trim();
    const page = Math.max(1, parseInt(req.query.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? "20", 10)));
    const skip = (page - 1) * limit;

    if (!(await ownsPatient(patientId, req.user._id))) {
      return res.status(403).json({ error: "Not authorized for this patient" });
    }

     // Construye un único filtro reutilizable
    //const filter = { createdBy: req.user._id, patient: patientId };
    //if (q) filter.$text = { $search: q };
     const filter = { createdBy: req.user._id, patient: patientId };
    if (date) {
      const start = new Date(`${date}T00:00:00.000Z`);
      const end   = new Date(`${date}T23:59:59.999Z`);
      filter.$and = [
        {
          $or: [
            { createdAt: { $gte: start, $lt: end } },
            { updatedAt: { $gte: start, $lt: end } },
          ],
        },
      ];
    }

    // ?hasMedicines=true|false|yes|no|1|0
if (typeof req.query.hasMedicines !== "undefined") {
  const v = String(req.query.hasMedicines).toLowerCase();
  if (v === "true" || v === "yes" || v === "1") {
    filter["medicine.0"] = { $exists: true };
  } else if (v === "false" || v === "no" || v === "0") {
    filter.medicine = { $size: 0 };
  }
}

// ?hasTreatments=true|false|yes|no|1|0
if (typeof req.query.hasTreatments !== "undefined") {
  const v = String(req.query.hasTreatments).toLowerCase();
  if (v === "true" || v === "yes" || v === "1") {
    filter["treatment.0"] = { $exists: true };
  } else if (v === "false" || v === "no" || v === "0") {
    filter.treatment = { $size: 0 };
  }
}

// ?hasOperations=true|false|yes|no|1|0
if (typeof req.query.hasOperations !== "undefined") {
  const v = String(req.query.hasOperations).toLowerCase();
  if (v === "true" || v === "yes" || v === "1") {
    filter["operation.0"] = { $exists: true };
  } else if (v === "false" || v === "no" || v === "0") {
    filter.operation = { $size: 0 };
  }
}

    
   if (!q) {
  const [itemsRaw, total] = await Promise.all([
    Diagnosis.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Diagnosis.countDocuments(filter),
  ]);

  const lang = getLang(req);
  const items = lang ? await translateDiagnosisTitles(itemsRaw, lang) : itemsRaw;

  return res.json({ items, total, page, pages: Math.ceil(total / limit) });
}


    // 🔹 CON TEXTO: push text filter to DB via $regex
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { title: { $regex: escaped, $options: "i" } },
      { description: { $regex: escaped, $options: "i" } },
    ];

    const [docsRaw, total] = await Promise.all([
      Diagnosis.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Diagnosis.countDocuments(filter),
    ]);

    const pages = Math.ceil(total / limit) || 0;
    let items = docsRaw;

    const lang = getLang(req);
    if (lang && items.length > 0) {
      items = await translateDiagnosisTitles(items, lang);
    }

    return res.json({ items, total, page, pages });

  } catch (err) {
    console.error("getDiagnosesByPatient error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// GET /api/diagnoses/:id
/*export const getDiagnosisById = async (req, res, next) => {
  try {
    const d = await Diagnosis.findOne({
      _id: req.params.id,
      createdBy: req.user._id,
    });
    if (!d) return res.status(404).json({ error: "Dianostic not found" });

    // defensa: confirmar ownership del paciente
    if (!(await ownsPatient(d.patient, req.user._id))) {
      return res.status(403).json({ error: "Not authorized" });
    }
    return res.json(d);
  } catch (err) {
    console.error("getDiagnosisById error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};*/
export const getDiagnosisById = async (req, res, next) => {
  try {
    let d = await Diagnosis.findOne({
      _id: req.params.id,
      createdBy: req.user._id,
    }).lean();

    if (!d) return res.status(404).json({ error: "Dianostic not found" });

    if (!(await ownsPatient(d.patient, req.user._id))) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const lang = getLang(req);
    if (lang) {
      d = await translateDiagnosisDoc(d, lang);
    }

    return res.json(d);
  } catch (err) {
    console.error("getDiagnosisById error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// PUT /api/diagnoses/:id
export const updateDiagnosis = async (req, res, next) => {
  try {
    const result = await mongoose.connection.transaction(async (session) => {
      const d = await Diagnosis.findOne({
        _id: req.params.id,
        createdBy: req.user._id,
      }).session(session);
      if (!d) return { status: 404, body: { error: "Diagnostic not found" } };
      if (!(await ownsPatient(d.patient, req.user._id, session))) {
        return { status: 403, body: { error: "Not authorized" } };
      }

      if (await patientIsDeceased(d.patient, session)) {
        return { status: 409, body: diagnosisPatientDeceasedBody() };
      }

      // --- DETECT CHANGES ---
      // Evita guardar si el doctor no cambió nada (para mostrar toast de "No changes").
      const nextTitle =
        req.body.title != null ? String(req.body.title).trim() : (d.title ?? "");
      const nextDesc =
        req.body.description != null
          ? String(req.body.description).trim()
          : (d.description ?? "");
      const nextMed = ("medicine" in req.body) ? normalize(req.body.medicine) : normalize(d.medicine);
      const nextTx  = ("treatment" in req.body) ? normalize(req.body.treatment) : normalize(d.treatment);
      const nextOp  = ("operation" in req.body) ? normalize(req.body.operation) : normalize(d.operation);

      const arrKey = (a) => normalize(a).slice().sort().join("||");
      const noChanges =
        String(nextTitle) === String(d.title ?? "") &&
        String(nextDesc) === String(d.description ?? "") &&
        arrKey(nextMed) === arrKey(d.medicine) &&
        arrKey(nextTx) === arrKey(d.treatment) &&
        arrKey(nextOp) === arrKey(d.operation);

      if (noChanges) {
        return {
          status: 400,
          body: {
            errorCode: "NO_CHANGES",
            error: "No changes detected. Update cancelled.",
          },
        };
      }

      // Aplicar cambios (ya normalizados)
      d.title = nextTitle;
      d.description = nextDesc;
      d.medicine = nextMed;
      d.treatment = nextTx;
      d.operation = nextOp;

      await d.save({ session });
      await DiagnosisHistory.create([{
        diagnosisId: d._id,
        editedBy: req.user._id,
        snapshot: d.toObject(),
        changeType: "updated",
      }], { session });

      return { status: 200, body: d };
    });

    return res.status(result.status).json(result.body);
  } catch {
    console.error("[diagnosis-write] atomic_write_failed");
    return res.status(500).json({ error: "Internal server error" });
  }
};

// DELETE /api/diagnoses/:id
/*export const deleteDiagnosis = async (req, res, next) => {
  try {
    const d = await Diagnosis.findOne({
      _id: req.params.id,
      createdBy: req.user._id,
    });
    if (!d) return res.status(404).json({ error: "Diagnostic not found" });
    if (!(await ownsPatient(d.patient, req.user._id))) {
      return res.status(403).json({ error: "Not authorized" });
    }

    await d.deleteOne();
    return res.status(204).end();
  } catch (err) {
    console.error("deleteDiagnosis error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};*/

// GET /api/diagnoses/mine?q=&date=&hasMedicines=&hasTreatments=&hasOperations=&page=&limit=
export const getMyDiagnosesPortal = async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ error: "Insufficient role" });
    }

    const q     = req.query.q?.trim();
    const date  = req.query.date?.trim();
    const page  = Math.max(1, parseInt(req.query.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? "20", 10)));
    const skip  = (page - 1) * limit;

    // Vinculamos por email del paciente-usuario
    const email = req.user.email.toLowerCase();
    const pats  = await Patient.find({ email }, { _id: 1 });
    const ids   = pats.map(p => p._id);
    if (!ids.length) return res.json({ items: [], total: 0, page, pages: 0 });

    const filter = { patient: { $in: ids } }; // ¡sin createdBy!

    const isEmailSearch = !!q && q.includes("@");


    //if (q) filter.$text = { $search: q };
    if (date) {
      const start = new Date(`${date}T00:00:00.000Z`);
      const end   = new Date(`${date}T23:59:59.999Z`);
      filter.$and = [{
        $or: [{ createdAt: { $gte: start, $lt: end } }, { updatedAt: { $gte: start, $lt: end } }],
      }];
    }

    const asBool = (v) => {
      const t = String(v).toLowerCase();
      if (["true", "yes", "1"].includes(t)) return true;
      if (["false", "no", "0"].includes(t)) return false;
      return undefined;
    };
    const hm = asBool(req.query.hasMedicines);
    const ht = asBool(req.query.hasTreatments);
    const ho = asBool(req.query.hasOperations);
    if (hm === true)  filter["medicine.0"] = { $exists: true };
    if (hm === false) filter.medicine = { $size: 0 };
    if (ht === true)  filter["treatment.0"] = { $exists: true };
    if (ht === false) filter.treatment = { $size: 0 };
    if (ho === true)  filter["operation.0"] = { $exists: true };
    if (ho === false) filter.operation = { $size: 0 };

    //const hasText = !!q && !isEmailSearch; 
    //const proj    = hasText ? { score: { $meta: "textScore" } } : undefined;
    //const sortBy  = hasText ? { score: { $meta: "textScore" }, createdAt: -1 } : { createdAt: -1 };

   
   if (!q) {
  const [itemsRaw, total] = await Promise.all([
    Diagnosis.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "name email")
      .lean(),
    Diagnosis.countDocuments(filter),
  ]);

  const lang = getLang(req);
  const items = lang ? await translateDiagnosisTitles(itemsRaw, lang) : itemsRaw;

  return res.json({ items, total, page, pages: Math.ceil(total / limit) });
}


    // ⚙️ CON texto: buscamos por título, descripción, nombre del doc y correo del doc
    // safety cap: prevents loading entire collection into memory
    let docs = await Diagnosis.find(filter)
      .sort({ createdAt: -1 })
      .limit(5000)
      .populate("createdBy", "name email")
      .lean();

    const qn = q.toLowerCase();

    docs = docs.filter((d) => {
      const title       = (d.title ?? d.name ?? d.diagnosis ?? "").toLowerCase();
      const extra       = (d.description ?? d.symptoms ?? "").toLowerCase();
      const doctorName  = (d.createdBy?.name ?? "").toLowerCase();
      const doctorEmail = (d.createdBy?.email ?? "").toLowerCase();

      return (
        title.includes(qn) ||
        extra.includes(qn) ||
        doctorName.includes(qn) ||
        doctorEmail.includes(qn)
      );
    });

    const total = docs.length;
const pages = Math.ceil(total / limit) || 0;
let items = docs.slice(skip, skip + limit);

const lang = getLang(req);
if (lang && items.length > 0) {
  items = await translateDiagnosisTitles(items, lang);
}

return res.json({ items, total, page, pages });

  } catch (err) {
    console.error("getMyDiagnosesPortal error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// GET /api/diagnoses/mine/:id  (detalle)
/*export const getMyDiagnosisPortalById = async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ error: "Insufficient role" });
    }
    const d = await Diagnosis.findById(req.params.id)
    .populate("createdBy", " name email");

    if (!d) return res.status(404).json({ error: "Diagnostic not found" });

    const email = req.user.email.toLowerCase();
    const owns  = await Patient.exists({ _id: d.patient, email });
    if (!owns) return res.status(403).json({ error: "Not authorized" });

    return res.json(d);
  } catch (err) {
    console.error("getMyDiagnosisPortalById error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};*/
export const getMyDiagnosisPortalById = async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ error: "Insufficient role" });
    }

    let d = await Diagnosis.findById(req.params.id)
      .populate("createdBy", "name email")
      .lean();

    if (!d) return res.status(404).json({ error: "Diagnostic not found" });

    const email = req.user.email.toLowerCase();
    const owns = await Patient.exists({ _id: d.patient, email });
    if (!owns) return res.status(403).json({ error: "Not authorized" });

    const lang = getLang(req);
    if (lang) {
      d = await translateDiagnosisDoc(d, lang);
    }

    return res.json(d);
  } catch (err) {
    console.error("getMyDiagnosisPortalById error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


// GET /api/diagnoses/:id/history
// Visible para:
// - Doctor: solo si él creó el diagnóstico (y aún tiene acceso al paciente)
// - Paciente: solo si el diagnóstico pertenece a SU email (igual que /mine/:id)
export const getDiagnosisHistory = async (req, res) => {
  try {
    const { id } = req.params;

    const d = await Diagnosis.findById(id);
    if (!d) return res.status(404).json({ error: "Diagnostic not found" });

    if (req.user.role === "doctor") {
      // solo el doctor que lo creó
      if (String(d.createdBy) !== String(req.user._id)) {
        return res.status(403).json({ error: "Not authorized" });
      }
      // defensa extra: confirmar que el paciente está en su lista/lo creó
      if (!(await ownsPatient(d.patient, req.user._id))) {
        return res.status(403).json({ error: "Not authorized" });
      }
    } else if (req.user.role === "patient") {
      // el paciente dueño por email
      const email = (req.user.email || "").toLowerCase().trim();
      if (!email) return res.status(400).json({ error: "User has no email on file" });

      const owns = await Patient.exists({ _id: d.patient, email });
      if (!owns) return res.status(403).json({ error: "Not authorized" });
    } else {
      return res.status(403).json({ error: "Insufficient role" });
    }

    let history = await DiagnosisHistory.find({ diagnosisId: id })
  .sort({ createdAt: -1 })
  .populate("editedBy", "name email")
  .lean();

return res.json(history);

  } catch (err) {
    console.error("getDiagnosisHistory error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// GET /api/diagnoses/:id/history/:historyId?lang=xx
export const getDiagnosisHistoryOne = async (req, res) => {
  try {
    const { id, historyId } = req.params;
    const lang = getLang(req); // ya lo tienes arriba

    const d = await Diagnosis.findById(id);
    if (!d) return res.status(404).json({ error: "Diagnostic not found" });

    // mismo control de acceso que ya usas en getDiagnosisHistory
    if (req.user.role === "doctor") {
      if (String(d.createdBy) !== String(req.user._id)) {
        return res.status(403).json({ error: "Not authorized" });
      }
      if (!(await ownsPatient(d.patient, req.user._id))) {
        return res.status(403).json({ error: "Not authorized" });
      }
    } else if (req.user.role === "patient") {
      const email = (req.user.email || "").toLowerCase().trim();
      if (!email) return res.status(400).json({ error: "User has no email on file" });

      const owns = await Patient.exists({ _id: d.patient, email });
      if (!owns) return res.status(403).json({ error: "Not authorized" });
    } else {
      return res.status(403).json({ error: "Insufficient role" });
    }

    // traer SOLO 1 version del historial
    let ver = await DiagnosisHistory.findOne({ _id: historyId, diagnosisId: id })
      .populate("editedBy", "name email")
      .lean();

    if (!ver) return res.status(404).json({ error: "History version not found" });

    // traducir SOLO este snapshot
    if (lang && ver.snapshot) {
      ver = { ...ver, snapshot: await translateDiagnosisDoc(ver.snapshot, lang) };
    }

    return res.json(ver);
  } catch (err) {
    console.error("getDiagnosisHistoryOne error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// === PARENT/TUTOR: MINOR DIAGNOSES (HealthState for children) ===
const normLower = (v) => String(v || "").toLowerCase().trim();
const normNameKey = (v) =>
  String(v || "").trim().toLowerCase().replace(/\s+/g, " ");

const minorKeyOfLocal = (parentEmail, childFullname) => {
  const pe = normLower(parentEmail);
  const nk = normNameKey(childFullname);
  return pe && nk ? `${pe}::${nk}` : "";
};

async function resolveMinorGroupPatientIdsOrThrow(childId, parentEmail) {
  const pe = normLower(parentEmail);

  // 1) verificar que ese childId exista y sea hijo de ese parentEmail
  const base = await Patient.findOne({ _id: childId, parentEmail: pe })
    .select("_id fullname parentEmail minorKey age isDeceased")
    .lean();

  if (!base) {
    const err = new Error("CHILD_NOT_FOUND");
    err.statusCode = 404;
    err.errorCode = "CHILD_NOT_FOUND";
    throw err;
  }

  // 2) si ya no es menor, el padre pierde acceso
  if (!(Number(base.age) < 18)) {
    const err = new Error("CHILD_NOT_MINOR");
    err.statusCode = 403;
    err.errorCode = "CHILD_NOT_MINOR";
    throw err;
  }

  // 3) armar minorKey (fallback si no existiera en data vieja)
  const mk = base.minorKey || minorKeyOfLocal(pe, base.fullname);
  if (!mk) {
    const err = new Error("CHILD_KEY_MISSING");
    err.statusCode = 500;
    err.errorCode = "CHILD_KEY_MISSING";
    throw err;
  }

  // 4) obtener TODOS los Patient docs de ese menor (mismo minorKey)
  const pats = await Patient.find({
    parentEmail: pe,
    minorKey: mk,
    age: { $lt: 18 },
    isDeceased: false,
  })
    .select("_id")
    .lean();

  return { minorKey: mk, patientIds: pats.map((p) => p._id) };
}

// GET /api/diagnoses/children/:childId/mine
// GET /api/diagnoses/children/:childId/mine?q=&date=&hasMedicines=&hasTreatments=&hasOperations=&page=&limit=
export const getMyChildDiagnosesPortal = async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ errorCode: "INSUFFICIENT_ROLE" });
    }

    const parentEmail = normLower(req.user.email);
    const { childId } = req.params;

    const { patientIds } = await resolveMinorGroupPatientIdsOrThrow(childId, parentEmail);

    const q     = req.query.q?.trim();
    const date  = req.query.date?.trim();
    const page  = Math.max(1, parseInt(req.query.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? "20", 10)));
    const skip  = (page - 1) * limit;

    const filter = { patient: { $in: patientIds } };

    // filtros booleanos iguales a /mine
    const asBool = (v) => {
      const t = String(v).toLowerCase();
      if (["true", "yes", "1"].includes(t)) return true;
      if (["false", "no", "0"].includes(t)) return false;
      return undefined;
    };

    const hm = asBool(req.query.hasMedicines);
    const ht = asBool(req.query.hasTreatments);
    const ho = asBool(req.query.hasOperations);

    if (hm === true)  filter["medicine.0"] = { $exists: true };
    if (hm === false) filter.medicine = { $size: 0 };
    if (ht === true)  filter["treatment.0"] = { $exists: true };
    if (ht === false) filter.treatment = { $size: 0 };
    if (ho === true)  filter["operation.0"] = { $exists: true };
    if (ho === false) filter.operation = { $size: 0 };

    // filtro por date (igual idea que usas en otros endpoints)
    if (date) {
      const start = new Date(`${date}T00:00:00.000Z`);
      const end   = new Date(`${date}T23:59:59.999Z`);
      filter.$and = [{
        $or: [
          { createdAt: { $gte: start, $lt: end } },
          { updatedAt: { $gte: start, $lt: end } },
        ],
      }];
    }

    // --- SIN q: paginado DB (rápido) ---
    if (!q) {
      const [itemsRaw, total] = await Promise.all([
        Diagnosis.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate("createdBy", "name email role")
          .lean(),
        Diagnosis.countDocuments(filter),
      ]);

      const lang = getLang(req);
      const items = lang ? await translateDiagnosisTitles(itemsRaw, lang) : itemsRaw;

      return res.json({ items, total, page, pages: Math.ceil(total / limit) });
    }

    // --- CON q: filtra in-memory (igual estilo a tu /mine) ---
    // safety cap: prevents loading entire collection into memory
    let docs = await Diagnosis.find(filter)
      .sort({ createdAt: -1 })
      .limit(5000)
      .populate("createdBy", "name email role")
      .lean();

    const qn = q.toLowerCase();

    docs = docs.filter((d) => {
      const title       = (d.title ?? "").toLowerCase();
      const extra       = (d.description ?? d.symptoms ?? "").toLowerCase();
      const doctorName  = (d.createdBy?.name ?? "").toLowerCase();
      const doctorEmail = (d.createdBy?.email ?? "").toLowerCase();

      return (
        title.includes(qn) ||
        extra.includes(qn) ||
        doctorName.includes(qn) ||
        doctorEmail.includes(qn)
      );
    });

    const total = docs.length;
    const pages = Math.ceil(total / limit) || 0;
    let items = docs.slice(skip, skip + limit);

    const lang = getLang(req);
    if (lang && items.length > 0) {
      items = await translateDiagnosisTitles(items, lang);
    }

    return res.json({ items, total, page, pages });

  } catch (err) {
    const status = err.statusCode || 500;
    if (err.errorCode) return res.status(status).json({ errorCode: err.errorCode });
    console.error("getMyChildDiagnosesPortal error:", err);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
};


// GET /api/diagnoses/children/:childId/mine/:id
export const getMyChildDiagnosisPortalById = async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ errorCode: "INSUFFICIENT_ROLE" });
    }

    const parentEmail = normLower(req.user.email);
    const { childId, id } = req.params;

    const { patientIds } = await resolveMinorGroupPatientIdsOrThrow(childId, parentEmail);

    const d = await Diagnosis.findById(id)
      .populate("createdBy", "name email role")
      .lean();

    if (!d) return res.status(404).json({ errorCode: "DIAGNOSIS_NOT_FOUND" });

    // Seguridad: ese diagnóstico debe pertenecer a ese menor (grupo)
    const pid = String(d.patient);
    const allowed = patientIds.some((x) => String(x) === pid);
    if (!allowed) return res.status(403).json({ errorCode: "ACCESS_DENIED_CHILD_DIAGNOSIS" });

    const lang = getLang(req);
if (lang) {
  const translated = await translateDiagnosisDoc(d, lang);
  return res.json(translated);
}


    return res.json(d);
  } catch (err) {
    const status = err.statusCode || 500;
    if (err.errorCode) return res.status(status).json({ errorCode: err.errorCode });
    console.error("getMyChildDiagnosisPortalById error:", err);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
};

// === CHILD PORTAL: DIAGNOSIS HISTORY (parent/tutor) ===

// GET /api/diagnoses/children/:childId/mine/:id/history
export const getMyChildDiagnosisHistory = async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ errorCode: "INSUFFICIENT_ROLE" });
    }

    const parentEmail = normLower(req.user.email);
    const { childId, id } = req.params;

    const { patientIds } = await resolveMinorGroupPatientIdsOrThrow(childId, parentEmail);

    const d = await Diagnosis.findById(id);
    if (!d) return res.status(404).json({ errorCode: "DIAGNOSIS_NOT_FOUND" });

    // El diagnóstico debe pertenecer a ese menor (grupo)
    const pid = String(d.patient);
    const allowed = patientIds.some((x) => String(x) === pid);
    if (!allowed) return res.status(403).json({ errorCode: "ACCESS_DENIED_CHILD_DIAGNOSIS" });

    const history = await DiagnosisHistory.find({ diagnosisId: id })
      .sort({ createdAt: -1 })
      .populate("editedBy", "name email")
      .lean();

    return res.json(history);
  } catch (err) {
    const status = err.statusCode || 500;
    if (err.errorCode) return res.status(status).json({ errorCode: err.errorCode });
    console.error("getMyChildDiagnosisHistory error:", err);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
};

// GET /api/diagnoses/children/:childId/mine/:id/history/:historyId?lang=xx
export const getMyChildDiagnosisHistoryOne = async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ errorCode: "INSUFFICIENT_ROLE" });
    }

    const parentEmail = normLower(req.user.email);
    const { childId, id, historyId } = req.params;

    const { patientIds } = await resolveMinorGroupPatientIdsOrThrow(childId, parentEmail);

    const d = await Diagnosis.findById(id);
    if (!d) return res.status(404).json({ errorCode: "DIAGNOSIS_NOT_FOUND" });

    const pid = String(d.patient);
    const allowed = patientIds.some((x) => String(x) === pid);
    if (!allowed) return res.status(403).json({ errorCode: "ACCESS_DENIED_CHILD_DIAGNOSIS" });

    let ver = await DiagnosisHistory.findOne({ _id: historyId, diagnosisId: id })
      .populate("editedBy", "name email")
      .lean();

    if (!ver) return res.status(404).json({ errorCode: "HISTORY_VERSION_NOT_FOUND" });

    // traducir snapshot (igual que tu endpoint normal)
    const lang = getLang(req);
    if (lang && ver.snapshot) {
      ver = { ...ver, snapshot: await translateDiagnosisDoc(ver.snapshot, lang) };
    }

    return res.json(ver);
  } catch (err) {
    const status = err.statusCode || 500;
    if (err.errorCode) return res.status(status).json({ errorCode: err.errorCode });
    console.error("getMyChildDiagnosisHistoryOne error:", err);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
};
