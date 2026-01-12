import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    patient:{ type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    start: { type: Date, required: true },
    end:   { type: Date, required: true },
    status:{ type: String, enum: ["pending", "accepted"], default: "pending" },
    reason:{ type: String, trim: true },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.model("Appointment", appointmentSchema);
