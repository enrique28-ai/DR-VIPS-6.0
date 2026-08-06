import mongoose from "mongoose";

const MONGOOSE_OPTIONS = {
  serverSelectionTimeoutMS: 8000,
  socketTimeoutMS: 20000,
  family: 4,
};

const ALLOWED_LOG_FIELDS = [
  "event",
  "stage",
  "attempt",
  "maxAttempts",
  "delayMs",
];

const safeLog = (logger, level, payload) => {
  const safePayload = {};

  for (const field of ALLOWED_LOG_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      safePayload[field] = payload[field];
    }
  }

  try {
    if (typeof logger?.[level] === "function") {
      logger[level]("[startup]", safePayload);
    }
  } catch {
    // Logging must never change connection behavior.
  }
};

export const sleepMs = (
  delayMs,
  { setTimeoutFn = setTimeout } = {},
) =>
  new Promise((resolve) => {
    setTimeoutFn(resolve, delayMs);
  });

export const connectDB = async ({
  connect = (uri, options) => mongoose.connect(uri, options),
  uri = process.env.MONGO_URI,
  maxAttempts = 3,
  delaysMs = [1000, 2000],
  sleep = sleepMs,
  logger = console,
} = {}) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    safeLog(logger, "info", {
      event: "mongo_connect_attempt",
      stage: "mongo",
      attempt,
      maxAttempts,
    });

    try {
      const connection = await connect(uri, MONGOOSE_OPTIONS);

      safeLog(logger, "info", {
        event: "mongo_connect_success",
        stage: "mongo",
        attempt,
        maxAttempts,
      });

      return connection;
    } catch {
      if (attempt === maxAttempts) {
        safeLog(logger, "error", {
          event: "mongo_connect_failed",
          stage: "mongo",
          attempt,
          maxAttempts,
        });

        throw new Error("MONGO_CONNECT_FAILED");
      }

      const delayMs = delaysMs[attempt - 1];

      safeLog(logger, "info", {
        event: "mongo_connect_retry",
        stage: "mongo",
        attempt,
        maxAttempts,
        delayMs,
      });

      await sleep(delayMs);
    }
  }

  throw new Error("MONGO_CONNECT_FAILED");
};
