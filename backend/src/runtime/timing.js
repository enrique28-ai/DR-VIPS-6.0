import { randomUUID } from "node:crypto";

export const TIMING_REQUEST_HEADER = "x-dr-vips-timing-id";

const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const createRuntimeTimingId = () => {
  try {
    return randomUUID();
  } catch {
    return null;
  }
};
export const RUNTIME_TIMING_ID = createRuntimeTimingId();
const TIMING_CONTEXT = Symbol("drVipsTimingContext");
const ALLOWED_FIELDS = new Set([
  "event",
  "stage",
  "durationMs",
  "attempt",
  "status",
  "endpointClass",
  "requestId",
  "runtimeId",
]);
const ALLOWED_STAGES = new Set([
  "backend_startup",
  "env_validation",
  "mongo_connect_total",
  "http_listen_requested",
  "http_listening",
  "startup_ready",
  "express_request",
  "protect",
  "user_lookup",
  "auth_me_controller",
]);
const ALLOWED_STATUSES = new Set([
  "started",
  "success",
  "failed",
  "requested",
  "listening",
  "unauthenticated",
  "operational_error",
  "closed",
]);

export const readMonotonicNow = (now = () => performance.now()) => {
  try {
    const value = Number(now());
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

export const boundedDurationMs = (startedAt, endedAt) => {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return 0;

  const duration = Math.max(0, endedAt - startedAt);
  return Math.min(MAX_DURATION_MS, Math.round(duration * 1000) / 1000);
};

export const sanitizeTimingPayload = (payload = {}) => {
  const safePayload = { event: "timing" };

  if (ALLOWED_STAGES.has(payload.stage)) safePayload.stage = payload.stage;
  if (Number.isFinite(payload.durationMs)) {
    safePayload.durationMs = Math.min(
      MAX_DURATION_MS,
      Math.max(0, Math.round(payload.durationMs * 1000) / 1000),
    );
  }
  if (Number.isSafeInteger(payload.attempt) && payload.attempt > 0) {
    safePayload.attempt = payload.attempt;
  }
  if (
    ALLOWED_STATUSES.has(payload.status) ||
    (Number.isSafeInteger(payload.status) && payload.status >= 100 && payload.status <= 599)
  ) {
    safePayload.status = payload.status;
  }
  if (payload.endpointClass === "auth_me") {
    safePayload.endpointClass = payload.endpointClass;
  }
  if (typeof payload.requestId === "string" && REQUEST_ID_PATTERN.test(payload.requestId)) {
    safePayload.requestId = payload.requestId;
  }
  if (typeof payload.runtimeId === "string" && REQUEST_ID_PATTERN.test(payload.runtimeId)) {
    safePayload.runtimeId = payload.runtimeId;
  }

  for (const field of Object.keys(safePayload)) {
    if (!ALLOWED_FIELDS.has(field)) delete safePayload[field];
  }

  return safePayload;
};

export const safeTimingLog = (logger, level, payload) => {
  try {
    if (typeof logger?.[level] === "function") {
      logger[level]("[timing]", sanitizeTimingPayload({
        ...payload,
        runtimeId: RUNTIME_TIMING_ID,
      }));
    }
  } catch {
    // Timing must never affect startup or request handling.
  }
};

const validRequestId = (value) =>
  typeof value === "string" && value.length === 36 && REQUEST_ID_PATTERN.test(value)
    ? value
    : null;

const createRequestId = (createUuid) => {
  try {
    return validRequestId(createUuid());
  } catch {
    return null;
  }
};

const requestHeader = (req) => {
  try {
    return typeof req?.get === "function"
      ? req.get(TIMING_REQUEST_HEADER)
      : req?.headers?.[TIMING_REQUEST_HEADER];
  } catch {
    return undefined;
  }
};

export const createAuthMeRequestTiming = ({
  logger = console,
  now = () => performance.now(),
  createUuid = randomUUID,
} = {}) => (req, res, next) => {
  let isAuthMe = false;
  try {
    isAuthMe = req?.method === "GET" && req?.path === "/api/auth/me";
  } catch {
    // A timing path check is best-effort.
  }

  if (!isAuthMe) return next();

  try {
    const requestId = validRequestId(requestHeader(req)) ?? createRequestId(createUuid);
    const context = {
      endpointClass: "auth_me",
      logger,
      now,
      requestId,
      startedAt: readMonotonicNow(now),
    };
    Object.defineProperty(req, TIMING_CONTEXT, { value: context });

    let completed = false;
    const complete = (status) => {
      if (completed) return;
      completed = true;
      const endedAt = readMonotonicNow(now);
      safeTimingLog(logger, "info", {
        event: "timing",
        stage: "express_request",
        durationMs: boundedDurationMs(context.startedAt, endedAt),
        status,
        endpointClass: context.endpointClass,
        requestId: context.requestId,
      });
    };

    res.once("finish", () => complete(res.statusCode));
    res.once("close", () => complete("closed"));
  } catch {
    // Correlation and timing setup must not block the request.
  }

  return next();
};

export const startAuthTimingSpan = (req) => {
  const context = req?.[TIMING_CONTEXT];
  return context ? readMonotonicNow(context.now) : null;
};

export const completeAuthTimingSpan = (req, stage, startedAt, status) => {
  const context = req?.[TIMING_CONTEXT];
  if (!context) return;

  const endedAt = readMonotonicNow(context.now);
  safeTimingLog(
    context.logger,
    status === "failed" || status === "operational_error" ? "error" : "info",
    {
      event: "timing",
      stage,
      durationMs: boundedDurationMs(startedAt, endedAt),
      status,
      endpointClass: context.endpointClass,
      requestId: context.requestId,
    },
  );
};
