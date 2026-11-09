import { translatePatientDoc } from "../../utils/deeplTranslate.js";
import { computeDynamicAge, mapAgeToBand } from "../../controllers/helpers/patienthelpers.js";
import Patient from "../../models/Patient.js";

const scalarFields = [
  "fullname", "age", "ageCategory", "birthDate", "bloodtype", "gender",
  "organDonor", "bloodDonor", "measurementSystem", "heightM", "weightKg",
  "heightFeet", "heightInches", "heightDisplay", "bmi", "bmiCategory",
  "isDeceased", "causeOfDeath", "dateOfDeath", "country", "state", "city",
  "birthCountry", "birthState", "birthCity", "phone", "childrenCount",
];
const clinicalArrays = ["diseases", "allergies", "medications"];
const publicFields = [...scalarFields, ...clinicalArrays, "children"];

export const snapshotSet = (snapshot) => snapshot?.set ?? snapshot;
export const isProposalHistoryEntry = (row) =>
  row.eventType === "rejected" || row.eventType === "unresolvedAtDeath" || Boolean(row.proposedSnapshot);

const deathDay = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
};

export function hasChildDeathChange(profile) {
  const approved = snapshotSet(profile.approvedSnapshot);
  return (approved?.isDeceased === true) !== (profile.isDeceased === true)
    || (profile.isDeceased === true && (
      deathDay(approved?.dateOfDeath) !== deathDay(profile.dateOfDeath)
      || (approved?.causeOfDeath ?? "") !== (profile.causeOfDeath ?? "")
    ));
}

// Preserve the distinction between an explicit clear and a field absent in legacy data.
export function captureHistorySnapshot(profile) {
  const set = {};
  for (const field of scalarFields) {
    const value = profile?.[field];
    if (value === null || typeof value === "string" || typeof value === "boolean"
      || Number.isFinite(value) || value instanceof Date) set[field] = value;
  }
  for (const field of clinicalArrays) {
    if (Array.isArray(profile?.[field])) {
      set[field] = profile[field].filter((value) => typeof value === "string");
    }
  }
  if (Array.isArray(profile?.children)) {
    set.children = profile.children
      .map((child) => typeof child === "string" ? child : child?.name)
      .filter((name) => typeof name === "string")
      .map((name) => ({ name }));
  }
  return { set };
}

export function minorProposalHistory(profile, patientKey, eventType, eventAt) {
  return {
    patientKey,
    approvedFromProfile: profile._id,
    editedBy: profile.lastEditedBy || profile.createdBy || null,
    proposedSnapshot: captureHistorySnapshot(profile),
    proposedAt: profile.updatedAt || (!profile.approvedAt ? profile.createdAt : undefined),
    eventAt,
    eventType,
  };
}

export async function pendingMinorSiblingProposals(profile, parentEmail, patientKey, session) {
  const birthDate = snapshotSet(profile.approvedSnapshot)?.birthDate ?? profile.birthDate;
  if (!birthDate || !patientKey) return [];
  return Patient.find({
    _id: { $ne: profile._id },
    parentEmail,
    minorKey: patientKey,
    birthDate,
    isDeceased: { $ne: true },
    $or: [{ approvedAt: null }, { $expr: { $gt: ["$updatedAt", "$approvedAt"] } }],
  }, null, { session }).lean();
}

export function withConfirmedDeathFields(baseline, deathSnapshot, approvedAt) {
  const set = { ...snapshotSet(baseline) };
  const unset = { ...baseline?.unset };
  for (const field of ["isDeceased", "dateOfDeath", "causeOfDeath"]) {
    if (Object.hasOwn(deathSnapshot.set, field)) {
      set[field] = deathSnapshot.set[field];
      delete unset[field];
    } else {
      delete set[field];
      unset[field] = 1;
    }
  }
  if (set.birthDate) {
    const age = computeDynamicAge(set, approvedAt);
    if (Number.isFinite(age)) {
      set.age = age;
      set.ageCategory = mapAgeToBand(age);
      delete unset.age;
      delete unset.ageCategory;
    }
  }
  const approvedSnapshot = { set, unset };
  if (!baseline || baseline.deathStatusOnly) approvedSnapshot.deathStatusOnly = true;
  return approvedSnapshot;
}

export async function serializeHistoryEntry(row, lang) {
  const proposal = isProposalHistoryEntry(row);
  const raw = proposal ? row.proposedSnapshot : row.approvedSnapshot ?? row.snapshot;
  const eventType = row.eventType ?? (row.oldMinorKey && row.newMinorKey ? "guardianReassigned" : "approved");
  const snapshot = raw ? captureHistorySnapshot(snapshotSet(raw)) : null;

  if (snapshot && raw?.unset) {
    const unset = Object.fromEntries(publicFields.filter((field) => raw.unset[field]).map((field) => [field, 1]));
    if (Object.keys(unset).length) snapshot.unset = unset;
  }

  if (snapshot && lang) {
    const translated = await translatePatientDoc(snapshot.set, lang);
    for (const field of clinicalArrays) {
      if (Object.hasOwn(snapshot.set, field)) snapshot.set[field] = translated[field];
    }
  }

  return {
    _id: row._id,
    eventType,
    eventAt: row.eventAt ?? row.approvedAt,
    approvedAt: row.approvedAt,
    proposedAt: row.proposedAt,
    editedBy: row.editedBy?.name ? { name: row.editedBy.name } : null,
    ...(proposal ? { proposedSnapshot: snapshot } : { approvedSnapshot: snapshot }),
  };
}

export function serializeHistoryList(rows) {
  return Promise.all([...rows].sort((left, right) => (
    (new Date(right.eventAt ?? right.approvedAt ?? 0) - new Date(left.eventAt ?? left.approvedAt ?? 0))
    || String(right._id).localeCompare(String(left._id))
  )).map((row) => serializeHistoryEntry(row)));
}
