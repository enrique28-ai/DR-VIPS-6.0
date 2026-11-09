import Patient from "../../models/Patient.js";
import PatientHistory from "../../models/PatientHistory.js";
import {
  getLang,
  normLower,
  minorQueryByBirthDateOrLegacy,
} from "../../controllers/helpers/patienthelpers.js";
import { isProposalHistoryEntry, serializeHistoryEntry, serializeHistoryList } from "./patientHistorySnapshot.js";

const visibleToDoctor = (row, patientId, doctorId) =>
  !isProposalHistoryEntry(row) || (
    String(row.approvedFromProfile) === String(patientId)
    && (!row.patientKey || String(row.editedBy?._id ?? "") === String(doctorId))
  );

const sourceHistoryIdentity = (ids) => ({
  $or: [{ patientId: { $in: ids } }, { approvedFromProfile: { $in: ids } }],
});

const doctorHistoryIdentity = (patient, patientId) => {
  const email = normLower(patient.email);
  // A phone can be assigned to a different patient after the history is written.
  return email ? { $or: [
    { patientEmail: email },
    { patientKey: { $type: "string" }, ...sourceHistoryIdentity([patientId]) },
  ] }
    : { $or: [{ patientId }, { approvedFromProfile: patientId }] };
};

async function minorHistoryIdentity(child, childId) {
  const ids = [childId];
  // Reassignment and rename keep profile IDs. A historical name/guardian key
  // alone cannot prove that an earlier record belongs to this child.
  if (child.minorKey && child.parentEmail && child.birthDate) {
    const siblings = await Patient.find({
      parentEmail: child.parentEmail,
      minorKey: child.minorKey,
      birthDate: child.birthDate,
      _id: { $ne: childId },
    }).select("_id").lean();
    ids.push(...siblings.map((profile) => profile._id));
  }
  return sourceHistoryIdentity(ids);
}

export const getMyHistoryService = async ({ user }) => {
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

  let history = await PatientHistory.find({ patientEmail: email })
    .sort({ approvedAt: -1 })
    .populate("editedBy", "name")
    .lean();

  if (history.every(isProposalHistoryEntry)) {
    const p = await Patient.findOne({ email })
      .select("email phoneDigits approvedSnapshot approvedAt")
      .lean();

    if (p?.approvedSnapshot && p?.approvedAt) {
      await PatientHistory.create({
        patientEmail: email,
        patientPhoneDigits: p.phoneDigits || undefined,
        approvedFromProfile: p._id,
        approvedSnapshot: p.approvedSnapshot,
        approvedAt: p.approvedAt,
      });

      history = await PatientHistory.find({ patientEmail: email })
        .sort({ approvedAt: -1 })
        .populate("editedBy", "name")
        .lean();
    }
  }

  return serializeHistoryList(history);
};

export const getPatientHistoryService = async ({ user, patientId }) => {
  const p = await Patient.findOne({
    _id: patientId,
    $or: [{ createdBy: user._id }, { owners: user._id }],
  })
    .select("email phoneDigits minorKey parentEmail birthDate approvedSnapshot approvedAt")
    .lean();

  if (!p) {
    const err = new Error("You do not have access to this patient.");
    err.status = 403;
    throw err;
  }

  const childKey = p.minorKey;

  const ident = childKey
    ? await minorHistoryIdentity(p, patientId)
    : doctorHistoryIdentity(p, patientId);

  let history = await PatientHistory.find(ident)
    .sort({ approvedAt: -1 })
    .populate("editedBy", "name")
    .lean();

  if (history.every(isProposalHistoryEntry) && p?.approvedSnapshot && p?.approvedAt) {
    await PatientHistory.create({
      patientEmail: p.email ? String(p.email).toLowerCase().trim() : undefined,
      patientPhoneDigits: p.phoneDigits || undefined,
      patientKey: childKey || undefined,
      approvedFromProfile: p._id,
      approvedSnapshot: p.approvedSnapshot,
      approvedAt: p.approvedAt,
    });

    history = await PatientHistory.find(ident)
      .sort({ approvedAt: -1 })
      .populate("editedBy", "name")
      .lean();
  }

  return serializeHistoryList(history.filter((row) => visibleToDoctor(row, patientId, user._id)));
};

