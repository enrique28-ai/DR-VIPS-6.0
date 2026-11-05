import mongoose from "mongoose";
import Patient from "../../models/Patient.js";
import PatientAccessRequest from "../../models/PatientAccessRequest.js";
import { normalizeSingleMailbox } from "../../utils/emailAddress.js";
import {
  computeDynamicAge,
  isCurrentMinorPatient,
  normLower,
  normNameKey,
} from "../../controllers/helpers/patienthelpers.js";

const accessRequestError = (message, status, errorCode) => {
  const err = new Error(message);
  err.status = status;
  err.errorCode = errorCode;
  return err;
};

const requireRole = (user, role) => {
  if (user?.role !== role) {
    throw accessRequestError("Insufficient role", 403, "INSUFFICIENT_ROLE");
  }
};

const isSameId = (left, right) => String(left ?? "") === String(right ?? "");

const doctorAlreadyHasAccess = (patient, doctorId) =>
  isSameId(patient?.createdBy, doctorId) ||
  (Array.isArray(patient?.owners) && patient.owners.some((owner) => isSameId(owner, doctorId)));

const currentDecisionRelation = (patient, user) => {
  const email = normLower(user?.email);
  const age = computeDynamicAge(patient);

  if (!email || !Number.isFinite(age)) return null;
  if (age >= 18 && normLower(patient?.email) === email) return "patient";
  if (
    isCurrentMinorPatient(patient) &&
    normLower(patient?.parentEmail) === email
  ) return "guardian";
  return null;
};

const serializeReference = (value, fields) => {
  if (!value || typeof value !== "object" || value instanceof mongoose.Types.ObjectId) {
    return value;
  }

  return fields.reduce((result, field) => {
    if (value[field] !== undefined) result[field] = value[field];
    return result;
  }, {});
};

const serializeAccessRequest = (request, overrides = {}) => {
  const source = typeof request?.toObject === "function" ? request.toObject() : request;
  const patient = overrides.patient ?? source?.patient;
  const doctor = overrides.doctor ?? source?.doctor;

  return {
    _id: source?._id,
    patient: serializeReference(patient, ["_id", "fullname"]),
    doctor: serializeReference(doctor, ["_id", "name", "email"]),
    status: source?.status,
    decidedBy: source?.decidedBy ?? null,
    decidedAt: source?.decidedAt ?? null,
    createdAt: source?.createdAt,
    updatedAt: source?.updatedAt,
  };
};

const serializeDoctorAccessRequest = (request) => ({
  _id: request?._id,
  patient: serializeReference(request?.patient, ["_id", "fullname"]),
  status: request?.status,
  decidedAt: request?.decidedAt ?? null,
  createdAt: request?.createdAt,
  updatedAt: request?.updatedAt,
});

const requireValidId = (value, errorCode, message) => {
  if (!mongoose.isValidObjectId(value)) {
    throw accessRequestError(message, 404, errorCode);
  }
};

const identificationAccepted = () => ({
  message: "If a matching patient is found, the access request will be available for the patient or authorized guardian to review.",
});

