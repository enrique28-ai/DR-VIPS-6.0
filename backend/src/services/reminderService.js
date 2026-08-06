import cron from "node-cron";
import Appointment from "../models/Appointment.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";

function parseLeadMinutes() {
  const raw = (process.env.APPT_REMINDER_MINUTES || "60").trim();
  return raw
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function fmtDate(d, locale) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

function fmtTime(d, locale, hour12) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12,
  }).format(d);
}

async function upsertNotif({
  recipient,
  code,
  titleEn,
  titleEs,
  msgEn,
  msgEs,
  relatedAppointment,
  meta,
}) {
  // Upsert + unique index => no duplicados aunque corra en 2 instancias
  await Notification.updateOne(
    { recipient, code, relatedAppointment },
    {
      $setOnInsert: {
        recipient,
        code,
        title: { en: titleEn, es: titleEs },
        message: { en: msgEn, es: msgEs },
        relatedAppointment,
        isRead: false,
        meta: meta || {},
      },
    },
    { upsert: true }
  );
}

async function runReminderTick(leadMinutesList) {
  try {
    const now = new Date();
    now.setSeconds(0, 0);

    for (const mins of leadMinutesList) {
      // ventana de 1 minuto para evitar repeats
      const from = new Date(now.getTime() + mins * 60000);
      const to = new Date(now.getTime() + (mins + 1) * 60000);

      const appts = await Appointment.find({
        status: "accepted",
        start: { $gte: from, $lt: to },
      })
        .populate("doctor", "name email")
        .populate("patient", "fullname email");

      for (const appt of appts) {
        const code = `APPT_REMINDER_TMINUS_${mins}`;

        const start = new Date(appt.start);
        const end = new Date(appt.end);

        const dateEs = fmtDate(start, "es-MX");
        const dateEn = fmtDate(start, "en-US");

        const tStartEs = fmtTime(start, "es-MX", false);
        const tEndEs = fmtTime(end, "es-MX", false);

        const tStartEn = fmtTime(start, "en-US", true);
        const tEndEn = fmtTime(end, "en-US", true);

        const doctorName = appt.doctor?.name || "Doctor";
        const patientName = appt.patient?.fullname || "Patient";

        // DOCTOR
        if (appt.doctor?._id) {
          await upsertNotif({
            recipient: appt.doctor._id,
            code,
            relatedAppointment: appt._id,
            titleEn: "Upcoming appointment",
            titleEs: "Cita próxima",
            msgEn: `You have an appointment with ${patientName} in ${mins} min (${dateEn}, ${tStartEn} - ${tEndEn}).`,
            msgEs: `Tienes una cita con ${patientName} en ${mins} min (${dateEs}, ${tStartEs} - ${tEndEs}).`,
            meta: { start, end, mins, role: "doctor" },
          });
        }

        // PATIENT (User por email)
        const patientEmail = (appt.patient?.email || "").toLowerCase().trim();
        if (patientEmail) {
          const patientUser = await User.findOne({ email: patientEmail })
            .select("_id")
            .lean();

          if (patientUser?._id) {
            await upsertNotif({
              recipient: patientUser._id,
              code,
              relatedAppointment: appt._id,
              titleEn: "Appointment reminder",
              titleEs: "Recordatorio de cita",
              msgEn: `Your appointment with Dr. ${doctorName} is in ${mins} min (${dateEn}, ${tStartEn} - ${tEndEn}).`,
              msgEs: `Tu cita con el Dr. ${doctorName} es en ${mins} min (${dateEs}, ${tStartEs} - ${tEndEs}).`,
              meta: { start, end, mins, role: "patient" },
            });
          }
        }
      }
    }
  } catch {
    console.error("[reminder-error]", {
      event: "reminder_tick_failed",
    });
  }
}

export const startReminderJob = ({ schedule = cron.schedule } = {}) => {
  const leadMinutesList = parseLeadMinutes();
  const activeRuns = new Set();

  const task = schedule("* * * * *", () => {
    const run = runReminderTick(leadMinutesList);
    const settle = () => activeRuns.delete(run);

    activeRuns.add(run);
    void run.then(settle, settle);

    return run;
  });

  let stopPromise = null;

  return {
    stop() {
      if (stopPromise) return stopPromise;

      stopPromise = (async () => {
        let destroyFailed = false;

        try {
          await task.destroy();
        } catch {
          destroyFailed = true;
        }

        await Promise.allSettled([...activeRuns]);

        if (destroyFailed) {
          throw new Error("REMINDER_DESTROY_FAILED");
        }
      })();

      return stopPromise;
    },
  };
};