export const getPatientHistoryOneService = async ({ user, patientId, historyId, req }) => {
  const lang = getLang(req);
  if (!lang) {
    const err = new Error("lang is required");
    err.status = 400;
    throw err;
  }

  const p = await Patient.findOne({
    _id: patientId,
    $or: [{ createdBy: user._id }, { owners: user._id }],
  })
    .select("email minorKey parentEmail birthDate")
    .lean();

  if (!p) {
    const err = new Error("Not authorized");
    err.status = 403;
    throw err;
  }

  const childKey = p.minorKey;

  const ident = childKey
    ? await minorHistoryIdentity(p, patientId)
    : doctorHistoryIdentity(p, patientId);

  const ver = await PatientHistory.findOne({ _id: historyId, ...ident })
    .populate("editedBy", "name")
    .lean();

  if (!ver || !visibleToDoctor(ver, patientId, user._id)) {
    const err = new Error("History not found");
    err.status = 404;
    throw err;
  }

  return serializeHistoryEntry(ver, lang);
};

export const getMyHistoryOneService = async ({ user, historyId, req }) => {
  if (user.role !== "patient") {
    const err = new Error("Insufficient role");
    err.status = 403;
    throw err;
  }

  const lang = getLang(req);
  if (!lang) {
    const err = new Error("lang is required");
    err.status = 400;
    throw err;
  }

  const email = (user.email || "").toLowerCase().trim();
  if (!email) {
    const err = new Error("User has no email on file");
    err.status = 400;
    throw err;
  }

  const ver = await PatientHistory.findOne({ _id: historyId, patientEmail: email })
    .populate("editedBy", "name")
    .lean();

  if (!ver) {
    const err = new Error("History not found");
    err.status = 404;
    throw err;
  }

  return serializeHistoryEntry(ver, lang);
};

export const getChildHistoryService = async ({ user, childId }) => {
  if (user.role !== "patient") {
    const err = new Error("Insufficient role");
    err.status = 403;
    throw err;
  }

  const parentEmail = normLower(user.email);
  const childProfileId = childId;

  const child = await Patient.findOne({
    _id: childProfileId,
    parentEmail,
    ...minorQueryByBirthDateOrLegacy(new Date(), { includeDeceased: true }),
  })
    .select("minorKey parentEmail birthDate")
    .lean();

  if (!child) {
    const err = new Error("CHILD_PROFILE_NOT_FOUND");
    err.status = 404;
    throw err;
  }

  const ident = await minorHistoryIdentity(child, childId);

  const history = await PatientHistory.find(ident)
    .sort({ approvedAt: -1 })
    .populate("editedBy", "name")
    .lean();

  return serializeHistoryList(history);
};

export const getChildHistoryOneService = async ({ user, childId, historyId, req }) => {
  if (user.role !== "patient") {
    const err = new Error("Insufficient role");
    err.status = 403;
    throw err;
  }

  const lang = getLang(req);
  if (!lang) {
    const err = new Error("lang is required");
    err.status = 400;
    throw err;
  }

  const parentEmail = normLower(user.email);
  const child = await Patient.findOne({
    _id: childId,
    parentEmail,
    ...minorQueryByBirthDateOrLegacy(new Date(), { includeDeceased: true }),
  })
    .select("minorKey parentEmail birthDate")
    .lean();

  if (!child) {
    const err = new Error("CHILD_PROFILE_NOT_FOUND");
    err.status = 404;
    throw err;
  }

  const ident = await minorHistoryIdentity(child, childId);

  const ver = await PatientHistory.findOne({ _id: historyId, ...ident })
    .populate("editedBy", "name")
    .lean();

  if (!ver) {
    const err = new Error("History not found");
    err.status = 404;
    throw err;
  }

  return serializeHistoryEntry(ver, lang);
};
