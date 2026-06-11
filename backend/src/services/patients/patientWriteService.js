import Patient from "../../models/Patient.js";
import PatientHistory from "../../models/PatientHistory.js";
import User from "../../models/User.js";
import {
  cancelFutureActiveAppointmentsDueToDeath,
  cancelFutureActiveChildAppointmentsDueToGuardianUnavailable,
} from "../appointments/appointmentLifecycleService.js";
import {
  normPhoneWithCountry,
  normalize,
  toBool,
  normGender,
  verifyEmail,
  hasPendingHealthDecisionForEmail,
  FT_TO_M,
  LB_TO_KG,
  sanitizeChildren,
  parseChildrenCount,
  normLower,
  normNameKey,
  minorKeyOf,
  hasPendingGuardianDecisionForMinorKey,
  computeDynamicAge,
  mapAgeToBand,
  applyDynamicAgeToPatient,
  isYmd,
  ymdUTC,
  parseYmdToUtcNoon,
  normStr,
  normUpper,
  arrKey,
  near,
} from "../../controllers/helpers/patienthelpers.js";

const nameFromChild = (child) => (typeof child === "string" ? child : child?.name);

const APPROVAL_SYNC_FIELDS_SCALAR = [
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
  "dateOfDeath",
];

const APPROVAL_SYNC_FIELDS_ARRAY = ["diseases", "allergies", "medications", "children"];

const ADULT_DEATH_STATUS_ALLOWED_CHANGED_FIELDS = new Set([
  "isDeceased",
  "dateOfDeath",
  "causeOfDeath",
  "age",
  "ageCategory",
]);

const childNameKeyFromMinorKey = (minorKey, parentEmail) => {
  const mk = normLower(minorKey);
  const prefix = `${normLower(parentEmail)}::`;
  return mk && mk.startsWith(prefix) ? mk.slice(prefix.length) : "";
};

const datesDiffer = (a, b) => {
  const aKey = a ? ymdUTC(a) : "";
  const bKey = b ? ymdUTC(b) : "";
  return aKey !== bKey;
};

const bodyDateDiffers = (raw, currentValue) => {
  if (raw === "" || raw === null) return currentValue !== undefined && currentValue !== null;

  const parsed = isYmd(raw) ? parseYmdToUtcNoon(raw) : new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return normStr(raw) !== (currentValue ? ymdUTC(currentValue) : "");
  }

  return datesDiffer(parsed, currentValue);
};

const hasEffectiveDeathStatusChangeFromBody = ({ current, body, nextIsDeceased }) => {
  if ("isDeceased" in body && Boolean(nextIsDeceased) !== Boolean(current.isDeceased)) {
    return true;
  }

  if ("dateOfDeath" in body && bodyDateDiffers(body.dateOfDeath, current.dateOfDeath)) {
    return true;
  }

  return (
    "causeOfDeath" in body &&
    normStr(body.causeOfDeath) !== normStr(current.causeOfDeath)
  );
};

const collectEffectiveNormalChangedFieldsFromBody = ({ current, body }) => {
  const changed = new Set();

  if ("diseases" in body && arrKey(normalize(body.diseases)) !== arrKey(current.diseases)) changed.add("diseases");
  if ("allergies" in body && arrKey(normalize(body.allergies)) !== arrKey(current.allergies)) changed.add("allergies");
  if ("medications" in body && arrKey(normalize(body.medications)) !== arrKey(current.medications)) changed.add("medications");

  if ("children" in body) {
    const incoming = Array.isArray(body.children)
      ? body.children.map((c) => normNameKey(c?.name))
      : [];
    const existing = Array.isArray(current.children)
      ? current.children.map((c) => normNameKey(c?.name))
      : [];
    if (incoming.join("|") !== existing.join("|")) changed.add("children");
  }

  if ("childrenCount" in body) {
    const parsedCount = parseChildrenCount(body.childrenCount);
    const currentChildren = Array.isArray(current.children) ? current.children : [];
    const currentCount = Number.isFinite(Number(current.childrenCount))
      ? Number(current.childrenCount)
      : currentChildren.length;

    if (parsedCount !== undefined && parsedCount !== currentCount) changed.add("childrenCount");
    if (parsedCount === null && normStr(body.childrenCount) !== normStr(currentCount)) changed.add("childrenCount");
  }

  if ("fullname" in body && normStr(body.fullname) !== normStr(current.fullname)) changed.add("fullname");
  if ("email" in body && normLower(body.email) !== normLower(current.email)) changed.add("email");
  if ("birthDate" in body && bodyDateDiffers(body.birthDate, current.birthDate)) changed.add("birthDate");
  if ("bloodtype" in body && normUpper(body.bloodtype) !== normUpper(current.bloodtype)) changed.add("bloodtype");
  if ("gender" in body && normLower(body.gender) !== normLower(current.gender)) changed.add("gender");
  if ("organDonor" in body && Boolean(toBool(body.organDonor)) !== Boolean(current.organDonor)) changed.add("organDonor");
  if ("bloodDonor" in body && Boolean(toBool(body.bloodDonor)) !== Boolean(current.bloodDonor)) changed.add("bloodDonor");
  if ("country" in body && normStr(body.country) !== normStr(current.country)) changed.add("country");
  if ("state" in body && normStr(body.state) !== normStr(current.state)) changed.add("state");
  if ("city" in body && normStr(body.city) !== normStr(current.city)) changed.add("city");
  if ("parentEmail" in body && normLower(body.parentEmail) !== normLower(current.parentEmail)) changed.add("parentEmail");

  if ("phone" in body) {
    const rawDigits = String(body.phone ?? "").replace(/\D/g, "");

    if (!rawDigits) {
      if (current.phone || current.phoneDigits) changed.add("phone");
    } else {
      const effectiveCountry = "country" in body ? body.country : current.country;
      const normalized = effectiveCountry
        ? normPhoneWithCountry(effectiveCountry, body.phone)
        : { ok: false };

      if (normalized.ok) {
        if (normStr(normalized.digits) !== normStr(current.phoneDigits)) changed.add("phone");
      } else {
        const currentPhoneDigits = String(current.phone || "").replace(/\D/g, "");
        if (
          rawDigits !== normStr(current.phoneDigits) &&
          rawDigits !== currentPhoneDigits
        ) {
          changed.add("phone");
        }
      }
    }
  }

  const touchedAnthro =
    "measurementSystem" in body || "height" in body || "weight" in body;

  if (touchedAnthro) {
    const sys = normLower(body.measurementSystem || current.measurementSystem || "metric");
    const heightValue = Number(body.height);
    const weightValue = Number(body.weight);

    if (sys !== normLower(current.measurementSystem)) changed.add("measurementSystem");

    if (Number.isFinite(heightValue)) {
      const nextHeightM = sys === "imperial" ? heightValue * FT_TO_M : heightValue;
      if (!near(nextHeightM, current.heightM)) changed.add("heightM");
    } else if ("height" in body && normStr(body.height) !== "") {
      changed.add("heightM");
    }

    if (Number.isFinite(weightValue)) {
      const nextWeightKg = sys === "imperial" ? weightValue * LB_TO_KG : weightValue;
      if (!near(nextWeightKg, current.weightKg)) changed.add("weightKg");
    } else if ("weight" in body && normStr(body.weight) !== "") {
      changed.add("weightKg");
    }
  }

  if ("heightM" in body && !near(Number(body.heightM), current.heightM)) changed.add("heightM");
  if ("weightKg" in body && !near(Number(body.weightKg), current.weightKg)) changed.add("weightKg");

  return changed;
};

