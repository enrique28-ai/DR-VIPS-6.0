import mongoose from "mongoose";
import Patient from "../../models/Patient.js";
import PatientAccessRequest from "../../models/PatientAccessRequest.js";
import { computeDynamicAge, normLower } from "../../controllers/helpers/patienthelpers.js";

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
  if (age < 18 && normLower(patient?.parentEmail) === email) return "guardian";
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

const requireValidId = (value, errorCode, message) => {
  if (!mongoose.isValidObjectId(value)) {
    throw accessRequestError(message, 404, errorCode);
  }
};

export const createPatientAccessRequestService = async ({ user, patientId }) => {
  requireRole(user, "doctor");
  requireValidId(patientId, "PATIENT_NOT_FOUND", "Patient not found");

  const patient = await Patient.findById(patientId)
    .select("_id fullname createdBy owners")
    .lean();

  if (!patient) {
    throw accessRequestError("Patient not found", 404, "PATIENT_NOT_FOUND");
  }

  if (doctorAlreadyHasAccess(patient, user._id)) {
    throw accessRequestError(
      "Access to this patient has already been granted",
      409,
      "ACCESS_ALREADY_GRANTED"
    );
  }

  const now = new Date();
  const pendingFilter = { patient: patient._id, doctor: user._id, status: "pending" };
  let accessRequest;

  try {
    accessRequest = await PatientAccessRequest.findOneAndUpdate(
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

    accessRequest = await PatientAccessRequest.findOne(pendingFilter).lean();
    if (!accessRequest) throw err;
  }

  return {
    accessRequest: serializeAccessRequest(accessRequest, {
      patient,
      doctor: user,
    }),
  };
};

export const listDoctorPatientAccessRequestsService = async ({ user }) => {
  requireRole(user, "doctor");

  const requests = await PatientAccessRequest.find({ doctor: user._id })
    .sort({ createdAt: -1 })
    .populate("patient", "fullname")
    .lean();

  return { accessRequests: requests.map((request) => serializeAccessRequest(request)) };
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
