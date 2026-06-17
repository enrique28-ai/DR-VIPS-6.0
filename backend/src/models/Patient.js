import mongoose from "mongoose";
import mongooseLeanVirtuals from "mongoose-lean-virtuals";
export const AGE_BANDS = [
  { key: "0-12",  min: 0,  max: 12 },
  { key: "13-17", min: 13, max: 17 },
  { key: "18-59", min: 18, max: 59 },
  { key: "60+",   min: 60, max: Infinity }
];



const BLOOD_TYPES = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];

/*const COUNTRIES = [
  "Mexico","United States","Canada","Guatemala","Colombia","Peru","Argentina",
  "Brazil","Chile","Spain","United Kingdom","France","Germany","Italy","Japan",
  "China","India"
];*/

const MAX_HEIGHT_M = 2.5;
const MAX_WEIGHT_KG = 350;

function mapAgeToBand(age) {
  if (age == null) return undefined;
  const band = AGE_BANDS.find(b => age >= b.min && age <= b.max);
  return band?.key;
}

const asNum = v => (v == null || v === "" ? undefined : Number(v));
const FT_TO_M  = 0.3048;
const LB_TO_KG = 0.45359237;

function computeBmi(weightKg, heightM) {
  if (!(heightM > 0) || !(weightKg > 0)) return { bmi: undefined, bmiCategory: undefined };
  const bmi = Number((weightKg / (heightM * heightM)).toFixed(1));
  const bmiCategory = bmi < 18.5 ? "underweight" : bmi < 25 ? "healthy" : "overweight";
  return { bmi, bmiCategory };
}

function calculateAge(birthDate, referenceDate = new Date()) {
  if (!birthDate) return undefined;
  const b = new Date(birthDate);
  const r = new Date(referenceDate);
  if (Number.isNaN(b.getTime()) || Number.isNaN(r.getTime())) return undefined;

  let age = r.getFullYear() - b.getFullYear();
  const m = r.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && r.getDate() < b.getDate())) age--;
  return Math.max(0, age);
}

function effectiveAgeForDoc(doc) {
  if (doc?.birthDate) {
    const ref = (doc?.isDeceased && doc?.dateOfDeath) ? doc.dateOfDeath : new Date();
    const a = calculateAge(doc.birthDate, ref);
    if (Number.isFinite(a)) return a;
  }
  const legacy = Number(doc?.age);
  return Number.isFinite(legacy) ? legacy : undefined;
}