const throwDeathStatusUpdateOnly = () => {
  const err = new Error("Death status must be updated separately.");
  err.status = 400;
  err.errorCode = "DEATH_STATUS_UPDATE_ONLY";
  throw err;
};

const throwPatientDeceasedReadonly = () => {
  const err = new Error(
    "Deceased patients cannot be edited unless they are changed back to alive."
  );
  err.status = 400;
  err.errorCode = "PATIENT_DECEASED_READONLY";
  throw err;
};

const throwGuardianUnavailable = () => {
  const err = new Error(
    "The guardian is unavailable. Assign a new guardian before editing this minor."
  );
  err.status = 400;
  err.errorCode = "GUARDIAN_UNAVAILABLE";
  throw err;
};

const collectEffectiveChangedFields = ({ current, update, unset }) => {
  const changed = new Set();

  for (const k of Object.keys(unset)) {
    if (current[k] !== undefined && current[k] !== null) changed.add(k);
  }

  if ("diseases" in update && arrKey(update.diseases) !== arrKey(current.diseases)) changed.add("diseases");
  if ("allergies" in update && arrKey(update.allergies) !== arrKey(current.allergies)) changed.add("allergies");
  if ("medications" in update && arrKey(update.medications) !== arrKey(current.medications)) changed.add("medications");

  if ("children" in update) {
    const u = Array.isArray(update.children)
      ? update.children.map((c) => normNameKey(c?.name))
      : [];
    const c = Array.isArray(current.children)
      ? current.children.map((x) => normNameKey(x?.name))
      : [];
    if (u.join("|") !== c.join("|")) changed.add("children");
  }

  if ("fullname" in update && normStr(update.fullname) !== normStr(current.fullname)) changed.add("fullname");
  if ("email" in update && normLower(update.email) !== normLower(current.email)) changed.add("email");
  if ("age" in update && Number(update.age) !== Number(current.age)) changed.add("age");
  if ("bloodtype" in update && normUpper(update.bloodtype) !== normUpper(current.bloodtype)) changed.add("bloodtype");
  if ("gender" in update && normLower(update.gender) !== normLower(current.gender)) changed.add("gender");
  if ("organDonor" in update && Boolean(update.organDonor) !== Boolean(current.organDonor)) changed.add("organDonor");
  if ("bloodDonor" in update && Boolean(update.bloodDonor) !== Boolean(current.bloodDonor)) changed.add("bloodDonor");
  if ("country" in update && normStr(update.country) !== normStr(current.country)) changed.add("country");
  if ("state" in update && normStr(update.state) !== normStr(current.state)) changed.add("state");
  if ("city" in update && normStr(update.city) !== normStr(current.city)) changed.add("city");
  if ("phone" in update && normStr(update.phone) !== normStr(current.phone)) changed.add("phone");
  if ("phoneDigits" in update && normStr(update.phoneDigits) !== normStr(current.phoneDigits)) changed.add("phoneDigits");
  if ("isDeceased" in update && Boolean(update.isDeceased) !== Boolean(current.isDeceased)) changed.add("isDeceased");
  if ("causeOfDeath" in update && normStr(update.causeOfDeath) !== normStr(current.causeOfDeath)) changed.add("causeOfDeath");

  const currentChildren = Array.isArray(current.children) ? current.children : [];
  const currentChildrenCount =
    Number.isFinite(Number(current.childrenCount))
      ? Number(current.childrenCount)
      : currentChildren.length;

  if ("childrenCount" in update && Number(update.childrenCount) !== currentChildrenCount) changed.add("childrenCount");
  if ("parentEmail" in update && normLower(update.parentEmail) !== normLower(current.parentEmail)) changed.add("parentEmail");
  if ("birthDate" in update && datesDiffer(update.birthDate, current.birthDate)) changed.add("birthDate");
  if ("dateOfDeath" in update && datesDiffer(update.dateOfDeath, current.dateOfDeath)) changed.add("dateOfDeath");
  if ("ageCategory" in update && normStr(update.ageCategory) !== normStr(current.ageCategory)) changed.add("ageCategory");

  const touchedAnthro =
    "measurementSystem" in update || "height" in update || "weight" in update;

  if (touchedAnthro) {
    const sys = normLower(update.measurementSystem || current.measurementSystem || "metric");
    const H = Number(update.height);
    const W = Number(update.weight);

    const nextHeightM = sys === "imperial" ? H * FT_TO_M : H;
    const nextWeightKg = sys === "imperial" ? W * LB_TO_KG : W;

    if (sys !== normLower(current.measurementSystem)) changed.add("measurementSystem");
    if (!near(nextHeightM, current.heightM)) changed.add("heightM");
    if (!near(nextWeightKg, current.weightKg)) changed.add("weightKg");
  }

  if ("heightM" in update && !near(update.heightM, current.heightM)) changed.add("heightM");
  if ("weightKg" in update && !near(update.weightKg, current.weightKg)) changed.add("weightKg");

  return changed;
};

const buildApprovedSnapshotFromPatient = (doc) => {
  const canonicalSet = {};
  const canonicalUnset = {};

  for (const field of APPROVAL_SYNC_FIELDS_SCALAR) {
    if (Object.prototype.hasOwnProperty.call(doc, field) && doc[field] !== undefined) {
      canonicalSet[field] = doc[field];
    } else {
      canonicalUnset[field] = 1;
    }
  }

  for (const field of APPROVAL_SYNC_FIELDS_ARRAY) {
    canonicalSet[field] = Array.isArray(doc[field]) ? doc[field] : [];
  }

  return { set: canonicalSet, unset: canonicalUnset };
};

const applyUnsetToObject = (doc, unset) => {
  const next = { ...doc };
  for (const key of Object.keys(unset)) delete next[key];
  return next;
};

const isCurrentAdultWithoutGuardian = (current) => {
  const currentAgeDyn = computeDynamicAge(current);
  const currentlyMinor = Number.isFinite(currentAgeDyn) && currentAgeDyn < 18;
  return !currentlyMinor && !current.parentEmail && !current.minorKey;
};

const isCurrentMinorOrGuardianLinked = (current) => {
  const currentAgeDyn = computeDynamicAge(current);
  const currentlyMinor = Number.isFinite(currentAgeDyn) && currentAgeDyn < 18;
  return currentlyMinor || !!current.parentEmail || !!current.minorKey;
};

const parentEmailFromMinorKey = (minorKey) => {
  const mk = normLower(minorKey);
  const separator = mk.indexOf("::");
  return separator > 0 ? mk.slice(0, separator) : "";
};

