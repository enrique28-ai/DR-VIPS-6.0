import { getLiveness } from "../controllers/healthController.js";

const PROBE_AUTHORITIES = new Set(["containerstarthealthcheck", "ping"]);

// SDK 0.3.7 probes these authorities at exactly GET /. Host is only a routing
// hint for public liveness, never evidence of identity or authorization. Read
// the raw Host, not Express hostname (which trusts X-Forwarded-Host here).
// Register only in production, after API routing and before the SPA fallback.
export const containerHealthProbe = (req, res, next) => {
  if (
    (req.method === "GET" || req.method === "HEAD") &&
    req.originalUrl === "/" &&
    PROBE_AUTHORITIES.has(req.headers.host)
  ) {
    return getLiveness(req, res);
  }
  return next();
};
