import mongoose from "mongoose";
import { isDeepStrictEqual } from "node:util";
import Patient from "../../models/Patient.js";
import User from "../../models/User.js";
import PatientHistory from "../../models/PatientHistory.js";
import Diagnosis from "../../models/Diagnosis.js";
import { cancelFutureActiveAppointmentsDueToDeath } from "../appointments/appointmentLifecycleService.js";
import { captureHistorySnapshot, hasChildDeathChange, minorProposalHistory, pendingMinorSiblingProposals, snapshotSet, withConfirmedDeathFields } from "./patientHistorySnapshot.js";
import {
  computeHealthSnapshotByEmail,
  approvedChildrenForProfiles,
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

async function renameApprovedChildForParent({ parentEmail, oldChildNameOrKey, newChildName, session }) {
  const parentDocs = await Patient.find({ email: parentEmail }, null, { session })
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

    await Patient.updateOne({ _id: parentDoc._id }, { $set: set }, { timestamps: false, session });
  }
}

const assertLivingReview = (deceased) => {
  if (deceased) {
    const err = new Error("A deceased patient's profile cannot be approved or rejected");
    err.status = 409;
    err.errorCode = "PATIENT_DECEASED_READ_ONLY";
    throw err;
  }
};

const assertReviewVersion = (profile, expectedUpdatedAt) => {
  if (expectedUpdatedAt === undefined) return;
  if (typeof expectedUpdatedAt === "string"
    && new Date(expectedUpdatedAt).getTime() === new Date(profile.updatedAt).getTime()) return;
  const err = new Error("The patient profile changed. Review the latest version before deciding.");
  err.status = 409;
  err.errorCode = "PATIENT_REVIEW_CHANGED";
  throw err;
};

const lastApprovedMedicalProfile = (profiles) => [...profiles]
  .sort((left, right) => new Date(right.approvedAt ?? 0) - new Date(left.approvedAt ?? 0))
  .find(({ approvedSnapshot }) => {
    const set = snapshotSet(approvedSnapshot);
    return !approvedSnapshot?.deathStatusOnly && set && typeof set === "object" && Object.keys(set).length;
  });

const lastConfirmedLegacyProfile = (profiles) => profiles
  .filter(({ approvedAt, updatedAt, approvedSnapshot }) =>
    approvedAt && updatedAt && !approvedSnapshot?.deathStatusOnly && new Date(updatedAt) <= new Date(approvedAt))
  .sort((left, right) => new Date(right.approvedAt) - new Date(left.approvedAt))[0];

const requireRejectionBaseline = (target, otherProfiles, approvedProfile) => {
  if (approvedProfile) return null;
  if (!otherProfiles.length && (!target.approvedAt || target.approvedSnapshot?.deathStatusOnly)) return null;
  const legacy = lastConfirmedLegacyProfile(otherProfiles);
  if (legacy) return legacy;
  const err = new Error("No confirmed medical baseline is available for this rejection.");
  err.status = 409;
  err.errorCode = "PATIENT_REVIEW_BASELINE_MISSING";
  throw err;
};

async function lockLivingGuardianReview(parentEmail, session) {
  assertLivingReview(await Patient.exists({ email: parentEmail, isDeceased: true }).session(session));
  // The guardian's death or correction writes one of these same records.
  await Patient.updateMany(
    { email: parentEmail },
    { $inc: { clinicalWriteVersion: 1 } },
    { timestamps: false, session }
  );
}

const decideAdultProfile = (decide) => (args) => mongoose.connection.transaction(async (session) => {
  const result = await decide(args, session);
  if (result.hasRecords === false) return result;
  const { hasRecords, snapshot } = await computeHealthSnapshotByEmail(result.email, session);
  return { ok: true, hasRecords, snapshot, pendingDecision: false };
});