const guardianReassignmentError = (errorCode, message, status = 400) => {
  const err = new Error(message);
  err.status = status;
  err.errorCode = errorCode;
  return err;
};

const approvedChildrenFromGuardian = (guardian) => {
  const snap = guardian?.approvedSnapshot;
  if (Array.isArray(snap?.set?.children)) return snap.set.children;
  if (Array.isArray(snap?.children)) return snap.children;
  return Array.isArray(guardian?.children) ? guardian.children : [];
};

export const createPatientService = async ({ user, body }) => {
  const {
    fullname,
    diseases,
    allergies,
    medications,
    email,
    phone,
    age,
    bloodtype,
    gender,
    organDonor: organIn,
    bloodDonor: bloodIn,
    measurementSystem,
    height,
    weight,
    country,
    state,
    city,
    children,
    childrenCount,
    parentEmail,
    birthDate,
  } = body;

  const gRaw = normGender(gender);
  const isValidGender = gRaw === "male" || gRaw === "female";
  const hasOrgan = typeof organIn !== "undefined";
  const hasBlood = typeof bloodIn !== "undefined";

  if (birthDate === undefined || birthDate === null || birthDate === "") {
    const err = new Error("Birthdate is required");
    err.status = 400;
    err.errorCode = "BIRTHDATE_REQUIRED";
    throw err;
  }

  let parsedBirthDate = null;

  if (birthDate !== undefined && birthDate !== null && birthDate !== "") {
    parsedBirthDate = isYmd(birthDate) ? parseYmdToUtcNoon(birthDate) : new Date(birthDate);

    if (Number.isNaN(parsedBirthDate.getTime())) {
      const err = new Error("Invalid birthdate");
      err.status = 400;
      err.errorCode = "INVALID_BIRTHDATE";
      throw err;
    }

    if (ymdUTC(parsedBirthDate) > ymdUTC(new Date())) {
      const err = new Error("Birthdate cannot be in the future");
      err.status = 400;
      err.errorCode = "BIRTHDATE_IN_FUTURE";
      throw err;
    }
  }

  const ageNum = computeDynamicAge({ birthDate: parsedBirthDate, age: Number(age) });
  if (!Number.isFinite(ageNum) || ageNum < 0 || ageNum > 120) {
    const err = new Error("Invalid age");
    err.status = 400;
    err.errorCode = "INVALID_AGE";
    throw err;
  }

  const isMinor = ageNum < 18;

  if (
    !fullname ||
    (!isMinor && (!email || !phone)) ||
    !bloodtype ||
    !isValidGender ||
    !hasOrgan ||
    !hasBlood ||
    !measurementSystem ||
    !height ||
    !weight ||
    !country ||
    !state ||
    !city
  ) {
    const err = new Error("Missing required fields");
    err.status = 400;
    throw err;
  }

  if (measurementSystem == null || height == null || weight == null) {
    const err = new Error("Provide measurementSystem, height and weight");
    err.status = 400;
    throw err;
  }

  const sys = String(measurementSystem).toLowerCase();
  const H = Number(height);
  const W = Number(weight);

  if (!["metric", "imperial"].includes(sys) || !(H > 0) || !(W > 0)) {
    const err = new Error("Invalid anthropometric payload");
    err.status = 400;
    throw err;
  }

  const heightM = sys === "metric" ? H : H * FT_TO_M;
  const weightKg = sys === "metric" ? W : W * LB_TO_KG;

  const organDonor = toBool(organIn);
  const bloodDonor = toBool(bloodIn);

  if (isMinor && (typeof children !== "undefined" || typeof childrenCount !== "undefined")) {
    const err = new Error("Minors cannot declare children.");
    err.status = 400;
    err.errorCode = "MINOR_CANNOT_DECLARE_CHILDREN";
    throw err;
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
        const err = new Error("childrenCount must be an integer >= 0");
        err.status = 400;
        err.errorCode = "CHILDREN_COUNT_INVALID";
        throw err;
      }

      if (typeof n === "undefined") {
        const err = new Error("childrenCount is required when declaring children");
        err.status = 400;
        err.errorCode = "CHILDREN_COUNT_REQUIRED";
        throw err;
      }

      if (n === 0) {
        finalChildren = [];
        finalChildrenCount = 0;
      } else {
        const list = sanitizeChildren(children);
        if (list.length !== n) {
          const err = new Error(
            "children must include the name of each child and match childrenCount"
          );
          err.status = 400;
          err.errorCode = "CHILDREN_COUNT_MISMATCH";
          throw err;
        }
        finalChildren = list;
        finalChildrenCount = n;
      }
    }
  }

  let mk;

  if (isMinor) {
    const peIn = normLower(parentEmail);
    if (!peIn) {
      const err = new Error("Parent email is required to create a minor patient.");
      err.status = 400;
      err.errorCode = "PARENT_EMAIL_REQUIRED";
      throw err;
    }

    finalParentEmail = peIn;

    const parentEmailCheck = await verifyEmail(finalParentEmail);
    if (!parentEmailCheck.ok) {
      const err = new Error(parentEmailCheck.error);
      err.status = 400;
      throw err;
    }

    const parentDoc = await Patient.findOne({ email: finalParentEmail })
      .select("_id age children approvedAt approvedSnapshot")
      .lean();

    if (!parentDoc) {
      const err = new Error("Access denied: parent email not found in the system.");
      err.status = 403;
      err.errorCode = "PARENT_NOT_FOUND";
      throw err;
    }

    if (!(Number(parentDoc.age) >= 18)) {
      const err = new Error("Access denied: parent record must be an adult.");
      err.status = 403;
      err.errorCode = "PARENT_NOT_ADULT";
      throw err;
    }

    if (!parentDoc.approvedAt) {
      const err = new Error(
        "Access denied: the parent/tutor must approve their profile before registering minors."
      );
      err.status = 403;
      err.errorCode = "PARENT_NOT_APPROVED";
      throw err;
    }

    const childKey = normNameKey(fullname);
    const snap = parentDoc.approvedSnapshot;
    const parentChildren =
      Array.isArray(snap?.set?.children) ? snap.set.children :
      Array.isArray(snap?.children) ? snap.children :
      Array.isArray(parentDoc.children) ? parentDoc.children : [];

    const isListed = parentChildren.some((c) => {
      const cName = typeof c === "string" ? c : c?.name;
      return normNameKey(cName) === childKey;
    });

    if (!isListed) {
      const err = new Error(
        "Access denied: minor name is not listed in the parent's children list."
      );
      err.status = 403;
      err.errorCode = "MINOR_NOT_LISTED";
      throw err;
    }

    mk = minorKeyOf(finalParentEmail, fullname);
    if (!mk) {
      const err = new Error("Invalid minor key");
      err.status = 400;
      err.errorCode = "MINOR_KEY_INVALID";
      throw err;
    }

    const lockedMinor = await hasPendingGuardianDecisionForMinorKey(mk, finalParentEmail);
    if (lockedMinor) {
      const err = new Error("Pending guardian decision");
      err.status = 409;
      err.errorCode = "PENDING_GUARDIAN_DECISION";
      throw err;
    }
  }

  let normalizedEmail;
  if (email) {
    const emailCheck = await verifyEmail(email);
    if (!emailCheck.ok) {
      const err = new Error(emailCheck.error);
      err.status = 400;
      throw err;
    }
    normalizedEmail = String(email).toLowerCase().trim();
  } else if (!isMinor) {
    const err = new Error("Email is required for adults");
    err.status = 400;
    throw err;
  }

  let ph = { ok: true, phone: undefined, digits: undefined };
  if (phone) {
    ph = normPhoneWithCountry(country, phone);
    if (!ph.ok) {
      const err = new Error(ph.error);
      err.status = 400;
      throw err;
    }
  } else if (!isMinor) {
    const err = new Error("Phone is required for adults");
    err.status = 400;
    throw err;
  }

  if (normalizedEmail) {
    const existing = await Patient.findOne({ email: normalizedEmail })
      .select("_id createdBy")
      .lean();

    if (existing) {
      const err = new Error(
        "A patient with this email already exists in the global database. Please use 'Search Global' to import them."
      );
      err.status = 409;
      err.errorCode = "PATIENT_EMAIL_EXISTS";
      err.patientId = existing._id;
      throw err;
    }

    const locked = await hasPendingHealthDecisionForEmail(normalizedEmail);
    if (locked) {
      const err = new Error(
        "This patient has a pending profile in the portal. Wait until the patient approves or rejects it before creating a new version."
      );
      err.status = 409;
      err.errorCode = "PENDING_PORTAL";
      throw err;
    }
  }

  if (ph.digits) {
    const existing = await Patient.findOne({ phoneDigits: ph.digits })
      .select("_id")
      .lean();

    if (existing) {
      const err = new Error("A patient with this phone already exists.");
      err.status = 409;
      err.errorCode = "PATIENT_PHONE_EXISTS";
      err.patientId = existing._id;
      throw err;
    }
  }

  const doc = await Patient.create({
    fullname,
    diseases: normalize(diseases),
    allergies: normalize(allergies),
    medications: normalize(medications),
    ...(normalizedEmail ? { email: normalizedEmail } : {}),
    bloodtype,
    gender: gRaw,
    organDonor,
    bloodDonor,
    isDeceased: false,
    ...(ph.phone ? { phone: ph.phone, phoneDigits: ph.digits } : {}),
    causeOfDeath: undefined,
    measurementSystem: sys,
    heightM,
    weightKg,
    country: String(country).trim(),
    state: String(state).trim(),
    city: String(city).trim(),
    createdBy: user._id,
    owners: [user._id],
    lastEditedBy: user._id,
    originalAnthro: { system: sys, height: H, weight: W },
    children: finalChildren,
    childrenCount: finalChildrenCount,
    parentEmail: finalParentEmail,
    ...(isMinor ? { minorKey: mk } : {}),
    birthDate: parsedBirthDate,
    age: ageNum,
    ageCategory: mapAgeToBand(ageNum),
  });

  return applyDynamicAgeToPatient(doc.toObject({ virtuals: true }));
};

