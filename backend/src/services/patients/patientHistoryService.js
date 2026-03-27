import Patient from "../../models/Patient.js";
import PatientHistory from "../../models/PatientHistory.js";
import {
  identityQueryFromPatient,
  applyDynamicAgeToSnapshotSet,
} from "../../controllers/helpers/patienthelpers.js";

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
    .select("email phoneDigits approvedSnapshot approvedAt lastEditedBy createdBy")
    .lean();

  if (!p) {
    const err = new Error("You do not have access to this patient.");
    err.status = 403;
    throw err;
  }

  const ident = identityQueryFromPatient(p);
  if (!ident) return [];

  let history = await PatientHistory.find(ident)
    .sort({ approvedAt: -1 })
    .populate("editedBy", "name email")
    .lean();

  if (!history.length && p?.approvedSnapshot && p?.approvedAt) {
    await PatientHistory.create({
      patientEmail: p.email ? String(p.email).toLowerCase().trim() : undefined,
      patientPhoneDigits: p.phoneDigits || undefined,
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