export const approvePatientProfileService = decideAdultProfile(async ({ user, profileId, expectedUpdatedAt }, session) => {
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

  const doc = await Patient.findOne({ _id: profileId, email }, null, { session }).lean();
  if (!doc) {
    const err = new Error("Patient profile not found for this user");
    err.status = 404;
    throw err;
  }
  const deceased = await Patient.exists({ email, isDeceased: true }).session(session);
  assertLivingReview(deceased);
  assertReviewVersion(doc, expectedUpdatedAt);

  const canonical = {};

  for (const field of SYNC_FIELDS_SCALAR) {
    if (Object.prototype.hasOwnProperty.call(doc, field) && doc[field] !== undefined) {
      canonical[field] = doc[field];
    }
  }

  for (const field of SYNC_FIELDS_ARRAY) {
    canonical[field] = Array.isArray(doc[field]) ? doc[field] : [];
  }
  canonical.childrenCount = canonical.children.length;

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

  await Patient.updateMany({ email }, updateDoc, { timestamps: false, session });

  await PatientHistory.create([{
    patientEmail: email,
    patientPhoneDigits: doc.phoneDigits || undefined,
    approvedFromProfile: doc._id,
    editedBy: doc.lastEditedBy || doc.createdBy || null,
    approvedSnapshot,
    approvedAt,
    eventType: "approved",
  }], { session });

  await User.findByIdAndUpdate(
    user._id,
    { $set: { lastHealthDecisionAt: new Date() } },
    { new: false, session }
  );

  return { email };
});

export const rejectPatientProfileService = decideAdultProfile(async ({ user, profileId, expectedUpdatedAt }, session) => {
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

  const allPats = await Patient.find({ email }, null, { session }).sort({ updatedAt: -1 }).lean();
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
  assertLivingReview(allPats.some((profile) => profile.isDeceased === true));
  assertReviewVersion(target, expectedUpdatedAt);
  const withoutTarget = allPats.filter((p) => String(p._id) !== String(profileId));
  const approvedProfile = lastApprovedMedicalProfile(allPats);
  const legacy = requireRejectionBaseline(target, withoutTarget, approvedProfile);

  if (!target.approvedAt || new Date(target.updatedAt) > new Date(target.approvedAt) || target.approvedSnapshot?.unresolvedReviewId) {
    await PatientHistory.create([{
      patientEmail: email,
      patientPhoneDigits: target.phoneDigits || undefined,
      approvedFromProfile: target._id,
      editedBy: target.lastEditedBy || target.createdBy || null,
      proposedSnapshot: captureHistorySnapshot(target),
      proposedAt: target.updatedAt,
      eventAt: new Date(),
      eventType: "rejected",
    }], { session });
  }

  const clearUnresolvedReview = allPats.some((profile) => profile.approvedSnapshot?.unresolvedReviewId)
    ? { "approvedSnapshot.unresolvedReviewId": 1 }
    : {};

  if (approvedProfile) {
    const { approvedSnapshot, approvedAt } = approvedProfile;
    const { unresolvedReviewId: _archived, ...restoredSnapshot } = approvedSnapshot;
    const updateDoc = { $set: { ...snapshotSet(restoredSnapshot), approvedSnapshot: restoredSnapshot } };
    const unset = restoredSnapshot.unset;
    if (unset && Object.keys(unset).length > 0) updateDoc.$unset = unset;
    if (approvedAt) {
      updateDoc.$set.updatedAt = approvedAt;
      updateDoc.$set.approvedAt = approvedAt;
    }

    await Patient.updateMany({ email }, updateDoc, { timestamps: false, session });
    await User.findByIdAndUpdate(
      user._id,
      { $set: { lastHealthDecisionAt: new Date() } },
      { new: false, session }
    );
    return { email };
  }

  if (withoutTarget.length === 0) {
    await Diagnosis.deleteMany({ patient: profileId }, { session });
    await Patient.deleteOne({ _id: profileId, email }, { session });

    await User.findByIdAndUpdate(
      user._id,
      { $set: { lastHealthDecisionAt: new Date() } },
      { new: false, session }
    );

    return { ok: true, hasRecords: false, snapshot: null, pendingDecision: false };
  }

  const prevBase = buildHealthSnapshotFromPatients([legacy], email);
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

  const approvedChildren = approvedChildrenForProfiles(allPats);
  if (approvedChildren !== null) {
    canonical.children = approvedChildren;
    canonical.childrenCount = approvedChildren.length;
  }

  const updateDoc = { $set: canonical };

  const unset = { ...clearUnresolvedReview };
  if (canonical.isDeceased === false) unset.causeOfDeath = 1;
  if (Object.keys(unset).length > 0) updateDoc.$unset = unset;

  if (target?.approvedAt) {
    updateDoc.$set.updatedAt = target.approvedAt;
  }

  await Patient.updateMany({ email }, updateDoc, { timestamps: false, session });

  await User.findByIdAndUpdate(
    user._id,
    { $set: { lastHealthDecisionAt: new Date() } },
    { new: false, session }
  );

  return { email };
});

