import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import multer from "multer";

import { setApiNoStoreHeaders } from "./securityHeaders.js";

const CLASSIFICATIONS = Object.freeze({
  invalidJson: Object.freeze({
    type: "invalid_json",
    status: 400,
    error: "Invalid JSON payload",
  }),
  payloadTooLarge: Object.freeze({
    type: "payload_too_large",
    status: 413,
    error: "Payload too large",
  }),
  invalidRequestData: Object.freeze({
    type: "invalid_request_data",
    status: 400,
    error: "Invalid request data",
  }),
  duplicateKey: Object.freeze({
    type: "duplicate_key",
    status: 409,
    error: "Resource already exists",
  }),
  fileTooLarge: Object.freeze({
    type: "file_too_large",
    status: 413,
    error: "File too large",
  }),
  invalidFileUpload: Object.freeze({
    type: "invalid_file_upload",
    status: 400,
    error: "Invalid file upload",
  }),
  invalidSession: Object.freeze({
    type: "invalid_session",
    status: 401,
    error: "Invalid or expired session",
  }),
  internalError: Object.freeze({
    type: "internal_error",
    status: 500,
    error: "Internal server error",
  }),
});

const SAFE_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

function toPublicClassification(classification) {
  return {
    type: classification.type,
    status: classification.status,
    body: { error: classification.error },
  };
}

function isMalformedJson(error) {
  return (
    error instanceof SyntaxError &&
    error?.type === "entity.parse.failed" &&
    error?.status === 400
  );
}

function isPayloadTooLarge(error) {
  return error?.type === "entity.too.large" && error?.status === 413;
}

function isMongooseError(error, name, ErrorClass) {
  return error instanceof ErrorClass || error?.name === name;
}

function isApiPath(req) {
  const pathname = typeof req?.path === "string" ? req.path : "";
  return pathname === "/api" || pathname.startsWith("/api/");
}

function safeMethod(req) {
  const method = typeof req?.method === "string" ? req.method.toUpperCase() : "";
  return SAFE_METHODS.has(method) ? method : "UNKNOWN";
}

export function classifyError(error) {
  if (isPayloadTooLarge(error)) {
    return toPublicClassification(CLASSIFICATIONS.payloadTooLarge);
  }

  if (isMalformedJson(error)) {
    return toPublicClassification(CLASSIFICATIONS.invalidJson);
  }

  if (
    isMongooseError(error, "CastError", mongoose.Error.CastError) ||
    isMongooseError(error, "ValidationError", mongoose.Error.ValidationError)
  ) {
    return toPublicClassification(CLASSIFICATIONS.invalidRequestData);
  }

  if (error?.code === 11000 || error?.code === "11000") {
    return toPublicClassification(CLASSIFICATIONS.duplicateKey);
  }

  if (error instanceof multer.MulterError) {
    const classification =
      error.code === "LIMIT_FILE_SIZE"
        ? CLASSIFICATIONS.fileTooLarge
        : CLASSIFICATIONS.invalidFileUpload;
    return toPublicClassification(classification);
  }

  if (
    error instanceof jwt.TokenExpiredError ||
    error instanceof jwt.JsonWebTokenError
  ) {
    return toPublicClassification(CLASSIFICATIONS.invalidSession);
  }

  return toPublicClassification(CLASSIFICATIONS.internalError);
}

export function apiNotFound(_req, res, _next) {
  setApiNoStoreHeaders(res);
  return res.status(404).json({ error: "API route not found" });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const classification = classifyError(err);
  const apiRequest = isApiPath(req);

  if (apiRequest) {
    setApiNoStoreHeaders(res);
  }

  if (classification.status === 500) {
    console.error("[backend-error]", {
      level: "error",
      type: classification.type,
      method: safeMethod(req),
      pathname: apiRequest ? "api_request" : "non_api_request",
      status: classification.status,
      message: "unhandled_request_error",
    });
  }

  return res.status(classification.status).json(classification.body);
}
