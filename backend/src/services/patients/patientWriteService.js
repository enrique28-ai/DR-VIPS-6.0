import Patient from "../../models/Patient.js";
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
} from "../../controllers/helpers/patienthelpers.js";

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