const decideChildProfile = (decide) => (args) =>
  mongoose.connection.transaction((session) => decide(args, session));

function assertPendingChildReview(profile, expectedUpdatedAt) {
  const approved = snapshotSetOf(profile.approvedSnapshot);
  assertLivingReview(approved?.isDeceased === true && !hasChildDeathChange(profile));
  assertReviewVersion(profile, expectedUpdatedAt);
  if (profile.approvedAt && !(new Date(profile.updatedAt) > new Date(profile.approvedAt))) {
    const err = new Error("The child profile has no pending decision.");
    err.status = 409;
    err.errorCode = "PATIENT_REVIEW_CHANGED";
    throw err;
  }
}

function hasUnresolvedChildMedicalChanges(profile, approved) {
  if (!approved) return true;
  const before = captureHistorySnapshot(approved).set;
  const after = captureHistorySnapshot(profile).set;
  for (const field of ["isDeceased", "dateOfDeath", "causeOfDeath", "age", "ageCategory"]) {
    delete before[field];
    delete after[field];
  }
  return !isDeepStrictEqual(before, after);
}

async function assertNoConfirmedDeathOnSibling(profile, parentEmail, session) {
  if (snapshotSetOf(profile.approvedSnapshot)?.isDeceased === true || !profile.minorKey) return;
  const confirmed = await Patient.exists({
    _id: { $ne: profile._id },
    parentEmail,
    minorKey: profile.minorKey,
    ...(profile.birthDate ? { birthDate: profile.birthDate } : {}),
    isDeceased: true,
    $or: [{ "approvedSnapshot.set.isDeceased": true }, { "approvedSnapshot.isDeceased": true }],
  }).session(session);
  assertLivingReview(confirmed);
}

export const approveChildProfileService = decideChildProfile(async ({ user, profileId, expectedUpdatedAt }, session) => {
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
  }, null, { session }).lean();

  if (!doc) {
    const err = new Error("CHILD_PROFILE_NOT_FOUND");
    err.status = 404;
    throw err;
  }
  await lockLivingGuardianReview(parentEmail, session);
  assertPendingChildReview(doc, expectedUpdatedAt);
  await assertNoConfirmedDeathOnSibling(doc, parentEmail, session);

  const previousApprovedFullname = approvedFullnameFromSnapshot(doc.approvedSnapshot);
  const previousApprovedState = snapshotSetOf(doc.approvedSnapshot);
  const deathChange = hasChildDeathChange(doc);
  const shouldCancelAppointmentsDueToDeath =
    doc.isDeceased === true && previousApprovedState?.isDeceased !== true;
  const approvedFullname = deathChange && previousApprovedFullname
    ? previousApprovedFullname
    : String(doc.fullname ?? "").trim();
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
  const proposedState = { set: canonicalSet, unset: canonicalUnset };
  const approvedSnapshot = deathChange
    ? withConfirmedDeathFields(doc.approvedSnapshot, proposedState, approvedAt)
    : proposedState;
  const drafts = shouldCancelAppointmentsDueToDeath
    ? await pendingMinorSiblingProposals(doc, parentEmail, oldKey, session)
    : [];
  if (shouldCancelAppointmentsDueToDeath && hasUnresolvedChildMedicalChanges(doc, previousApprovedState)) drafts.unshift(doc);
  const unresolved = drafts.map((profile) => ({
    _id: new mongoose.Types.ObjectId(),
    ...minorProposalHistory(profile, oldKey, "unresolvedAtDeath", approvedAt),
  }));
  if (unresolved.length) approvedSnapshot.unresolvedReviewId = unresolved[0]._id;
  else if (deathChange && doc.approvedSnapshot?.unresolvedReviewId) {
    approvedSnapshot.unresolvedReviewId = doc.approvedSnapshot.unresolvedReviewId;
  }

  const updateDoc = {
    $set: {
      ...approvedSnapshot.set,
      approvedSnapshot,
      approvedAt,
      updatedAt: approvedAt,
      minorKey: newKey,
      parentEmail,
    },
  };

  if (Object.keys(approvedSnapshot.unset).length > 0) {
    updateDoc.$unset = approvedSnapshot.unset;
  }

  await Patient.updateMany(
    {
      parentEmail,
      minorKey: oldKey,
      ...minorQueryByBirthDateOrLegacy(referenceDate, { includeDeceased: true }),
    },
    updateDoc,
    { timestamps: false, session }
  );

  if (oldKey !== newKey) {
    await renameApprovedChildForParent({
      parentEmail,
      oldChildNameOrKey:
        previousApprovedFullname || childNameKeyFromMinorKey(oldKey, parentEmail),
      newChildName: approvedFullname,
      session,
    });
  }

  const history = {
    patientKey: newKey,
    eventType: deathChange ? (shouldCancelAppointmentsDueToDeath ? "deathRecorded" : "deathCorrected") : "approved",
    approvedAt,
    approvedSnapshot,
    approvedFromProfile: profileId,
    editedBy: doc.lastEditedBy || doc.createdBy || null,
  };
  await PatientHistory.create([history, ...unresolved], { session, ordered: true });

  if (shouldCancelAppointmentsDueToDeath) {
    await cancelFutureActiveAppointmentsDueToDeath(doc._id, approvedAt, session);
  }

  const { hasRecords, snapshot } = await computeHealthSnapshotByMinorKey(newKey, parentEmail, session);

  return { ok: true, hasRecords, snapshot, pendingDecision: false };
});

