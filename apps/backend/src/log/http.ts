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

export const BODY_TOO_LARGE_MESSAGE = "That upload is too large.";
export const UPLOAD_REJECTED_MESSAGE = "That upload could not be accepted.";
export const MALFORMED_BODY_MESSAGE = "That request could not be read.";

function errorField(err: unknown, key: string): unknown {
  if (!err || typeof err !== "object") return undefined;
  return (err as Record<string, unknown>)[key];
}

/**
 * Body-parser's oversize or unreadable JSON, and multer's limit errors, are
 * client mistakes. Anything else stays a generic 500. The message is fixed
 * copy — never err.message, and never the request body.
 */
export function httpClientError(err: unknown): { status: 413 | 400; error: string } | null {
  const type = errorField(err, "type");
  const status = errorField(err, "status");
  const statusCode = errorField(err, "statusCode");
  const code = errorField(err, "code");
  const name = errorField(err, "name");
  if (
    type === "entity.too.large"
    || status === 413
    || statusCode === 413
    || code === "LIMIT_FILE_SIZE"
  ) {
    return { status: 413, error: BODY_TOO_LARGE_MESSAGE };
  }
  if (
    type === "entity.parse.failed"
    || (name === "SyntaxError" && (status === 400 || statusCode === 400))
  ) {
    return { status: 400, error: MALFORMED_BODY_MESSAGE };
  }
  if (name === "MulterError" || (typeof code === "string" && code.startsWith("LIMIT_"))) {
    return { status: 400, error: UPLOAD_REJECTED_MESSAGE };
  }
  return null;
}

/**
 * Unexpected errors become one structured log line and a generic JSON 500.
 * Oversize JSON is 413, unreadable JSON and multer limits are 400, all with
 * plain copy. The body never includes a stack, the parser message, or the
 * request body. Route handlers that already sent a response (including the
 * approval page HTML) are left alone.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const client = httpClientError(err);
  const status = client?.status ?? 500;
  logRequestFailure(req, err, "unhandled_error", status);
  if (res.headersSent) {
    next(err);
    return;
  }
  if (client) {
    res.status(client.status).json({ error: client.error });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
};
