import mongoose from "mongoose";

const professionalAllowlistSchema = new mongoose.Schema(
  {
    email:  { type: String, lowercase: true, trim: true },
    domain: { type: String, lowercase: true, trim: true },
  },
  { timestamps: true, versionKey: false }
);

// índices opcionales para evitar duplicados
professionalAllowlistSchema.index({ email: 1 },  { unique: true, sparse: true });
professionalAllowlistSchema.index({ domain: 1 }, { unique: true, sparse: true });

const ProfessionalAllowlist = mongoose.model("ProfessionalAllowlist", professionalAllowlistSchema);
export default ProfessionalAllowlist;
