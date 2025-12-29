// User.js (ESM)
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: function(){ return !this.googleId; }, select: false },
    googleId: { type: String, index: true, unique: true, sparse: true },
    avatar:   { type: String },
    name: { type: String, required: true, trim: true },
    isVerified: { type: Boolean, default: false },
    role: { type: String, enum: ["doctor", "patient"], default: "doctor" },
    lastHealthDecisionAt: { type: Date },
    isProfessionalVerified: { type: Boolean, default: false },

    // opcionales si usas verificación o reset por token:
    verificationToken: String,
    verificationTokenExpiresAt: Date,
    resetPasswordToken: String,
    resetPasswordExpiresAt: Date
  },
  {
    timestamps: true,       // createdAt / updatedAt
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_, ret) => {
        delete ret.password;  // nunca exponer password
        return ret;
      }
    }
  }
);

// hash de password antes de guardar
userSchema.pre("save", async function (next) {
  if (!this.password || !this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// comparar password en login
userSchema.methods.comparePassword = function (candidate) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

const User = mongoose.model("User", userSchema);
export default User;
