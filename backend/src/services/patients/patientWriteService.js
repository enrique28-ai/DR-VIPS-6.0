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
  normStr,
  normUpper,
  arrKey,
  near,
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

  const update = { lastEditedBy: user._id };
  const unset = {};

  if ("dateOfDeath" in body && !("isDeceased" in body)) {
    const err = new Error("Send isDeceased together with dateOfDeath");
    err.status = 400;
    err.errorCode = "SEND_ISDECEASED_WITH_DATEOFDEATH";
    throw err;
  }

  const nextIsDeceased =
    "isDeceased" in body ? toBool(body.isDeceased) : !!current.isDeceased;

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

  if ("birthDate" in body || "dateOfDeath" in body || "isDeceased" in body) {
    update.age = nextAge;
    update.ageCategory = mapAgeToBand(nextAge);
  }

  if (typeof fullname !== "undefined" && !isMinorNext) update.fullname = fullname;
  if (typeof diseases !== "undefined") update.diseases = normalize(diseases);
  if (typeof allergies !== "undefined") update.allergies = normalize(allergies);
  if (typeof medications !== "undefined") update.medications = normalize(medications);
  if (typeof bloodtype !== "undefined") update.bloodtype = bloodtype;

  if (isMinorNext) {
    if ("fullname" in body) {
      const incomingNameKey = normNameKey(fullname);
      const currentNameKey = normNameKey(current.fullname);
      if (incomingNameKey && currentNameKey && incomingNameKey !== currentNameKey) {
        const err = new Error("Minor fullname is immutable");
        err.status = 400;
        err.errorCode = "MINOR_FULLNAME_IMMUTABLE";
        throw err;
      }
    }

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

  const nextFullname = "fullname" in update ? update.fullname : current.fullname;

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

  if (isMinorNext) {
    const parentEmailEffective =
      "parentEmail" in body ? normLower(parentEmail) : normLower(current.parentEmail);

    if (!parentEmailEffective) {
      const err = new Error("Parent email is required for minors.");
      err.status = 400;
      err.errorCode = "PARENT_EMAIL_REQUIRED";
      throw err;
    }

    const parentEmailCheck = await verifyEmail(parentEmailEffective);
    if (!parentEmailCheck.ok) {
      const err = new Error(parentEmailCheck.error);
      err.status = 400;
      throw err;
    }

    const parentDoc = await Patient.findOne({ email: parentEmailEffective })
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
      const err = new Error(
        "Access denied: minor name is not listed in the parent's children list."
      );
      err.status = 403;
      err.errorCode = "MINOR_NOT_LISTED";
      throw err;
    }

    if (!current.minorKey) {
      const newMk = minorKeyOf(parentEmailEffective, current.fullname);
      if (!newMk) {
        const err = new Error("Invalid minor key");
        err.status = 400;
        err.errorCode = "MINOR_KEY_INVALID";
        throw err;
      }
      update.minorKey = newMk;
    }

    if ("parentEmail" in body || !current.parentEmail) {
      update.parentEmail = parentEmailEffective;
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
      const ph = normPhoneWithCountry(effectiveCountry, rawDigits);
      if (!ph.ok) {
        const err = new Error(ph.error);
        err.status = 400;
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
      unset.causeOfDeath = 1;
      delete update.causeOfDeath;
    }
  } else if ("causeOfDeath" in body) {
    const err = new Error("Send isDeceased together with causeOfDeath");
    err.status = 400;
    throw err;
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
    if (typeof current[k] !== "undefined") {
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

  if (current.email) {
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

  const currentAgeDyn = computeDynamicAge(current);
  const isCurrentMinor =
    Number.isFinite(currentAgeDyn) && currentAgeDyn < 18 && current.parentEmail;

  if (isCurrentMinor) {
    const mk = current.minorKey || minorKeyOf(current.parentEmail, current.fullname);
    const lockedMinor = await hasPendingGuardianDecisionForMinorKey(
      mk,
      current.parentEmail
    );
    if (lockedMinor) {
      const err = new Error("Pending guardian decision");
      err.status = 409;
      err.errorCode = "PENDING_GUARDIAN_DECISION";
      throw err;
    }
  }

  update.lastEditedBy = user._id;

  const updateDoc = {};
  if (Object.keys(update).length) updateDoc.$set = update;
  if (Object.keys(unset).length) updateDoc.$unset = unset;

  const updated = await Patient.findOneAndUpdate(
    { _id: patientId, $or: [{ owners: user._id }, { createdBy: user._id }] },
    Object.keys(updateDoc).length ? updateDoc : { $set: {} },
    { new: true, runValidators: true, context: "query" }
  ).lean({ virtuals: true });

  if (!updated) {
    const err = new Error("Paciente no encontrado");
    err.status = 404;
    throw err;
  }

  return applyDynamicAgeToPatient(updated);
};