export const updatePatientService = async ({ user, patientId, body }) => {
  const {
    fullname,
    diseases,
    allergies,
    medications,
    email,
    phone,
    bloodtype,
    gender,
    organDonor: organIn,
    bloodDonor: bloodIn,
    measurementSystem,
    height,
    weight,
    heightM,
    weightKg,
    country,
    state,
    city,
    children,
    childrenCount,
    parentEmail,
    birthDate,
    dateOfDeath,
  } = body;

  const accessQuery = {
    _id: patientId,
    $or: [{ owners: user._id }, { createdBy: user._id }],
  };

  const current = await Patient.findOne(accessQuery).lean();
  if (!current) {
    const err = new Error("Patient not found");
    err.status = 404;
    throw err;
  }

  const isCurrentAdult = isCurrentAdultWithoutGuardian(current);
  const isCurrentMinorLinked = isCurrentMinorOrGuardianLinked(current);
  const update = { lastEditedBy: user._id };
  const unset = {};

  if ("dateOfDeath" in body && !("isDeceased" in body) && !current.isDeceased) {
    const err = new Error("Send isDeceased together with dateOfDeath");
    err.status = 400;
    err.errorCode = "SEND_ISDECEASED_WITH_DATEOFDEATH";
    throw err;
  }

  const nextIsDeceased =
    "isDeceased" in body ? toBool(body.isDeceased) : !!current.isDeceased;
  const effectiveNormalChangedFields =
    collectEffectiveNormalChangedFieldsFromBody({ current, body });

  if (
    current.isDeceased &&
    effectiveNormalChangedFields.size > 0 &&
    !isCurrentMinorLinked
  ) {
    throwPatientDeceasedReadonly();
  }

  if (
    isCurrentAdult &&
    hasEffectiveDeathStatusChangeFromBody({ current, body, nextIsDeceased }) &&
    effectiveNormalChangedFields.size > 0
  ) {
    throwDeathStatusUpdateOnly();
  }

  if (
    isCurrentAdult &&
    !current.isDeceased &&
    nextIsDeceased &&
    (!("dateOfDeath" in body) || body.dateOfDeath === "" || body.dateOfDeath === null)
  ) {
    const err = new Error("Date of death is required when marking patient as deceased");
    err.status = 400;
    err.errorCode = "DATE_OF_DEATH_REQUIRED";
    throw err;
  }

  let nextBirthDate = current.birthDate;
  if ("birthDate" in body) {
    const raw = body.birthDate;
    const bd = isYmd(raw) ? parseYmdToUtcNoon(raw) : new Date(raw);

    if (Number.isNaN(bd.getTime())) {
      const err = new Error("Invalid birthdate");
      err.status = 400;
      err.errorCode = "INVALID_BIRTHDATE";
      throw err;
    }

    if (ymdUTC(bd) > ymdUTC(new Date())) {
      const err = new Error("Birthdate cannot be in the future");
      err.status = 400;
      err.errorCode = "BIRTHDATE_IN_FUTURE";
      throw err;
    }

    nextBirthDate = bd;
    update.birthDate = bd;
  }

  let nextDoD = current.dateOfDeath;

  if ("dateOfDeath" in body) {
    const raw = body.dateOfDeath;

    if (raw === "" || raw === null) {
      nextDoD = null;
      unset.dateOfDeath = 1;
      delete update.dateOfDeath;
    } else {
      const dd = isYmd(raw) ? parseYmdToUtcNoon(raw) : new Date(raw);
      if (Number.isNaN(dd.getTime())) {
        const err = new Error("Invalid date of death");
        err.status = 400;
        err.errorCode = "INVALID_DATE_OF_DEATH";
        throw err;
      }
      nextDoD = dd;
      update.dateOfDeath = dd;
      delete unset.dateOfDeath;
    }
  }

  if (nextIsDeceased) {
    if (!nextDoD) {
      nextDoD = new Date();
      update.dateOfDeath = nextDoD;
      delete unset.dateOfDeath;
    }

    if (ymdUTC(nextDoD) > ymdUTC(new Date())) {
      const err = new Error("Date of death cannot be in the future");
      err.status = 400;
      err.errorCode = "DATE_OF_DEATH_IN_FUTURE";
      throw err;
    }

    if (nextBirthDate && ymdUTC(nextDoD) < ymdUTC(nextBirthDate)) {
      const err = new Error("Date of death cannot be before birthdate");
      err.status = 400;
      err.errorCode = "DATE_OF_DEATH_BEFORE_BIRTHDATE";
      throw err;
    }
  } else {
    if (current.dateOfDeath && !("dateOfDeath" in body)) {
      unset.dateOfDeath = 1;
    }
  }

  const nextAge = computeDynamicAge({
    birthDate: nextBirthDate,
    isDeceased: nextIsDeceased,
    dateOfDeath: nextDoD,
    age: current.age,
  });

  const isMinorNext = Number.isFinite(nextAge) && nextAge < 18;
  const usesMinorGuardianFlow = isMinorNext || isCurrentMinorLinked;
  let parentEmailEffectiveForMinor = "";
  let currentMinorNameKey = "";
  let parentChildrenForMinor = [];
  let guardianIsDeceased = false;
  let minorKeyForApproval = "";

  if ("birthDate" in body || "dateOfDeath" in body || "isDeceased" in body) {
    update.age = nextAge;
    update.ageCategory = mapAgeToBand(nextAge);
  }

  if (usesMinorGuardianFlow) {
    parentEmailEffectiveForMinor = current.parentEmail
      ? normLower(current.parentEmail)
      : ("parentEmail" in body ? normLower(parentEmail) : "");

    if (!parentEmailEffectiveForMinor) {
      const err = new Error("Parent email is required for minors.");
      err.status = 400;
      err.errorCode = "PARENT_EMAIL_REQUIRED";
      throw err;
    }

    const parentEmailCheck = await verifyEmail(parentEmailEffectiveForMinor);
    if (!parentEmailCheck.ok) {
      const err = new Error(parentEmailCheck.error);
      err.status = 400;
      throw err;
    }

    const parentDoc = await Patient.findOne({ email: parentEmailEffectiveForMinor })
      .select("_id age children approvedAt approvedSnapshot isDeceased")
      .lean();

    if (!parentDoc) {
      const err = new Error("Access denied: parent email not found in the system.");
      err.status = 403;
      err.errorCode = "PARENT_NOT_FOUND";
      throw err;
    }

    if (!(Number(parentDoc.age) >= 18)) {
      const err = new Error("Access denied: parent record must be an adult.");
      err.status = 403;
      err.errorCode = "PARENT_NOT_ADULT";
      throw err;
    }

    if (!parentDoc.approvedAt) {
      const err = new Error(
        "Access denied: the parent/tutor must approve their profile before registering minors."
      );
      err.status = 403;
      err.errorCode = "PARENT_NOT_APPROVED";
      throw err;
    }

    currentMinorNameKey =
      childNameKeyFromMinorKey(current.minorKey, parentEmailEffectiveForMinor) ||
      normNameKey(current.fullname);
    const snap = parentDoc.approvedSnapshot;
    parentChildrenForMinor =
      Array.isArray(snap?.set?.children) ? snap.set.children :
      Array.isArray(snap?.children) ? snap.children :
      Array.isArray(parentDoc.children) ? parentDoc.children : [];

    const isListed = parentChildrenForMinor.some((c) => {
      return normNameKey(nameFromChild(c)) === currentMinorNameKey;
    });

    if (!isListed) {
      const err = new Error(
        "Access denied: minor name is not listed in the parent's children list."
      );
      err.status = 403;
      err.errorCode = "MINOR_NOT_LISTED";
      throw err;
    }

    guardianIsDeceased = parentDoc.isDeceased === true;
    minorKeyForApproval =
      current.minorKey || minorKeyOf(parentEmailEffectiveForMinor, current.fullname);

    if (guardianIsDeceased && effectiveNormalChangedFields.size > 0) {
      throwGuardianUnavailable();
    }

    if (
      current.isDeceased &&
      effectiveNormalChangedFields.size > 0 &&
      !guardianIsDeceased
    ) {
      throwPatientDeceasedReadonly();
    }
  }

  if (typeof fullname !== "undefined") {
    update.fullname = isMinorNext ? normStr(fullname) : fullname;
  }
  if (typeof diseases !== "undefined") update.diseases = normalize(diseases);
  if (typeof allergies !== "undefined") update.allergies = normalize(allergies);
  if (typeof medications !== "undefined") update.medications = normalize(medications);
  if (typeof bloodtype !== "undefined") update.bloodtype = bloodtype;

  if (usesMinorGuardianFlow) {
    if ("parentEmail" in body && current.parentEmail) {
      const incomingPE = normLower(parentEmail);
      const currentPE = normLower(current.parentEmail);

      if (!incomingPE || incomingPE !== currentPE) {
        const err = new Error(
          "You cannot modify or remove the parent email once it is registered."
        );
        err.status = 400;
        err.errorCode = "PARENT_EMAIL_IMMUTABLE";
        throw err;
      }
    }
  }

  const wantsChildrenUpdate = "children" in body || "childrenCount" in body;

  if (wantsChildrenUpdate) {
    if (isMinorNext) {
      const err = new Error("Minors cannot declare children.");
      err.status = 400;
      err.errorCode = "MINOR_CANNOT_DECLARE_CHILDREN";
      throw err;
    }

    const curChildren = Array.isArray(current.children) ? current.children : [];
    const lockedCount = curChildren.length;

    const nextCountParsed =
      "childrenCount" in body ? parseChildrenCount(childrenCount) : undefined;

    if ("childrenCount" in body && nextCountParsed === null) {
      const err = new Error("childrenCount must be an integer >= 0");
      err.status = 400;
      err.errorCode = "CHILDREN_COUNT_INVALID";
      throw err;
    }

    if (!("children" in body)) {
      if (typeof nextCountParsed === "number" && nextCountParsed !== lockedCount) {
        const err = new Error("To change childrenCount you must send children[] with names.");
        err.status = 400;
        err.errorCode = "CHILDREN_LIST_REQUIRED";
        throw err;
      }
    } else {
      const incoming = sanitizeChildren(children);

      if (typeof nextCountParsed === "number" && incoming.length !== nextCountParsed) {
        const err = new Error("childrenCount must match children[].length");
        err.status = 400;
        err.errorCode = "CHILDREN_COUNT_MISMATCH";
        throw err;
      }

      if (incoming.length < lockedCount) {
        const err = new Error("You can only add more children; removing is not allowed.");
        err.status = 400;
        err.errorCode = "CHILDREN_COUNT_DECREASE_FORBIDDEN";
        throw err;
      }

      for (let i = 0; i < lockedCount; i++) {
        const oldKey = normNameKey(curChildren[i]?.name);
        const newKey = normNameKey(incoming[i]?.name);
        if (!newKey || oldKey !== newKey) {
          const err = new Error("Existing children names cannot be edited.");
          err.status = 400;
          err.errorCode = "CHILDREN_NAMES_IMMUTABLE";
          throw err;
        }
      }

      update.children = incoming;
    }
  }

  if (usesMinorGuardianFlow) {
    if ("fullname" in update) {
      const proposedNameKey = normNameKey(update.fullname);
      const duplicateChild = parentChildrenForMinor.some((c) => {
        const childKey = normNameKey(nameFromChild(c));
        return childKey === proposedNameKey && childKey !== currentMinorNameKey;
      });

      if (duplicateChild) {
        const err = new Error("A child with this name already exists for this parent.");
        err.status = 409;
        err.errorCode = "CHILD_NAME_ALREADY_EXISTS";
        throw err;
      }
    }

    if (!current.minorKey) {
      const newMk = minorKeyOf(parentEmailEffectiveForMinor, current.fullname);
      if (!newMk) {
        const err = new Error("Invalid minor key");
        err.status = 400;
        err.errorCode = "MINOR_KEY_INVALID";
        throw err;
      }
      update.minorKey = newMk;
    }

    if ("parentEmail" in body || !current.parentEmail) {
      update.parentEmail = parentEmailEffectiveForMinor;
    }
  } else {
    if ("parentEmail" in body) {
      const err = new Error("parentEmail is only allowed for minors.");
      err.status = 400;
      err.errorCode = "PARENT_EMAIL_NOT_ALLOWED";
      throw err;
    }
    if (current.parentEmail) unset.parentEmail = 1;
    if (current.minorKey) unset.minorKey = 1;
  }

  if ("email" in body) {
    const e = String(body.email ?? "").trim().toLowerCase();

    if (current.email && current.email !== e) {
      const err = new Error("You can not modify the email once it is registered.");
      err.status = 400;
      throw err;
    }

    if (!e) {
      if (isMinorNext) {
        unset.email = 1;
      } else {
        const err = new Error("Email is required for adults");
        err.status = 400;
        throw err;
      }
    } else {
      const emailCheck = await verifyEmail(e);
      if (!emailCheck.ok) {
        const err = new Error(emailCheck.error);
        err.status = 400;
        throw err;
      }

      const existing = await Patient.findOne({
        email: e,
        _id: { $ne: current._id },
      }).select("_id").lean();

      if (existing) {
        const err = new Error(
          "A patient with this email already exists in the global database. Please use 'Search Global' to import them."
        );
        err.status = 409;
        err.errorCode = "PATIENT_EMAIL_EXISTS";
        err.patientId = existing._id;
        throw err;
      }

      update.email = e;
    }
  }

  if ("phone" in body) {
    const rawDigits = String(body.phone ?? "").replace(/\D/g, "");
    if (!rawDigits) {
      if (isMinorNext) {
        unset.phone = 1;
        unset.phoneDigits = 1;
      } else {
        const err = new Error("Phone is required for adults");
        err.status = 400;
        throw err;
      }
    } else {
      const effectiveCountry = "country" in body ? country : current.country;
      if (!effectiveCountry) {
        const err = new Error("Send country together with phone");
        err.status = 400;
        throw err;
      }
      const ph = normPhoneWithCountry(effectiveCountry, body.phone);
      if (!ph.ok) {
        const err = new Error(ph.error);
        err.status = 400;
        throw err;
      }

      const existing = await Patient.findOne({
        phoneDigits: ph.digits,
        _id: { $ne: current._id },
      }).select("_id").lean();

      if (existing) {
        const err = new Error("A patient with this phone already exists.");
        err.status = 409;
        err.errorCode = "PATIENT_PHONE_EXISTS";
        err.patientId = existing._id;
        throw err;
      }

      update.phone = ph.phone;
      update.phoneDigits = ph.digits;
    }
  }

  if (!isMinorNext) {
    const emailAfter =
      typeof update.email !== "undefined" ? !!update.email : !!current.email;
    const phoneAfter =
      typeof update.phone !== "undefined" ? !!update.phone : !!current.phone;

    if (!emailAfter) {
      const err = new Error("Email is required for adults");
      err.status = 400;
      throw err;
    }
    if (!phoneAfter) {
      const err = new Error("Phone is required for adults");
      err.status = 400;
      throw err;
    }
  }

  if ("country" in body) {
    const c = String(country ?? "").trim();
    if (!c) {
      const err = new Error("Country is required");
      err.status = 400;
      throw err;
    }
    update.country = c;
  }

  if ("state" in body) {
    const st = String(body.state ?? "").trim();
    if (!st) {
      const err = new Error("State/Province is required");
      err.status = 400;
      throw err;
    }
    update.state = st;
  }

  if ("city" in body) {
    const ct = String(body.city ?? "").trim();
    if (!ct) {
      const err = new Error("City is required");
      err.status = 400;
      throw err;
    }
    update.city = ct;
  }

  if ("gender" in body) {
    const g = normGender(gender);
    if (g !== "male" && g !== "female") {
      const err = new Error("Invalid gender (male|female)");
      err.status = 400;
      throw err;
    }
    update.gender = g;
  }

  if ("organDonor" in body) update.organDonor = toBool(organIn);
  if ("bloodDonor" in body) update.bloodDonor = toBool(bloodIn);

  if ("isDeceased" in body) {
    const deceased = toBool(body.isDeceased);
    update.isDeceased = deceased;

    if (deceased) {
      const cod = String(body.causeOfDeath ?? "").trim();
      if (!cod) {
        const err = new Error(
          "Cause of death is required when marking patient as deceased"
        );
        err.status = 400;
        throw err;
      }
      update.causeOfDeath = cod;
    } else {
      unset.dateOfDeath = 1;
      unset.causeOfDeath = 1;
      delete update.dateOfDeath;
      delete update.causeOfDeath;
    }
  } else if ("causeOfDeath" in body) {
    if (current.isDeceased) {
      const cod = String(body.causeOfDeath ?? "").trim();
      if (!cod) {
        const err = new Error(
          "Cause of death is required when marking patient as deceased"
        );
        err.status = 400;
        throw err;
      }
      update.causeOfDeath = cod;
    } else {
      const err = new Error("Send isDeceased together with causeOfDeath");
      err.status = 400;
      throw err;
    }
  }

  const touchSys = typeof measurementSystem !== "undefined";
  const touchH = typeof height !== "undefined";
  const touchW = typeof weight !== "undefined";

  if (touchSys || touchH || touchW) {
    if (!(touchSys && touchH && touchW)) {
      const err = new Error(
        "To update anthropometrics send measurementSystem, height and weight together"
      );
      err.status = 400;
      throw err;
    }

    update.measurementSystem = measurementSystem;
    update.height = height;
    update.weight = weight;
  } else {
    if (typeof heightM !== "undefined") update.heightM = heightM;
    if (typeof weightKg !== "undefined") update.weightKg = weightKg;
  }

  let changesFound = false;

  for (const k of Object.keys(unset)) {
    if (current[k] !== undefined && current[k] !== null) {
      changesFound = true;
      break;
    }
  }

  if (!changesFound) {
    if ("diseases" in update && arrKey(update.diseases) !== arrKey(current.diseases)) changesFound = true;
    if ("allergies" in update && arrKey(update.allergies) !== arrKey(current.allergies)) changesFound = true;
    if ("medications" in update && arrKey(update.medications) !== arrKey(current.medications)) changesFound = true;

    if ("children" in update) {
      const u = Array.isArray(update.children)
        ? update.children.map((c) => normNameKey(c?.name))
        : [];
      const c = Array.isArray(current.children)
        ? current.children.map((x) => normNameKey(x?.name))
        : [];
      if (u.join("|") !== c.join("|")) changesFound = true;
    }

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
    if (!changesFound && "isDeceased" in update && Boolean(update.isDeceased) !== Boolean(current.isDeceased)) changesFound = true;
    if (!changesFound && "causeOfDeath" in update && normStr(update.causeOfDeath) !== normStr(current.causeOfDeath)) changesFound = true;
    const currentChildren = Array.isArray(current.children) ? current.children : [];
    const currentChildrenCount =
      Number.isFinite(Number(current.childrenCount))
        ? Number(current.childrenCount)
        : currentChildren.length;

    if (!changesFound && "childrenCount" in update && Number(update.childrenCount) !== currentChildrenCount) changesFound = true;
    if (!changesFound && "parentEmail" in update && normLower(update.parentEmail) !== normLower(current.parentEmail)) changesFound = true;
    if (!changesFound && "birthDate" in update && ymdUTC(update.birthDate) !== ymdUTC(current.birthDate)) changesFound = true;
    if (!changesFound && "dateOfDeath" in update && ymdUTC(update.dateOfDeath) !== ymdUTC(current.dateOfDeath)) changesFound = true;
    if (!changesFound && "ageCategory" in update && normStr(update.ageCategory) !== normStr(current.ageCategory)) changesFound = true;

    const touchedAnthro =
      "measurementSystem" in update || "height" in update || "weight" in update;

    if (!changesFound && touchedAnthro) {
      const sys = normLower(update.measurementSystem || current.measurementSystem || "metric");
      const H = Number(update.height);
      const W = Number(update.weight);

      const nextHeightM = sys === "imperial" ? H * FT_TO_M : H;
      const nextWeightKg = sys === "imperial" ? W * LB_TO_KG : W;

      if (sys !== normLower(current.measurementSystem)) changesFound = true;
      else if (!near(nextHeightM, current.heightM)) changesFound = true;
      else if (!near(nextWeightKg, current.weightKg)) changesFound = true;
    }

    if (!changesFound && "heightM" in update && !near(update.heightM, current.heightM)) changesFound = true;
    if (!changesFound && "weightKg" in update && !near(update.weightKg, current.weightKg)) changesFound = true;
  }

  if (!changesFound) {
    const err = new Error("No changes detected. Update cancelled.");
    err.status = 400;
    err.errorCode = "NO_CHANGES";
    throw err;
  }

  const changedFields = collectEffectiveChangedFields({ current, update, unset });
  const hasDeathStatusChange =
    changedFields.has("isDeceased") ||
    changedFields.has("dateOfDeath") ||
    changedFields.has("causeOfDeath");
  const shouldAutoConfirmAdultDeathStatus = isCurrentAdult && hasDeathStatusChange;
  const shouldAutoConfirmMinorDeathStatus =
    usesMinorGuardianFlow && guardianIsDeceased && hasDeathStatusChange;

  if (shouldAutoConfirmAdultDeathStatus) {
    const mixedFields = [...changedFields].filter(
      (field) => !ADULT_DEATH_STATUS_ALLOWED_CHANGED_FIELDS.has(field)
    );

    if (mixedFields.length > 0) {
      throwDeathStatusUpdateOnly();
    }
  }

  if (shouldAutoConfirmMinorDeathStatus) {
    const mixedFields = [...changedFields].filter(
      (field) => !ADULT_DEATH_STATUS_ALLOWED_CHANGED_FIELDS.has(field)
    );

    if (mixedFields.length > 0) {
      throwGuardianUnavailable();
    }
  }

  const shouldAutoConfirmDeathStatus =
    shouldAutoConfirmAdultDeathStatus || shouldAutoConfirmMinorDeathStatus;

  if (current.email && !shouldAutoConfirmDeathStatus) {
    const locked = await hasPendingHealthDecisionForEmail(current.email);
    if (locked) {
      const err = new Error(
        "This patient has a pending profile in the portal. Wait until the patient approves or rejects it before editing."
      );
      err.status = 409;
      err.errorCode = "PENDING_PORTAL";
      throw err;
    }
  }

  if (usesMinorGuardianFlow && !shouldAutoConfirmMinorDeathStatus) {
    const mk =
      current.minorKey ||
      minorKeyForApproval ||
      minorKeyOf(parentEmailEffectiveForMinor || current.parentEmail, current.fullname);
    const lockedMinor = await hasPendingGuardianDecisionForMinorKey(
      mk,
      parentEmailEffectiveForMinor || current.parentEmail
    );
    if (lockedMinor) {
      const err = new Error("Pending guardian decision");
      err.status = 409;
      err.errorCode = "PENDING_GUARDIAN_DECISION";
      throw err;
    }
  }

  update.lastEditedBy = user._id;

  let deathStatusApproval = null;

  if (shouldAutoConfirmDeathStatus) {
    const approvedAt = new Date();
    const finalPatientForSnapshot = applyUnsetToObject(
      {
        ...current,
        ...update,
        updatedAt: approvedAt,
      },
      unset
    );
    const approvedSnapshot = buildApprovedSnapshotFromPatient(finalPatientForSnapshot);

    update.approvedAt = approvedAt;
    update.approvedSnapshot = approvedSnapshot;
    update.updatedAt = approvedAt;

    deathStatusApproval = {
      approvedAt,
      approvedSnapshot,
      patientKey: shouldAutoConfirmMinorDeathStatus ? minorKeyForApproval : "",
    };
  }

  const updateDoc = {};
  if (Object.keys(update).length) updateDoc.$set = update;
  if (Object.keys(unset).length) updateDoc.$unset = unset;

  const updateOptions = {
    new: true,
    runValidators: true,
    context: "query",
    ...(deathStatusApproval ? { timestamps: false } : {}),
  };

  const updated = await Patient.findOneAndUpdate(
    { _id: patientId, $or: [{ owners: user._id }, { createdBy: user._id }] },
    Object.keys(updateDoc).length ? updateDoc : { $set: {} },
    updateOptions
  ).lean({ virtuals: true });

  if (!updated) {
    const err = new Error("Paciente no encontrado");
    err.status = 404;
    throw err;
  }

  if (deathStatusApproval) {
    const email = normLower(updated.email || current.email);

    if (shouldAutoConfirmMinorDeathStatus) {
      await PatientHistory.create({
        patientKey: deathStatusApproval.patientKey || undefined,
        approvedFromProfile: updated._id,
        editedBy: updated.lastEditedBy || updated.createdBy || user._id || null,
        approvedSnapshot: deathStatusApproval.approvedSnapshot,
        approvedAt: deathStatusApproval.approvedAt,
      });
    } else {
      await PatientHistory.create({
        patientEmail: email || undefined,
        patientPhoneDigits: updated.phoneDigits || current.phoneDigits || undefined,
        approvedFromProfile: updated._id,
        editedBy: updated.lastEditedBy || updated.createdBy || user._id || null,
        approvedSnapshot: deathStatusApproval.approvedSnapshot,
        approvedAt: deathStatusApproval.approvedAt,
      });
    }

    if (shouldAutoConfirmAdultDeathStatus && email) {
      await User.findOneAndUpdate(
        { email, role: "patient" },
        { $set: { lastHealthDecisionAt: deathStatusApproval.approvedAt } },
        { new: false }
      );
    }

    if (current.isDeceased !== true && updated.isDeceased === true) {
      await cancelFutureActiveAppointmentsDueToDeath(
        updated._id,
        deathStatusApproval.approvedAt
      );

      if (shouldAutoConfirmAdultDeathStatus) {
        await cancelFutureActiveChildAppointmentsDueToGuardianUnavailable(
          email,
          deathStatusApproval.approvedAt
        );
      }
    }
  }

  return applyDynamicAgeToPatient(updated);
};

