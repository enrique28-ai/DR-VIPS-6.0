import Patient from "../../models/Patient.js";
import PatientHistory from "../../models/PatientHistory.js";
import {
  identityQueryFromPatient,
  applyDynamicAgeToSnapshotSet,
  getLang,
  normLower,
  minorKeyOf,
  minorQueryByBirthDateOrLegacy,
} from "../../controllers/helpers/patienthelpers.js";
import { translatePatientDoc } from "../../utils/deeplTranslate.js";


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
    .populate("editedBy", "name email")
    .lean();

  if (!history.length) {
    const p = await Patient.findOne({ email })
      .select("email phoneDigits approvedSnapshot approvedAt lastEditedBy createdBy")
      .lean();

    if (p?.approvedSnapshot && p?.approvedAt) {
      await PatientHistory.create({
        patientEmail: email,
        patientPhoneDigits: p.phoneDigits || undefined,
        approvedFromProfile: p._id,
        editedBy: p.lastEditedBy || p.createdBy || null,
        approvedSnapshot: p.approvedSnapshot,
        approvedAt: p.approvedAt,
      });

      history = await PatientHistory.find({ patientEmail: email })
        .sort({ approvedAt: -1 })
        .populate("editedBy", "name email")
        .lean();
    }
  }

  const out = history.map((h) => {
    const raw = h?.approvedSnapshot?.set || h?.snapshot || h?.approvedSnapshot || null;
    if (!raw) return h;

    const withAge = applyDynamicAgeToSnapshotSet(raw);

    if (h?.approvedSnapshot?.set) {
      h.approvedSnapshot = { ...h.approvedSnapshot, set: withAge };
    } else if (h?.approvedSnapshot) {
      h.approvedSnapshot = withAge;
    } else {
      h.snapshot = withAge;
    }

    return h;
  });

  return out;
};

export const getPatientHistoryService = async ({ user, patientId }) => {
  const p = await Patient.findOne({
    _id: patientId,
    $or: [{ createdBy: user._id }, { owners: user._id }],
  })
    .select("email phoneDigits minorKey parentEmail fullname approvedSnapshot approvedAt lastEditedBy createdBy")
    .lean();

  if (!p) {
    const err = new Error("You do not have access to this patient.");
    err.status = 403;
    throw err;
  }

  const childKey =
    p?.minorKey || (p?.parentEmail ? minorKeyOf(p.parentEmail, p.fullname) : "");

  const ident = childKey
    ? { patientKey: childKey }
    : identityQueryFromPatient(p);
  if (!ident) return [];

  let history = await PatientHistory.find(ident)
    .sort({ approvedAt: -1 })
    .populate("editedBy", "name email")
    .lean();

  if (!history.length && p?.approvedSnapshot && p?.approvedAt) {
    await PatientHistory.create({
      patientEmail: p.email ? String(p.email).toLowerCase().trim() : undefined,
      patientPhoneDigits: p.phoneDigits || undefined,
      patientKey: childKey || undefined,
      approvedFromProfile: p._id,
      editedBy: p.lastEditedBy || p.createdBy || null,
      approvedSnapshot: p.approvedSnapshot,
      approvedAt: p.approvedAt,
    });

    history = await PatientHistory.find(ident)
      .sort({ approvedAt: -1 })
      .populate("editedBy", "name email")
      .lean();
  }

  const out = history.map((h) => {
    const raw = h?.approvedSnapshot?.set || h?.snapshot || h?.approvedSnapshot || null;
    if (!raw) return h;

    const withAge = applyDynamicAgeToSnapshotSet(raw);

    if (h?.approvedSnapshot?.set) {
      h.approvedSnapshot = { ...h.approvedSnapshot, set: withAge };
    } else if (h?.approvedSnapshot) {
      h.approvedSnapshot = withAge;
    } else {
      h.snapshot = withAge;
    }

    return h;
  });

  return out;
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
    .select("email phoneDigits minorKey parentEmail fullname")
    .lean();

  if (!p) {
    const err = new Error("Not authorized");
    err.status = 403;
    throw err;
  }

  const childKey =
    p?.minorKey || (p?.parentEmail ? minorKeyOf(p.parentEmail, p.fullname) : "");

  const ident = childKey
    ? { patientKey: childKey }
    : identityQueryFromPatient(p);
  if (!ident) {
    const err = new Error("History not found");
    err.status = 404;
    throw err;
  }

  const ver = await PatientHistory.findOne({ _id: historyId, ...ident })
    .populate("editedBy", "name email")
    .lean();

  if (!ver) {
    const err = new Error("History not found");
    err.status = 404;
    throw err;
  }

  const raw = ver?.approvedSnapshot?.set || ver?.snapshot || ver?.approvedSnapshot || null;
  if (!raw) return ver;

  const translated = await translatePatientDoc(raw, lang);
  const translatedWithAge = applyDynamicAgeToSnapshotSet(translated);

  if (ver?.approvedSnapshot?.set) {
    ver.approvedSnapshot = { ...ver.approvedSnapshot, set: translatedWithAge };
  } else if (ver?.approvedSnapshot) {
    ver.approvedSnapshot = translatedWithAge;
  } else {
    ver.snapshot = translatedWithAge;
  }

  return ver;
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
    .populate("editedBy", "name email")
    .lean();

  if (!ver) {
    const err = new Error("History not found");
    err.status = 404;
    throw err;
  }

  const raw = ver?.approvedSnapshot?.set || ver?.snapshot || ver?.approvedSnapshot || null;
  if (!raw) return ver;

  const translated = await translatePatientDoc(raw, lang);
  const translatedWithAge = applyDynamicAgeToSnapshotSet(translated);

  if (ver?.approvedSnapshot?.set) {
    ver.approvedSnapshot = { ...ver.approvedSnapshot, set: translatedWithAge };
  } else if (ver?.approvedSnapshot) {
    ver.approvedSnapshot = translatedWithAge;
  } else {
    ver.snapshot = translatedWithAge;
  }

  return ver;
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
    .select("minorKey fullname parentEmail")
    .lean();

  if (!child) {
    const err = new Error("CHILD_PROFILE_NOT_FOUND");
    err.status = 404;
    throw err;
  }

  const key = child.minorKey || minorKeyOf(parentEmail, child.fullname);

  const history = await PatientHistory.find({ patientKey: key })
    .sort({ approvedAt: -1 })
    .populate("editedBy", "name email role")
    .lean();

  return history;
};