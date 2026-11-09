import mongoose from "mongoose";

const diagnosisHistorySchema = new mongoose.Schema(
  {
    diagnosisId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Diagnosis",
      required: true,
      index: true,
    },
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    snapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    changeType: {
      type: String,
      enum: ["created", "updated"],
      required: true,
    },
  },
  { timestamps: true, versionKey: false }
);

diagnosisHistorySchema.index({ diagnosisId: 1, createdAt: -1 });

const DiagnosisHistory = mongoose.model("DiagnosisHistory", diagnosisHistorySchema);
export default DiagnosisHistory;
