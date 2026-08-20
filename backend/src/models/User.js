// User.js (ESM)
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const PUBLIC_USER_FIELDS = [
  "_id",
  "email",
  "name",
  "avatar",
  "role",
  "isVerified",
  "isProfessionalVerified",
];

export const serializePublicUser = (user) => {
  if (!user) return null;

  const source = typeof user.toObject === "function"
    ? user.toObject({ virtuals: false, transform: false })
    : user;

  return PUBLIC_USER_FIELDS.reduce((publicUser, field) => {
    if (source[field] !== undefined) publicUser[field] = source[field];
    return publicUser;
  }, {});
};

export const hashUserPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

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
    sessionVersion: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
      validate: {
        validator: Number.isSafeInteger,
        message: "sessionVersion must be a non-negative safe integer",
      },
    },

    // opcionales si usas verificación o reset por token:
    verificationToken: { type: String, select: false },
    verificationTokenExpiresAt: { type: Date, select: false },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpiresAt: { type: Date, select: false }
  },
  {
    timestamps: true,       // createdAt / updatedAt
    versionKey: false,
    toJSON: {
      virtuals: false,
      transform: (_, ret) => serializePublicUser(ret)
    }
  }
);

// hash de password antes de guardar
userSchema.pre("save", async function (next) {
  if (!this.password || !this.isModified("password")) return next();
  this.password = await hashUserPassword(this.password);
  next();
});

// comparar password en login
userSchema.methods.comparePassword = function (candidate) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

const User = mongoose.model("User", userSchema);
export default User;