export const reassignMinorGuardianService = async ({ user, patientId, body }) => {
  const current = await Patient.findOne({
    _id: patientId,
    $or: [{ owners: user._id }, { createdBy: user._id }],
  }).lean();

  if (!current) {
    const err = new Error("Paciente no encontrado");
    err.status = 404;
    throw err;
  }

  const targetAge = computeDynamicAge(current);
  const isTargetMinorOrLinked =
    (Number.isFinite(targetAge) && targetAge < 18) ||
    !!current.parentEmail ||
    !!current.minorKey;

  if (current.isDeceased === true || !isTargetMinorOrLinked) {
    throw guardianReassignmentError(
      "GUARDIAN_REASSIGNMENT_NOT_MINOR",
      "Guardian reassignment is only available for living minors.",
      400
    );
  }

  const oldParentEmail =
    normLower(current.parentEmail) || parentEmailFromMinorKey(current.minorKey);
  const oldMinorKey =
    normLower(current.minorKey) || minorKeyOf(oldParentEmail, current.fullname);

  if (!oldParentEmail || !oldMinorKey || !normStr(current.fullname)) {
    throw guardianReassignmentError(
      "GUARDIAN_REASSIGNMENT_NOT_MINOR",
      "Guardian reassignment is only available for guardian-linked minors.",
      400
    );
  }

  const newParentEmail = normLower(body?.newParentEmail);

  if (newParentEmail && newParentEmail === oldParentEmail) {
    throw guardianReassignmentError(
      "GUARDIAN_REASSIGNMENT_NO_CHANGES",
      "The new guardian email must be different from the current guardian email.",
      400
    );
  }

  const currentGuardian = await Patient.findOne({ email: oldParentEmail })
    .select("_id isDeceased")
    .lean();

  if (!currentGuardian || currentGuardian.isDeceased !== true) {
    throw guardianReassignmentError(
      "CURRENT_GUARDIAN_NOT_UNAVAILABLE",
      "Current guardian must exist and be deceased before reassignment.",
      409
    );
  }

  if (!newParentEmail) {
    throw guardianReassignmentError(
      "NEW_GUARDIAN_NOT_FOUND",
      "New guardian was not found.",
      404
    );
  }

  const newGuardian = await Patient.findOne({ email: newParentEmail })
    .select("_id email age birthDate dateOfDeath isDeceased approvedAt approvedSnapshot children")
    .lean();

  if (!newGuardian) {
    throw guardianReassignmentError(
      "NEW_GUARDIAN_NOT_FOUND",
      "New guardian was not found.",
      404
    );
  }

  if (newGuardian.isDeceased === true) {
    throw guardianReassignmentError(
      "NEW_GUARDIAN_DECEASED",
      "New guardian must be alive.",
      409
    );
  }

  const newGuardianAge = computeDynamicAge(newGuardian);
  if (!(Number.isFinite(newGuardianAge) && newGuardianAge >= 18)) {
    throw guardianReassignmentError(
      "NEW_GUARDIAN_NOT_ADULT",
      "New guardian must be an adult.",
      409
    );
  }

  if (!newGuardian.approvedAt) {
    throw guardianReassignmentError(
      "NEW_GUARDIAN_NOT_APPROVED",
      "New guardian profile must be approved.",
      409
    );
  }

  const minorNameKey = normNameKey(current.fullname);
  const isListedUnderNewGuardian = approvedChildrenFromGuardian(newGuardian).some((child) => {
    return normNameKey(nameFromChild(child)) === minorNameKey;
  });

  if (!isListedUnderNewGuardian) {
    throw guardianReassignmentError(
      "MINOR_NOT_LISTED_UNDER_NEW_GUARDIAN",
      "Minor is not listed under the new guardian.",
      409
    );
  }

  const newMinorKey = minorKeyOf(newParentEmail, current.fullname);
  const approvedAt = new Date();
  const finalPatientForSnapshot = {
    ...current,
    parentEmail: newParentEmail,
    minorKey: newMinorKey,
    approvedAt,
    updatedAt: approvedAt,
    lastEditedBy: user._id,
  };
  const approvedSnapshot = buildApprovedSnapshotFromPatient(finalPatientForSnapshot);

  approvedSnapshot.set.parentEmail = newParentEmail;
  approvedSnapshot.set.minorKey = newMinorKey;
  delete approvedSnapshot.unset.parentEmail;
  delete approvedSnapshot.unset.minorKey;

  const groupQuery = {
    $or: [
      { minorKey: oldMinorKey },
      { _id: current._id },
      { parentEmail: oldParentEmail, fullname: current.fullname },
    ],
  };
  const update = {
    $set: {
      parentEmail: newParentEmail,
      minorKey: newMinorKey,
      approvedAt,
      approvedSnapshot,
      updatedAt: approvedAt,
      lastEditedBy: user._id,
    },
  };

  const updateResult = await Patient.updateMany(groupQuery, update, {
    runValidators: true,
    context: "query",
    timestamps: false,
  });

  await PatientHistory.create({
    patientKey: newMinorKey,
    patientId: current._id,
    approvedFromProfile: current._id,
    editedBy: user._id || null,
    approvedSnapshot,
    approvedAt,
    oldParentEmail,
    newParentEmail,
    oldMinorKey,
    newMinorKey,
  });

  const patient = applyDynamicAgeToPatient({
    ...current,
    ...update.$set,
  });

  return {
    message: "Guardian reassigned successfully.",
    patient,
    updatedCount: updateResult?.modifiedCount ?? updateResult?.matchedCount ?? 0,
  };
};