export const rejectChildProfileService = decideChildProfile(async ({ user, profileId, expectedUpdatedAt }, session) => {
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
  }, null, { session }).lean();

  if (!target) {
    const err = new Error("CHILD_PROFILE_NOT_FOUND");
    err.status = 404;
    throw err;
  }
  await lockLivingGuardianReview(parentEmail, session);
  assertPendingChildReview(target, expectedUpdatedAt);
  await assertNoConfirmedDeathOnSibling(target, parentEmail, session);

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
  }, null, { session })
    .sort({ updatedAt: -1 })
    .lean();

  if (!allPats.length) {
    const err = new Error("CHILD_GROUP_NOT_FOUND");
    err.status = 404;
    throw err;
  }

  const withoutTarget = allPats.filter((p) => String(p._id) !== String(profileId));
  const decidedAt = new Date();
  const approvedProfile = lastApprovedMedicalProfile([target]) ?? lastApprovedMedicalProfile(withoutTarget);
  const legacy = requireRejectionBaseline(target, withoutTarget, approvedProfile);
  await PatientHistory.create([minorProposalHistory(target, key, "rejected", decidedAt)], { session });
  const targetScope = { _id: profileId, parentEmail, minorKey: key };

  if (approvedProfile) {
    const approvedSnapshot = approvedProfile.approvedSnapshot;
    const approvedAt = approvedProfile.approvedAt ?? decidedAt;
    const updateDoc = {
      $set: { ...snapshotSet(approvedSnapshot), approvedSnapshot, approvedAt, updatedAt: approvedAt, minorKey: key },
    };
    if (approvedSnapshot.unset && Object.keys(approvedSnapshot.unset).length > 0) updateDoc.$unset = approvedSnapshot.unset;
    await Patient.updateMany(
      targetScope,
      updateDoc,
      { timestamps: false, session }
    );
    const { hasRecords, snapshot } = await computeHealthSnapshotByMinorKey(key, parentEmail, session);
    return { ok: true, hasRecords, snapshot, pendingDecision: false };
  }

  if (withoutTarget.length === 0) {
    await Diagnosis.deleteMany({ patient: profileId }, { session });
    await Patient.deleteOne({ _id: profileId, parentEmail }, { session });

    return { ok: true, hasRecords: false, snapshot: null, pendingDecision: false };
  }

  const prevBase = buildHealthSnapshotFromPatients([legacy], null);
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
      approvedAt: legacy.approvedAt,
      updatedAt: legacy.approvedAt,
      minorKey: key,
    },
  };

  if (Object.keys(canonicalUnset).length > 0) {
    updateDoc.$unset = canonicalUnset;
  }

  await Patient.updateMany(
    targetScope,
    updateDoc,
    { timestamps: false, session }
  );

  const finalState = await computeHealthSnapshotByMinorKey(key, parentEmail, session);

  return {
    ok: true,
    hasRecords: finalState.hasRecords,
    snapshot: finalState.snapshot,
    pendingDecision: false,
  };
});
