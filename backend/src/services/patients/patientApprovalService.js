import Patient from "../../models/Patient.js";
import User from "../../models/User.js";
import PatientHistory from "../../models/PatientHistory.js";
import Diagnosis from "../../models/Diagnosis.js";
import {
  computeHealthSnapshotByEmail,
  buildHealthSnapshotFromPatients,
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
  "phone",
  "phoneDigits",
  "childrenCount",
  "birthDate",
  "dateOfDeath",
];

const SYNC_FIELDS_ARRAY = ["diseases", "allergies", "medications", "children"];

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

  const phoneVal = sv(snapshot.phone);
  if (phoneVal !== undefined) {
    canonical.phone = phoneVal;
    canonical.phoneDigits = String(phoneVal).replace(/\D/g, "");
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