const patientSchema = new mongoose.Schema({
  fullname: { type: String, required: true, trim: true },
  diseases: { type: [String], default: []},
  allergies: { type: [String], default: []},
  medications: { type: [String], default: []},
  email: { type: String, required() { return (effectiveAgeForDoc(this) ?? 0) >= 18; }, lowercase: true, trim: true },
  phone: { type: String, required() { return (effectiveAgeForDoc(this) ?? 0) >= 18; }, trim: true },
  //phoneDigits: { type: String, trim: true, index: true },
  phoneDigits: { type: String, trim: true },
  phoneCountry: { type: String, trim: true },
  phoneCountryIso: { type: String, uppercase: true, trim: true },
  age: { type: Number, min: 0, max: 120 },
  ageCategory: { type: String, enum: AGE_BANDS.map(b => b.key) },
  bloodtype: { type: String, required: true, enum: BLOOD_TYPES, uppercase: true, trim: true },

  // ✅ NEW: Date of birth (preferred). Used to compute age automatically on reads.
birthDate: { type: Date, required: true, index: true },
// ✅ NEW: If deceased, age freezes at this date
dateOfDeath: { type: Date, default: null },

    // === FAMILY / DEPENDENTS ===
  // Adult patients can declare their children (names) to enable minor validation.
  children: {
    type: [{
      name: { type: String, trim: true, required: true }
    }],
    default: []
  },

  // Cached count for quick UI / validation; kept consistent by controller and middleware.
  childrenCount: { type: Number, min: 0, default: 0 },

  // === Parental control (menores) ===
parentEmail: { type: String, lowercase: true, trim: true, index: true },

// clave estable para agrupar “versiones” del mismo menor (por padre + nombre normalizado)
minorKey: { type: String, lowercase: true, trim: true, index: true },

  // ===========================

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
   // ✅ NUEVO: doctores que “poseen” el paciente (importado o creador)
    owners: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // ✅ NUEVO: último doctor que editó (para que el portal/pending sepa quién movió)
    lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  gender: { type: String, enum: ["male", "female"], required: true},
  organDonor: { type: Boolean, required: true },
  bloodDonor: { type: Boolean, required: true },
  measurementSystem: { type: String, enum: ["metric", "imperial"], default: "metric", index: true, required: true },
    heightM:   { type: Number, min: 0, max: MAX_HEIGHT_M, required: true },   // metros
    weightKg:  { type: Number, min: 0,  max: MAX_WEIGHT_KG, required: true },   // kilogramos
    bmi:       { type: Number, min: 0 },   // índice de masa corporal
    bmiCategory: {
      type: String,
      enum: ["underweight", "healthy", "overweight"],
    },
    isDeceased:   { type: Boolean, default: false, index: true },
    causeOfDeath: { type: String, trim: true },
    country: { type: String, required: true, trim: true, index: true },
    state:   { type: String, trim: true, required: true, index: true },
    city:    { type: String, trim: true, required: true, index: true },
    // NEW: última versión aprobada (para poder “rollback” si luego rechazan una edición)
  approvedSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  approvedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false , toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Virtuales para mostrar en el sistema elegido
patientSchema.virtual("heightDisplay").get(function(){
  if (typeof this.heightM !== "number") return undefined;
  return this.measurementSystem === "imperial" ? this.heightM / 0.3048 : this.heightM;
});
patientSchema.virtual("weightDisplay").get(function(){
  if (typeof this.weightKg !== "number") return undefined;
  return this.measurementSystem === "imperial" ? this.weightKg / 0.45359237 : this.weightKg;
});
patientSchema.virtual("heightUnit").get(function(){
  return this.measurementSystem === "imperial" ? "ft" : "m";
});
patientSchema.virtual("weightUnit").get(function(){
  return this.measurementSystem === "imperial" ? "lb" : "kg";
});

// ✅ NUEVO VIRTUAL: indica si hay cambios pendientes de aprobación del paciente
patientSchema.virtual("isPendingApproval").get(function () {
  // Si nunca se ha aprobado, está pendiente (paciente recién creado por doctor)
  if (!this.approvedAt) return true;

  // Si no tenemos updatedAt (por proyección), asumimos que NO hay pendiente
  if (!this.updatedAt) return false;

  // Si la última modificación fue DESPUÉS de la aprobación, está pendiente
  return new Date(this.updatedAt).getTime() > new Date(this.approvedAt).getTime();
});




patientSchema.pre("save", function(next){
  if (this.birthDate) {
  if (this.isDeceased && !this.dateOfDeath) {
    this.dateOfDeath = new Date(); // congela si no dieron fecha
  }
  const ref = (this.isDeceased && this.dateOfDeath) ? this.dateOfDeath : new Date();
  const computed = calculateAge(this.birthDate, ref);
  if (Number.isFinite(computed)) {
    this.age = computed; // solo sync cuando se guarda
  }
}

  this.ageCategory = mapAgeToBand(this.age);

  if (this.isNew && this.createdBy) {
    this.owners ||= [];
    const has = this.owners.map(String).includes(String(this.createdBy));
    if (!has) this.owners.push(this.createdBy);
    if (!this.lastEditedBy) this.lastEditedBy = this.createdBy;
  }

    // Keep childrenCount consistent
  if (Array.isArray(this.children)) {
    this.childrenCount = this.children.length;
  } else {
    this.childrenCount = 0;
  }


  if (this.heightM > 0 && this.weightKg > 0) {
    const { bmi, bmiCategory } = computeBmi(this.weightKg, this.heightM);
    this.bmi = bmi;
    this.bmiCategory = bmiCategory;
  } else {
    this.bmi = undefined;
    this.bmiCategory = undefined;
  }
  next();
});
patientSchema.pre("findOneAndUpdate", function (next) {
  const upd = this.getUpdate() || {};
  const $set = upd.$set || {};
  //const $unset = upd.$unset || {};

  const has = (k) =>
    Object.prototype.hasOwnProperty.call($set, k) ||
    Object.prototype.hasOwnProperty.call(upd, k);
  const get = (k) =>
    Object.prototype.hasOwnProperty.call($set, k) ? $set[k] : upd[k];
  const ensureSet = () => (upd.$set ||= $set);

  // age ⇒ ageCategory
  if (has("age")) {
    const ageVal = Number(get("age"));
    ensureSet().ageCategory = mapAgeToBand(ageVal);
  }

  // Normaliza bloodtype
  if (has("bloodtype")) {
    ensureSet().bloodtype = String(get("bloodtype") || "").toUpperCase().trim();
  }

    // If children updated, keep childrenCount consistent
  if (has("children")) {
    const ch = get("children");
    ensureSet().childrenCount = Array.isArray(ch) ? ch.length : 0;
  }


  // ¿tocaron antropometría con height/weight + measurementSystem?
  const touchedSys = has("measurementSystem");
  const touchedH = has("height");
  const touchedW = has("weight");
  const anyAnthro = touchedSys || touchedH || touchedW;

  if (anyAnthro) {
    if (!(touchedSys && touchedH && touchedW)) {
      return next(
        new mongoose.Error.ValidatorError({
          message:
            "To update anthropometrics send measurementSystem, height and weight together.",
        })
      );
    }
    const sys = String(get("measurementSystem") || "").toLowerCase();
    const H = asNum(get("height"));
    const W = asNum(get("weight"));
    if (!["metric", "imperial"].includes(sys) || !(H > 0) || !(W > 0)) {
      return next(
        new mongoose.Error.ValidatorError({
          message: "Invalid anthropometric payload.",
        })
      );
    }

    if (sys === "metric") {
      ensureSet().heightM = H;
      ensureSet().weightKg = W;
    } else {
      ensureSet().heightM = H * FT_TO_M;
      ensureSet().weightKg = W * LB_TO_KG;
    }
    // limpia campos de entrada que no están en el schema
    delete upd.height; delete upd.weight;
    delete $set.height; delete $set.weight;

    const { bmi, bmiCategory } = computeBmi(ensureSet().weightKg, ensureSet().heightM);
    ensureSet().bmi = bmi;
    ensureSet().bmiCategory = bmiCategory;
  } else {
    // Alternativa: si actualizan heightM/weightKg directos
    const hasM = has("heightM");
    const hasK = has("weightKg");
    if (hasM || hasK) {
      if (!(hasM && hasK)) {
        return next(
          new mongoose.Error.ValidatorError({
            message: "To update direct anthropometrics send heightM and weightKg together.",
          })
        );
      }

      const h = asNum(get("heightM"));
      const w = asNum(get("weightKg"));
      const { bmi, bmiCategory } = computeBmi(w, h);
      ensureSet().bmi = bmi;
      ensureSet().bmiCategory = bmiCategory;
    }
  }

  this.setUpdate(upd);
  next();
});

// Índices compuestos por usuario
/*patientSchema.index(
   { createdBy: 1, email: 1 },
   { unique: true, partialFilterExpression: { email: { $type: "string", $ne: "" } } }
 );
 patientSchema.index(
   { createdBy: 1, phone: 1 },
   { unique: true, partialFilterExpression: { phone: { $type: "string", $ne: "" } } }
 );*/
/*patientSchema.index({ createdBy: 1, fullname: 1 }, { unique: true });
patientSchema.index({ createdBy: 1, ageCategory: 1 });
patientSchema.index({ createdBy: 1, gender: 1});
patientSchema.index({ createdBy: 1,  organDonor: 1});
patientSchema.index({ createdBy: 1, bloodtype: 1 });
patientSchema.index({ createdBy: 1, bloodDonor: 1 });
patientSchema.index({ createdBy: 1, bmiCategory: 1 });
patientSchema.index({ createdBy: 1, organDonor: 1, bloodDonor: 1 });
patientSchema.index({ createdBy: 1, country: 1 });
patientSchema.index({ createdBy: 1, phoneDigits: 1 });*/

// ✅ índices para “mis pacientes” (owners)

patientSchema.plugin(mongooseLeanVirtuals);
patientSchema.index({ owners: 1 });
patientSchema.index({ owners: 1, fullname: 1 });
patientSchema.index({ owners: 1, ageCategory: 1 });
patientSchema.index({ owners: 1, gender: 1 });
patientSchema.index({ owners: 1, organDonor: 1 });
patientSchema.index({ owners: 1, bloodtype: 1 });
patientSchema.index({ owners: 1, bloodDonor: 1 });
patientSchema.index({ owners: 1, bmiCategory: 1 });
patientSchema.index({ owners: 1, isDeceased: 1, birthDate: 1 });


patientSchema.index({ createdBy: 1 }); // auditoría
// ✅ ÚNICO GLOBAL por email (cuando exista)
patientSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string", $ne: "" } } }
);
patientSchema.index(
  { phoneDigits: 1 },
  { unique: true, partialFilterExpression: { phoneDigits: { $type: "string", $ne: "" } } }
);


//patientSchema.index({ country: 1 });
//patientSchema.index({ phoneDigits: 1 });




const Patient = mongoose.model("Patient", patientSchema);
export default Patient;
