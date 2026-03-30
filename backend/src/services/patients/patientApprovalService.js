import Patient from "../../models/Patient.js";
import User from "../../models/User.js";
import PatientHistory from "../../models/PatientHistory.js";
import { computeHealthSnapshotByEmail } from "../../controllers/helpers/patienthelpers.js";

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