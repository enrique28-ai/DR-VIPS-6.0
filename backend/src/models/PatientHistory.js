import mongoose from "mongoose";

const patientHistorySchema = new mongoose.Schema(
  {
    // Para agrupar historial aunque existan varias versiones/docs por doctor
    patientEmail: { type: String, lowercase: true, trim: true, index: true },
    patientKey: { type: String, lowercase: true, trim: true, index: true },

    patientPhoneDigits: { type: String, trim: true, index: true },

    // Auditoría
    approvedFromProfile: { type: mongoose.Schema.Types.ObjectId, ref: "Patient" },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // Guardamos EXACTAMENTE el mismo formato que ya usas en Patient.approvedSnapshot
    approvedSnapshot: { type: mongoose.Schema.Types.Mixed, required: true }, // { set, unset }
    approvedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, versionKey: false }
);

patientHistorySchema.index({ patientEmail: 1, approvedAt: -1 });
patientHistorySchema.index({ patientPhoneDigits: 1, approvedAt: -1 });
patientHistorySchema.index({ patientKey: 1, approvedAt: -1 });


const PatientHistory = mongoose.model("PatientHistory", patientHistorySchema);
export default PatientHistory;
