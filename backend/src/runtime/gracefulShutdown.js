const ALLOWED_LOG_FIELDS = [
  "event",
  "stage",
  "signal",
  "timeoutMs",
  "exitCode",
];

const normalizeSignal = (signal) =>
  signal === "SIGTERM" || signal === "SIGINT" ? signal : "UNKNOWN";

export const createGracefulShutdown = ({
  server,
  reminderJob = null,
  disconnectMongo,
  processRef = process,
  exitProcess = (exitCode) => process.exit(exitCode),
  logger = console,
  timeoutMs = 30000,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) => {
  let registered = false;
  let shutdownPromise;
  let exited = false;

  const safeLog = (level, payload) => {
    const safePayload = {};

    for (const field of ALLOWED_LOG_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        safePayload[field] = payload[field];
      }
    }

    try {
      if (typeof logger?.[level] === "function") {
        logger[level]("[shutdown]", safePayload);
      }
    } catch {
      // Logging must never interrupt process cleanup.
    }
  };

  const exitOnce = (exitCode) => {
    if (exited) return;
    exited = true;

    try {
      exitProcess(exitCode);
    } catch {
      // An injected exit implementation must not reject the shutdown promise.
    }
  };

  const stopReminderJob = () => {
    if (typeof reminderJob?.stop !== "function") return Promise.resolve();

    try {
      return Promise.resolve(reminderJob.stop());
    } catch (error) {
      return Promise.reject(error);
    }
  };

  const closeHttpServer = () => {
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
        }
      } catch (error) {
        finish(error);
      }
    });
  };

  const forceCloseConnections = () => {
    if (typeof server?.closeAllConnections !== "function") return;

    try {
      const result = server.closeAllConnections();
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
    } catch {
      // The watchdog must continue to process exit even if force-close fails.
    }
  };

  const shutdown = (requestedSignal) => {
    if (shutdownPromise) return shutdownPromise;

    const signal = normalizeSignal(requestedSignal);

    shutdownPromise = (async () => {
      let exitCode = 0;
      let timedOut = false;
      let finished = false;
      let watchdog;

      safeLog("info", { event: "shutdown_started", signal });

      try {
        watchdog = setTimeoutFn(() => {
          if (finished || exited) return;

          timedOut = true;
          exitCode = 1;
          safeLog("error", {
            event: "shutdown_timeout",
            signal,
            timeoutMs,
            exitCode,
          });
          forceCloseConnections();
          unregisterSignalHandlers();
          exitOnce(exitCode);
        }, timeoutMs);
        watchdog?.unref?.();
      } catch {
        // Cleanup can still proceed if an injected timer implementation fails.
      }

      const reminderResult = stopReminderJob();
      const httpResult = closeHttpServer();
      const [reminderOutcome, httpOutcome] = await Promise.allSettled([
        reminderResult,
        httpResult,
      ]);

      if (reminderOutcome.status === "rejected") {
        exitCode = 1;
        safeLog("error", {
          event: "reminder_stop_failed",
          stage: "reminder",
          signal,
        });
      }

      if (httpOutcome.status === "rejected") {
        exitCode = 1;
        safeLog("error", {
          event: "http_close_failed",
          stage: "http",
          signal,
        });
      }

      try {
        if (typeof disconnectMongo === "function") {
          await disconnectMongo();
        }
      } catch {
        exitCode = 1;
        safeLog("error", {
          event: "mongo_disconnect_failed",
          stage: "mongo",
          signal,
        });
      }

      finished = true;
      try {
        clearTimeoutFn(watchdog);
      } catch {
        // Completion and exit must not depend on timer cleanup.
      }
      unregisterSignalHandlers();

      if (timedOut) return exitCode;

      safeLog(exitCode === 0 ? "info" : "error", {
        event: "shutdown_complete",
        signal,
        exitCode,
      });
      exitOnce(exitCode);
      return exitCode;
    })();

    return shutdownPromise;
  };

  const onSigterm = () => shutdown("SIGTERM");
  const onSigint = () => shutdown("SIGINT");

  const registerSignalHandlers = () => {
    if (registered) return;
    processRef.on("SIGTERM", onSigterm);
    processRef.on("SIGINT", onSigint);
    registered = true;
  };

  const unregisterSignalHandlers = () => {
    if (!registered) return;
    processRef.off("SIGTERM", onSigterm);
    processRef.off("SIGINT", onSigint);
    registered = false;
  };

  return { shutdown, registerSignalHandlers, unregisterSignalHandlers };
};
