import Patient from "../../models/Patient.js";
import User from "../../models/User.js";
import PatientHistory from "../../models/PatientHistory.js";
import Diagnosis from "../../models/Diagnosis.js";
import { cancelFutureActiveAppointmentsDueToDeath } from "../appointments/appointmentLifecycleService.js";
import {
  computeHealthSnapshotByEmail,
  buildHealthSnapshotFromPatients,
  normLower,
  normNameKey,
  minorKeyOf,
  minorQueryByBirthDateOrLegacy,
  computeHealthSnapshotByMinorKey,
} from "../../controllers/helpers/patienthelpers.js";

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
  "birthCountry",
  "birthState",
  "birthCity",
  "phone",
  "phoneDigits",
  "phoneCountry",
  "phoneCountryIso",
  "childrenCount",
  "birthDate",
  "dateOfDeath",
];

const SYNC_FIELDS_ARRAY = ["diseases", "allergies", "medications", "children"];

const nameFromChild = (child) => (typeof child === "string" ? child : child?.name);

const snapshotSetOf = (snapshot) =>
  snapshot && typeof snapshot === "object" && snapshot.set && typeof snapshot.set === "object"
    ? snapshot.set
    : snapshot;

const approvedFullnameFromSnapshot = (snapshot) => {
  const set = snapshotSetOf(snapshot);
  if (typeof set?.fullname === "string") return set.fullname;
  if (typeof snapshot?.fullname === "string") return snapshot.fullname;
  return "";
};

const childNameKeyFromMinorKey = (minorKey, parentEmail) => {
  const mk = normLower(minorKey);
  const prefix = `${normLower(parentEmail)}::`;
  return mk && mk.startsWith(prefix) ? mk.slice(prefix.length) : "";
};

const renameChildList = (children, oldChildNameOrKey, newChildName) => {
  if (!Array.isArray(children)) return [];

  const oldKey = normNameKey(oldChildNameOrKey);
  if (!oldKey) return children;

  let replaced = false;
  return children.map((child) => {
    const childKey = normNameKey(nameFromChild(child));
    if (replaced || childKey !== oldKey) return child;

    replaced = true;
    return typeof child === "string" ? newChildName : { ...child, name: newChildName };
  });
};

const oldMinorKeyForDoc = (parentEmail, doc) => {
  if (doc?.minorKey) return doc.minorKey;
  return minorKeyOf(parentEmail, approvedFullnameFromSnapshot(doc?.approvedSnapshot));
};

async function renameApprovedChildForParent({ parentEmail, oldChildNameOrKey, newChildName }) {
  const parentDocs = await Patient.find({ email: parentEmail })
    .select("_id children childrenCount approvedSnapshot")
    .lean();

  for (const parentDoc of parentDocs) {
    const set = {};
    const children = Array.isArray(parentDoc.children) ? parentDoc.children : [];
    const renamedChildren = renameChildList(children, oldChildNameOrKey, newChildName);

    set.children = renamedChildren;
    set.childrenCount = renamedChildren.length;

    if (Array.isArray(parentDoc.approvedSnapshot?.set?.children)) {
      const renamedSnapshotChildren = renameChildList(
        parentDoc.approvedSnapshot.set.children,
        oldChildNameOrKey,
        newChildName
      );

      set["approvedSnapshot.set.children"] = renamedSnapshotChildren;
      set["approvedSnapshot.set.childrenCount"] = renamedSnapshotChildren.length;
    }

    if (Array.isArray(parentDoc.approvedSnapshot?.children)) {
      const renamedLegacySnapshotChildren = renameChildList(
        parentDoc.approvedSnapshot.children,
        oldChildNameOrKey,
        newChildName
      );

      set["approvedSnapshot.children"] = renamedLegacySnapshotChildren;
      set["approvedSnapshot.childrenCount"] = renamedLegacySnapshotChildren.length;
    }

    await Patient.updateOne({ _id: parentDoc._id }, { $set: set }, { timestamps: false });
  }
}

export const approvePatientProfileService = async ({ user, profileId }) => {
  if (user.role !== "patient") {
    const err = new Error("Insufficient role");
    err.status = 403;
    throw err;
  }

  const email = (user.email || "").toLowerCase().trim();
  if (!email) {
    const err = new Error("User has no email on file");
    err.status = 400;
    throw err;
  }

  const doc = await Patient.findOne({ _id: profileId, email }).lean();
  if (!doc) {
    const err = new Error("Patient profile not found for this user");
    err.status = 404;
    throw err;
  }

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
    },
  };

  if (Object.keys(canonicalUnset).length > 0) {
    updateDoc.$unset = canonicalUnset;
  }

  await Patient.updateMany({ email }, updateDoc, { timestamps: false });

  await PatientHistory.create({
    patientEmail: email,
    patientPhoneDigits: doc.phoneDigits || undefined,
    approvedFromProfile: doc._id,
    editedBy: doc.lastEditedBy || doc.createdBy || null,
    approvedSnapshot,
    approvedAt,
  });

  await User.findByIdAndUpdate(
    user._id,
    { $set: { lastHealthDecisionAt: new Date() } },
    { new: false }
  );

  const { hasRecords, snapshot } = await computeHealthSnapshotByEmail(email);

  return { ok: true, hasRecords, snapshot, pendingDecision: false };
};

