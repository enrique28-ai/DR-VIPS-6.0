import {
  boundedDurationMs,
  classifyApiEndpoint,
  TIMING_REQUEST_HEADER,
} from "./requestTiming.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAGES = new Set([
  "durable_object_request",
  "container_start_readiness",
  "container_port_wait",
]);
const ENDPOINT_CLASSES = new Set([
  "auth_me", "health_live", "health_ready", "other_api",
]);
const validId = (value) =>
  typeof value === "string" && value.length === 36 && UUID_PATTERN.test(value);

const createId = (createUuid) => {
  try {
    const value = createUuid();
    return validId(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

const readNow = (now) => {
  try {
    const value = now();
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

export const sanitizeContainerTimingPayload = (payload = {}) => {
  const safe = { event: "timing" };
  if (STAGES.has(payload.stage)) safe.stage = payload.stage;
  if (Number.isFinite(payload.durationMs) && payload.durationMs >= 0) {
    safe.durationMs = boundedDurationMs(0, payload.durationMs);
  }
  if (
    payload.status === "success" || payload.status === "failed" ||
    (Number.isSafeInteger(payload.status) && payload.status >= 100 && payload.status <= 599)
  ) safe.status = payload.status;
  for (const key of ["durableObjectRuntimeId", "operationId", "requestId"]) {
    if (validId(payload[key])) safe[key] = payload[key];
  }
  if (ENDPOINT_CLASSES.has(payload.endpointClass)) {
    safe.endpointClass = payload.endpointClass;
  }
  return safe;
};

const requestMetadata = (request) => {
  const metadata = {};
  try {
    metadata.endpointClass = classifyApiEndpoint(new URL(request.url).pathname);
    const requestId = request.headers.get(TIMING_REQUEST_HEADER);
    if (validId(requestId)) metadata.requestId = requestId;
  } catch {
    // Correlation is best-effort; never inspect or log arbitrary request data.
  }
  return metadata;
};

// Observe public SDK methods, without replacing their startup/proxy logic.
// Lifecycle calls have no request argument: associate them by object lifetime,
// never by a mutable "current request" that concurrent callers could overwrite.
export const withContainerTiming = (BaseContainer, {
  logger = console,
  now = () => performance.now(),
  createUuid = () => globalThis.crypto.randomUUID(),
} = {}) => {
  const observe = (stage, durableObjectRuntimeId, delegate, metadata = {}) => {
    const startedAt = readNow(now);
    const operationId = createId(createUuid);
    const complete = (result, failed) => {
      try {
        const endedAt = readNow(now);
        const payload = {
          stage, durableObjectRuntimeId, operationId, ...metadata,
          status: failed ? "failed" : "success",
        };
        if (
          Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt >= startedAt
        ) payload.durationMs = boundedDurationMs(startedAt, endedAt);
        if (!failed && stage === "durable_object_request") {
          try { payload.status = result.status; } catch { /* Optional metadata. */ }
        }
        const level = failed ? "error" : "info";
        if (typeof logger?.[level] === "function") {
          logger[level]("[timing]", sanitizeContainerTimingPayload(payload));
        }
      } catch {
        // Logging, metadata and clock failures must never affect SDK behavior.
      }
    };

    let result;
    try {
      result = delegate();
    } catch (error) {
      complete(undefined, true);
      throw error;
    }
    try {
      // Return the original Promise, preserving SDK coalescing and settlement.
      // Both observers return undefined and cannot reject their derived Promise.
      void result.then(
        (value) => { complete(value, false); },
        () => { complete(undefined, true); },
      );
    } catch {
      // Observability must not change even an unexpected non-Promise result.
    }
    return result;
  };

  return class extends BaseContainer {
    #durableObjectRuntimeId = createId(createUuid);

    // Handler entry -> SDK response headers/stream setup, not body completion;
    // excludes Durable Object activation/dispatch before this handler is entered.
    fetch(...args) {
      return observe("durable_object_request", this.#durableObjectRuntimeId,
        () => super.fetch(...args), requestMetadata(args[0]));
    }

    // Includes SDK start coordination, both probe stages and onStart; this is
    // neither platform provisioning alone nor application startup alone.
    startAndWaitForPorts(...args) {
      return observe("container_start_readiness", this.#durableObjectRuntimeId,
        () => super.startAndWaitForPorts(...args));
    }

    // Only the configurable port-probe loop. Excludes the earlier hardcoded
    // startup probe; resolved HTTP errors still count as success in SDK 0.3.7.
    // The SDK return value is preserved, never interpreted as an attempt count.
    waitForPort(...args) {
      return observe("container_port_wait", this.#durableObjectRuntimeId,
        () => super.waitForPort(...args));
    }
  };
};
