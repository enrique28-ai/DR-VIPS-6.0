import helmet from "helmet";

export function createSecurityHeaders({ isProduction = process.env.NODE_ENV === "production" } = {}) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://www.google.com",
          "https://www.gstatic.com",
          "https://www.recaptcha.net",
          "https://challenges.cloudflare.com",
        ],
        frameSrc: [
          "https://www.google.com",
          "https://recaptcha.google.com",
          "https://www.recaptcha.net",
          "https://challenges.cloudflare.com",
        ],
        connectSrc: [
          "'self'",
          "https://www.google.com",
          "https://www.gstatic.com",
          "https://www.recaptcha.net",
        ],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://res.cloudinary.com",
          "https://*.googleusercontent.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", "data:"],
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
    hsts: isProduction,
  });
}

export function setApiNoStoreHeaders(res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

export function apiNoStore(_req, res, next) {
  setApiNoStoreHeaders(res);
  next();
}
