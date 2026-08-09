import mongoose from "mongoose";

export const PATIENT_ACCESS_REQUEST_STATUSES = ["pending", "approved", "rejected"];

const patientAccessRequestSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: PATIENT_ACCESS_REQUEST_STATUSES,
      default: "pending",
      required: true,
      index: true,
    },
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

patientAccessRequestSchema.index(
  { patient: 1, doctor: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  }
);

const PatientAccessRequest = mongoose.model(
  "PatientAccessRequest",
  patientAccessRequestSchema
);

export default PatientAccessRequest;