export const createPatientAccessRequestService = async ({ user, body }) => {
  requireRole(user, "doctor");
  const fullname = typeof body?.fullname === "string" ? normNameKey(body.fullname) : "";
  const email = normalizeSingleMailbox(body?.email);
  const mode = body?.mode;
  if (
    !["adult", "minor"].includes(mode) || !fullname ||
    typeof body.fullname !== "string" || body.fullname.length > 200 ||
    typeof body.email !== "string" || body.email.length > 254 ||
    /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(body.fullname) || !email
  ) {
    throw accessRequestError(
      "Provide a valid patient type, full name and email address",
      400,
      "INVALID_PATIENT_IDENTIFICATION"
    );
  }

  // Email narrows the lookup; compare every name using the same family identity
  // normalizer before checking ownership/eligibility. Never choose a duplicate.
  const candidates = await Patient.find({
    [mode === "adult" ? "email" : "parentEmail"]: email,
  })
    .select("_id fullname email parentEmail birthDate age dateOfDeath isDeceased createdBy owners")
    .lean();

  const contactField = mode === "adult" ? "email" : "parentEmail";
  const matches = candidates.filter((candidate) =>
    typeof candidate.fullname === "string" && normNameKey(candidate.fullname) === fullname
  );
  if (matches.length !== 1) return identificationAccepted();
  const patient = matches[0];
  const expectedRelation = mode === "adult" ? "patient" : "guardian";
  if (
    normNameKey(patient.fullname) !== fullname ||
    typeof patient[contactField] !== "string" || normLower(patient[contactField]) !== email ||
    currentDecisionRelation(patient, { email }) !== expectedRelation ||
    doctorAlreadyHasAccess(patient, user._id)
  ) {
    return identificationAccepted();
  }

  const now = new Date();
  const pendingFilter = { patient: patient._id, doctor: user._id, status: "pending" };

  try {
    await PatientAccessRequest.findOneAndUpdate(
      pendingFilter,
      {
        $setOnInsert: {
          patient: patient._id,
          doctor: user._id,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
        timestamps: false,
      }
    ).lean();
  } catch (err) {
    if (err?.code !== 11000) throw err;
    // A competing pending upsert may already have been decided. Its existence
    // and current state must not change the doctor's neutral response.
  }

  return identificationAccepted();
};

export const listDoctorPatientAccessRequestsService = async ({ user }) => {
  requireRole(user, "doctor");

  const requests = await PatientAccessRequest.find({ doctor: user._id, status: "approved" })
    .sort({ createdAt: -1 })
    .populate("patient", "fullname createdBy owners")
    .lean();

  return {
    accessRequests: requests
      .filter((request) => request.status === "approved" && request.patient && doctorAlreadyHasAccess(request.patient, user._id))
      .map(serializeDoctorAccessRequest),
  };
};

export const listDecidablePatientAccessRequestsService = async ({ user }) => {
  requireRole(user, "patient");

  const email = normLower(user.email);
  if (!email) return { accessRequests: [] };

  const possiblePatients = await Patient.find({
    $or: [{ email }, { parentEmail: email }],
  })
    .select("_id fullname email parentEmail birthDate age dateOfDeath isDeceased")
    .lean();

  const patientsById = new Map();
  for (const patient of possiblePatients) {
    if (currentDecisionRelation(patient, user)) {
      patientsById.set(String(patient._id), patient);
    }
  }

  if (patientsById.size === 0) return { accessRequests: [] };

  const requests = await PatientAccessRequest.find({
    patient: { $in: [...patientsById.values()].map((patient) => patient._id) },
    status: "pending",
  })
    .sort({ createdAt: -1 })
    .populate("doctor", "name email")
    .lean();

  return {
    accessRequests: requests.map((request) =>
      serializeAccessRequest(request, {
        patient: patientsById.get(String(request.patient)),
      })
    ),
  };
};

const decidePatientAccessRequestService = async ({ user, requestId, status }) => {
  requireRole(user, "patient");
  requireValidId(requestId, "ACCESS_REQUEST_NOT_FOUND", "Access request not found");

  const accessRequest = await mongoose.connection.transaction(async (session) => {
    const pendingRequest = await PatientAccessRequest.findById(requestId)
      .session(session)
      .lean();

    if (!pendingRequest) {
      throw accessRequestError(
        "Access request not found",
        404,
        "ACCESS_REQUEST_NOT_FOUND"
      );
    }

    const patient = await Patient.findById(pendingRequest.patient)
      .select("_id fullname email parentEmail birthDate age dateOfDeath isDeceased")
      .session(session)
      .lean();

    if (!patient) {
      throw accessRequestError("Patient not found", 404, "PATIENT_NOT_FOUND");
    }

    const relation = currentDecisionRelation(patient, user);
    if (!relation) {
      throw accessRequestError(
        "Access request not found",
        404,
        "ACCESS_REQUEST_NOT_FOUND"
      );
    }

    if (pendingRequest.status !== "pending") {
      throw accessRequestError(
        "Access request is no longer pending",
        409,
        "ACCESS_REQUEST_NOT_PENDING"
      );
    }

    const decidedAt = new Date();
    const decidedRequest = await PatientAccessRequest.findOneAndUpdate(
      { _id: pendingRequest._id, status: "pending" },
      {
        $set: {
          status,
          decidedBy: user._id,
          decidedAt,
          updatedAt: decidedAt,
        },
      },
      {
        new: true,
        runValidators: true,
        session,
        timestamps: false,
      }
    ).lean();

    if (!decidedRequest) {
      throw accessRequestError(
        "Access request is no longer pending",
        409,
        "ACCESS_REQUEST_NOT_PENDING"
      );
    }

    if (status === "approved") {
      const identityFilter =
        relation === "patient"
          ? { _id: patient._id, email: normLower(user.email) }
          : { _id: patient._id, parentEmail: normLower(user.email) };

      const grant = await Patient.updateOne(
        identityFilter,
        { $addToSet: { owners: pendingRequest.doctor } },
        { session, timestamps: false }
      );

      if (grant.matchedCount !== 1) {
        throw accessRequestError(
          "Access request not found",
          404,
          "ACCESS_REQUEST_NOT_FOUND"
        );
      }
    }

    return serializeAccessRequest(decidedRequest, { patient });
  });

  return { accessRequest };
};

export const approvePatientAccessRequestService = async ({ user, requestId }) =>
  decidePatientAccessRequestService({ user, requestId, status: "approved" });

export const rejectPatientAccessRequestService = async ({ user, requestId }) =>
  decidePatientAccessRequestService({ user, requestId, status: "rejected" });
