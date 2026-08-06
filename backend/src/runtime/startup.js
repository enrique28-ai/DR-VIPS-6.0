const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET", "PENDING_SECRET"];
const ALLOWED_LOG_FIELDS = ["event", "stage", "exitCode"];

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
    // Logging must never interrupt startup or cleanup.
  }
};

export const validateRequiredEnv = (env) => {
  for (const key of REQUIRED_ENV) {
    const value = env?.[key];

    if (typeof value !== "string" || value.trim() === "") {
      throw new Error("STARTUP_VALIDATION_FAILED");
    }
  }
};

const closeHttpServer = (server) => {
  if (typeof server?.close !== "function") return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;

      if (error) reject(error);
      else resolve();
    };

    try {
      const result = server.close(finish);

      if (result && typeof result.then === "function") {
        result.then(() => finish(), finish);
      } else if (server.close.length === 0 && result === undefined) {
        finish();
      }
    } catch (error) {
      finish(error);
    }
  });
};

const ignoreFailure = async (operation) => {
  try {
    await operation();
  } catch {
    // Startup cleanup is best-effort and must continue through every stage.
  }
};

export const createStartup = ({
  env,
  connectMongo,
  startReminder,
  listenHttp,
  createLifecycle,
  disconnectMongo,
  requestExit,
  logger = console,
}) => {
  let reminderJob = null;
  let server = null;
  let lifecycle = null;
  let mongoStarted = false;
  let lifecycleRegistrationAttempted = false;
  let exitRequested = false;
  let startupPromise;
  let stage = "validation";

  const requestExitOnce = (exitCode) => {
    if (exitRequested) return;
    exitRequested = true;

    try {
      requestExit(exitCode);
    } catch {
      // An injected exit request must not reject the startup promise.
    }
  };

  const cleanupPartialStartup = async () => {
    if (lifecycleRegistrationAttempted) {
      await ignoreFailure(() => lifecycle?.unregisterSignalHandlers?.());
    }

    if (reminderJob) {
      await ignoreFailure(() => reminderJob.stop?.());
    }

    if (server) {
      await ignoreFailure(() => closeHttpServer(server));
    }

    if (mongoStarted) {
      await ignoreFailure(() => disconnectMongo?.());
    }
  };

  const start = () => {
    if (startupPromise) return startupPromise;

    startupPromise = (async () => {
      try {
        stage = "validation";
        validateRequiredEnv(env);

        stage = "mongo";
        mongoStarted = true;
        await connectMongo({ uri: env.MONGO_URI });

        stage = "reminder";
        if (env.APPT_REMINDERS_ENABLED !== "false") {
          reminderJob = startReminder();
        }

        stage = "http";
        server = listenHttp();

        stage = "lifecycle";
        lifecycle = createLifecycle({
          server,
          reminderJob,
          disconnectMongo,
        });
        lifecycleRegistrationAttempted = true;
        lifecycle.registerSignalHandlers();

        safeLog(logger, "info", {
          event: "startup_success",
          stage: "lifecycle",
        });

        return {
          started: true,
          server,
          reminderJob,
          lifecycle,
        };
      } catch {
        const event =
          stage === "validation"
            ? "startup_validation_failed"
            : "startup_failed";

        safeLog(logger, "error", {
          event,
          stage,
          exitCode: 1,
        });

        await cleanupPartialStartup();
        requestExitOnce(1);

        return {
          started: false,
          exitCode: 1,
          stage,
        };
      }
    })();

    return startupPromise;
  };

  return { start };
};