export const rejectPatientProfileService = async ({ user, profileId }) => {
  if (user.role !== "patient") {
    const err = new Error("Insufficient role");
    err.status = 403;
    throw err;
  }

  const email = (user.email || "").toLowerCase().trim();
  if (!email) {
    const err = new Error("User has no email on file");
    err.status = 400;
    throw err;
  }

  const allPats = await Patient.find({ email }).sort({ updatedAt: -1 }).lean();
  if (!allPats.length) {
    const err = new Error("No patient profiles found for this user");
    err.status = 404;
    throw err;
  }

  const target = allPats.find((p) => String(p._id) === String(profileId));
  if (!target) {
    const err = new Error("Patient profile not found for this user");
    err.status = 404;
    throw err;
  }

  const withoutTarget = allPats.filter((p) => String(p._id) !== String(profileId));

  if (withoutTarget.length === 0) {
    const snap = target.approvedSnapshot;

    const prevSet =
      snap && typeof snap === "object"
        ? snap.set && typeof snap.set === "object"
          ? snap.set
          : snap
        : null;

    const prevUnset =
      snap && typeof snap === "object" && snap.unset && typeof snap.unset === "object"
        ? snap.unset
        : {};

    if (prevSet && Object.keys(prevSet).length > 0) {
      const updateDoc = { $set: prevSet };
      if (Object.keys(prevUnset).length > 0) updateDoc.$unset = prevUnset;

      if (target?.approvedAt) {
        updateDoc.$set.updatedAt = target.approvedAt;
      }

      await Patient.updateMany({ email }, updateDoc, { timestamps: false });

      await User.findByIdAndUpdate(
        user._id,
        { $set: { lastHealthDecisionAt: new Date() } },
        { new: false }
      );

      const { hasRecords, snapshot } = await computeHealthSnapshotByEmail(email);
      return { ok: true, hasRecords, snapshot, pendingDecision: false };
    }

    await Diagnosis.deleteMany({ patient: profileId });
    await Patient.deleteOne({ _id: profileId, email });

    await User.findByIdAndUpdate(
      user._id,
      { $set: { lastHealthDecisionAt: new Date() } },
      { new: false }
    );

    return { ok: true, hasRecords: false, snapshot: null, pendingDecision: false };
  }

  const prevBase = buildHealthSnapshotFromPatients(withoutTarget, email);
  const { snapshot } = prevBase;

  const canonical = {};
  const sv = (wrapper) => {
    if (!wrapper || typeof wrapper !== "object") return undefined;
    if (wrapper.value === undefined || wrapper.value === null) return undefined;
    return wrapper.value;
  };

  if (snapshot.fullname) canonical.fullname = snapshot.fullname;
  if (snapshot.ageCategory) canonical.ageCategory = snapshot.ageCategory;

  if (typeof snapshot.isDeceased === "boolean") {
    canonical.isDeceased = snapshot.isDeceased;

    if (snapshot.isDeceased && snapshot.causeOfDeath) {
      canonical.causeOfDeath = snapshot.causeOfDeath;
    } else if (!snapshot.isDeceased) {
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

  const birthCountryVal = sv(snapshot.birthCountry);
  if (birthCountryVal !== undefined) canonical.birthCountry = birthCountryVal;

  const birthStateVal = sv(snapshot.birthState);
  if (birthStateVal !== undefined) canonical.birthState = birthStateVal;

  const birthCityVal = sv(snapshot.birthCity);
  if (birthCityVal !== undefined) canonical.birthCity = birthCityVal;

  const phoneVal = sv(snapshot.phone);
  if (phoneVal !== undefined) {
    canonical.phone = phoneVal;
    canonical.phoneDigits = String(phoneVal).replace(/\D/g, "");
  }

  const phoneCountryVal = sv(snapshot.phoneCountry);
  if (phoneCountryVal !== undefined) canonical.phoneCountry = String(phoneCountryVal).trim();

  const phoneCountryIsoVal = sv(snapshot.phoneCountryIso);
  if (phoneCountryIsoVal !== undefined) {
    canonical.phoneCountryIso = String(phoneCountryIsoVal).trim().toUpperCase();
  }

  if (snapshot.measurementSystem) canonical.measurementSystem = snapshot.measurementSystem;
  if (typeof snapshot.heightM === "number") canonical.heightM = snapshot.heightM;
  if (typeof snapshot.weightKg === "number") canonical.weightKg = snapshot.weightKg;
  if (typeof snapshot.bmi === "number") canonical.bmi = snapshot.bmi;
  if (snapshot.bmiCategory) canonical.bmiCategory = snapshot.bmiCategory;

  canonical.diseases = Array.isArray(snapshot.diseases) ? snapshot.diseases : [];
  canonical.allergies = Array.isArray(snapshot.allergies) ? snapshot.allergies : [];
  canonical.medications = Array.isArray(snapshot.medications) ? snapshot.medications : [];

  const updateDoc = { $set: canonical };

  if (canonical.isDeceased === false) {
    updateDoc.$unset = { causeOfDeath: 1 };
  }

  if (target?.approvedAt) {
    updateDoc.$set.updatedAt = target.approvedAt;
  }

  await Patient.updateMany({ email }, updateDoc, { timestamps: false });

  await User.findByIdAndUpdate(
    user._id,
    { $set: { lastHealthDecisionAt: new Date() } },
    { new: false }
  );

  const finalState = await computeHealthSnapshotByEmail(email);

  return {
    ok: true,
    hasRecords: finalState.hasRecords,
    snapshot: finalState.snapshot,
    pendingDecision: false,
  };
};

export const approveChildProfileService = async ({ user, profileId }) => {
  if (user.role !== "patient") {
    const err = new Error("Insufficient role");
    err.status = 403;
    throw err;
  }

  const parentEmail = normLower(user.email);
  const referenceDate = new Date();

  const doc = await Patient.findOne({
    _id: profileId,
    parentEmail,
    ...minorQueryByBirthDateOrLegacy(referenceDate, { includeDeceased: true }),
  }).lean();

  if (!doc) {
    const err = new Error("CHILD_PROFILE_NOT_FOUND");
    err.status = 404;
    throw err;
  }

  const previousApprovedFullname = approvedFullnameFromSnapshot(doc.approvedSnapshot);
  const previousApprovedState = snapshotSetOf(doc.approvedSnapshot);
  const shouldCancelAppointmentsDueToDeath =
    doc.isDeceased === true && previousApprovedState?.isDeceased !== true;
  const approvedFullname = String(doc.fullname ?? "").trim();
  const oldKey = oldMinorKeyForDoc(parentEmail, doc);
  const newKey = minorKeyOf(parentEmail, approvedFullname);

  if (!oldKey || !newKey) {
    const err = new Error("Invalid minor key");
    err.status = 400;
    err.errorCode = "MINOR_KEY_INVALID";
    throw err;
  }

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
  canonicalSet.fullname = approvedFullname;
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

  if (Object.keys(canonicalUnset).length > 0) {
    updateDoc.$unset = canonicalUnset;
  }

  await Patient.updateMany(
    {
      parentEmail,
      minorKey: oldKey,
      ...minorQueryByBirthDateOrLegacy(referenceDate, { includeDeceased: true }),
    },
    updateDoc,
    { timestamps: false }
  );

  if (oldKey !== newKey) {
    await renameApprovedChildForParent({
      parentEmail,
      oldChildNameOrKey:
        previousApprovedFullname || childNameKeyFromMinorKey(oldKey, parentEmail),
      newChildName: approvedFullname,
    });
  }

  await PatientHistory.create({
    patientKey: newKey,
    approvedAt,
    approvedSnapshot,
    approvedFromProfile: profileId,
    editedBy: doc.lastEditedBy || doc.createdBy || null,
  });

  if (shouldCancelAppointmentsDueToDeath) {
    await cancelFutureActiveAppointmentsDueToDeath(doc._id, approvedAt);
  }

  const { hasRecords, snapshot } = await computeHealthSnapshotByMinorKey(newKey, parentEmail);

  return { ok: true, hasRecords, snapshot, pendingDecision: false };
};

export const rejectChildProfileService = async ({ user, profileId }) => {
  if (user.role !== "patient") {
    const err = new Error("Insufficient role");
    err.status = 403;
    throw err;
  }

  const parentEmail = normLower(user.email);
  const referenceDate = new Date();

  const target = await Patient.findOne({
    _id: profileId,
    parentEmail,
    ...minorQueryByBirthDateOrLegacy(referenceDate, { includeDeceased: true }),
  }).lean();

  if (!target) {
    const err = new Error("CHILD_PROFILE_NOT_FOUND");
    err.status = 404;
    throw err;
  }

  const key = oldMinorKeyForDoc(parentEmail, target);

  if (!key) {
    const err = new Error("Invalid minor key");
    err.status = 400;
    err.errorCode = "MINOR_KEY_INVALID";
    throw err;
  }

  const allPats = await Patient.find({
    parentEmail,
    minorKey: key,
    ...minorQueryByBirthDateOrLegacy(referenceDate, { includeDeceased: true }),
  })
    .sort({ updatedAt: -1 })
    .lean();

  if (!allPats.length) {
    const err = new Error("CHILD_GROUP_NOT_FOUND");
    err.status = 404;
    throw err;
  }

  const withoutTarget = allPats.filter((p) => String(p._id) !== String(profileId));
  const decidedAt = new Date();

  if (withoutTarget.length === 0) {
    const snap = target.approvedSnapshot;

    const prevSet =
      snap && typeof snap === "object"
        ? snap.set && typeof snap.set === "object"
          ? snap.set
          : snap
        : null;

    const prevUnset =
      snap && typeof snap === "object" && snap.unset && typeof snap.unset === "object"
        ? snap.unset
        : {};

    if (prevSet && Object.keys(prevSet).length > 0) {
      const updateDoc = {
        $set: {
          ...prevSet,
          approvedSnapshot: snap,
          approvedAt: decidedAt,
          minorKey: key,
        },
      };

      if (Object.keys(prevUnset).length > 0) {
        updateDoc.$unset = prevUnset;
      }

      await Patient.updateMany(
        {
          parentEmail,
          minorKey: key,
          ...minorQueryByBirthDateOrLegacy(referenceDate, { includeDeceased: true }),
        },
        updateDoc,
        { timestamps: false }
      );

      const finalState = await computeHealthSnapshotByMinorKey(key, parentEmail);
      return {
        ok: true,
        hasRecords: finalState.hasRecords,
        snapshot: finalState.snapshot,
        pendingDecision: false,
      };
    }

    await Diagnosis.deleteMany({ patient: profileId });
    await Patient.deleteOne({ _id: profileId, parentEmail });

    return { ok: true, hasRecords: false, snapshot: null, pendingDecision: false };
  }

  const prevBase = buildHealthSnapshotFromPatients(withoutTarget, null);
  const { snapshot } = prevBase;

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

  const birthCountryVal = sv(snapshot.birthCountry);
  if (birthCountryVal !== undefined) canonical.birthCountry = birthCountryVal;

  const birthStateVal = sv(snapshot.birthState);
  if (birthStateVal !== undefined) canonical.birthState = birthStateVal;

  const birthCityVal = sv(snapshot.birthCity);
  if (birthCityVal !== undefined) canonical.birthCity = birthCityVal;

  const phoneVal = sv(snapshot.phone);
  if (phoneVal !== undefined) {
    canonical.phone = phoneVal;
    canonical.phoneDigits = String(phoneVal).replace(/\D/g, "");
  }

  const phoneCountryVal = sv(snapshot.phoneCountry);
  if (phoneCountryVal !== undefined) canonical.phoneCountry = String(phoneCountryVal).trim();

  const phoneCountryIsoVal = sv(snapshot.phoneCountryIso);
  if (phoneCountryIsoVal !== undefined) {
    canonical.phoneCountryIso = String(phoneCountryIsoVal).trim().toUpperCase();
  }

  if (snapshot.measurementSystem) canonical.measurementSystem = snapshot.measurementSystem;
  if (typeof snapshot.heightM === "number") canonical.heightM = snapshot.heightM;
  if (typeof snapshot.weightKg === "number") canonical.weightKg = snapshot.weightKg;
  if (typeof snapshot.bmi === "number") canonical.bmi = snapshot.bmi;
  if (snapshot.bmiCategory) canonical.bmiCategory = snapshot.bmiCategory;

  canonical.diseases = Array.isArray(snapshot.diseases) ? snapshot.diseases : [];
  canonical.allergies = Array.isArray(snapshot.allergies) ? snapshot.allergies : [];
  canonical.medications = Array.isArray(snapshot.medications) ? snapshot.medications : [];

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
      minorKey: key,
    },
  };

  if (Object.keys(canonicalUnset).length > 0) {
    updateDoc.$unset = canonicalUnset;
  }

  await Patient.updateMany(
    {
      parentEmail,
      minorKey: key,
      ...minorQueryByBirthDateOrLegacy(referenceDate, { includeDeceased: true }),
    },
    updateDoc,
    { timestamps: false }
  );

  const finalState = await computeHealthSnapshotByMinorKey(key, parentEmail);

  return {
    ok: true,
    hasRecords: finalState.hasRecords,
    snapshot: finalState.snapshot,
    pendingDecision: false,
  };
};
