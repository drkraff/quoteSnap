import { randomUUID } from "node:crypto";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { logRequestFailure } from "./logger.js";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function resolveRequestId(header: string | undefined): string {
  if (!header) return randomUUID();
  const trimmed = header.trim();
  if (!SAFE_REQUEST_ID.test(trimmed)) return randomUUID();
  if (trimmed.startsWith("sk-") || trimmed.split(".").length >= 3 || trimmed.includes("eyJ")) {
    return randomUUID();
  }
  return trimmed;
}

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const requestId = resolveRequestId(req.header("x-request-id"));
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
};

/**
 * Unexpected errors become one structured log line and a generic JSON 500.
 * The body is always `{ error: "Internal server error" }` — no stack, no
 * internal message. Route handlers that already sent a response (including
 * the approval page HTML) are left alone.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  logRequestFailure(req, err, "unhandled_error", 500);
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(500).json({ error: "Internal server error" });
};
