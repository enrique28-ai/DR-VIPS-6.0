export const TIMING_REQUEST_HEADER = "x-dr-vips-timing-id";

const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENDPOINT_CLASSES = new Set([
  "auth_me",
  "health_live",
  "health_ready",
  "other_api",
]);

const readNow = (now) => {
  try {
    const value = Number(now());
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

export const boundedDurationMs = (startedAt, endedAt) => {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return 0;
  return Math.min(
    MAX_DURATION_MS,
    Math.max(0, Math.round((endedAt - startedAt) * 1000) / 1000),
  );
};

export const classifyApiEndpoint = (pathname) => {
  if (pathname === "/api/auth/me") return "auth_me";
  if (pathname === "/api/health/live") return "health_live";
  if (pathname === "/api/health/ready") return "health_ready";
  return "other_api";
};

const createRequestId = (createUuid) => {
  try {
    const value = createUuid();
    return typeof value === "string" && value.length === 36 && REQUEST_ID_PATTERN.test(value)
      ? value
      : null;
  } catch {
    return null;
  }
};

export const sanitizeWorkerTimingPayload = (payload = {}) => {
  const safePayload = {
    event: "timing",
    stage: "container_request",
  };

  if (Number.isFinite(payload.durationMs)) {
    safePayload.durationMs = Math.min(
      MAX_DURATION_MS,
      Math.max(0, Math.round(payload.durationMs * 1000) / 1000),
    );
  }
  if (
    payload.status === "failed" ||
    (Number.isSafeInteger(payload.status) && payload.status >= 100 && payload.status <= 599)
  ) {
    safePayload.status = payload.status;
  }
  if (ENDPOINT_CLASSES.has(payload.endpointClass)) {
    safePayload.endpointClass = payload.endpointClass;
  }
  if (typeof payload.requestId === "string" && REQUEST_ID_PATTERN.test(payload.requestId)) {
    safePayload.requestId = payload.requestId;
  }

  return safePayload;
};

const safeLog = (logger, level, payload) => {
  try {
    if (typeof logger?.[level] === "function") {
      logger[level]("[timing]", sanitizeWorkerTimingPayload(payload));
    }
  } catch {
    // Timing must never affect API forwarding.
  }
};

export const fetchContainerWithTiming = async ({
  request,
  container,
  logger = console,
  now = () => performance.now(),
  createUuid = () => globalThis.crypto.randomUUID(),
}) => {
  const endpointClass = classifyApiEndpoint(new URL(request.url).pathname);
  const requestId = createRequestId(createUuid);
  let forwardedRequest = request;

  try {
    const headers = new Headers(request.headers);
    if (requestId) headers.set(TIMING_REQUEST_HEADER, requestId);
    else headers.delete(TIMING_REQUEST_HEADER);
    forwardedRequest = new Request(request, { headers });
  } catch {
    // Preserve forwarding if correlation setup is unavailable.
  }

  const startedAt = readNow(now);
  try {
    const response = await container.fetch(forwardedRequest);
    safeLog(logger, "info", {
      durationMs: boundedDurationMs(startedAt, readNow(now)),
      status: response.status,
      endpointClass,
      requestId,
    });
    return response;
  } catch (error) {
    safeLog(logger, "error", {
      durationMs: boundedDurationMs(startedAt, readNow(now)),
      status: "failed",
      endpointClass,
      requestId,
    });
    throw error;
  }
};
