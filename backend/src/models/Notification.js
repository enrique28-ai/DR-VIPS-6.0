import mongoose from "mongoose";

const i18nTextSchema = new mongoose.Schema(
  {
    en: { type: String, required: true },
    es: { type: String, required: true },
  },
  { _id: false }
);

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Para evitar duplicados (ej: APPT_REMINDER_TMINUS_60)
    code: { type: String, required: true },

    title: { type: i18nTextSchema, required: true },
    message: { type: i18nTextSchema, required: true },

    relatedAppointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      default: null,
    },

    isRead: { type: Boolean, default: false, index: true },

    // datos extra útiles (por si quieres linkear a la cita)
    meta: { type: Object, default: {} },
  },
  { timestamps: true }
);

// No duplicar el mismo recordatorio para el mismo appointment/usuario
notificationSchema.index(
  { recipient: 1, code: 1, relatedAppointment: 1 },
  { unique: true }
);
// Auto-borrado después de 30 días
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });


export default mongoose.model("Notification", notificationSchema);
