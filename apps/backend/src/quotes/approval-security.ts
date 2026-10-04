import type { NextFunction, Request, Response } from "express";
import { rateLimit, type Options, type RateLimitRequestHandler } from "express-rate-limit";

/** Per-IP window for the public approval page and its approve/decline posts. */
export const APPROVAL_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** High enough for a customer to open the page and tap once, including retries. */
export const APPROVAL_RATE_LIMIT_MAX = 60;

export const APPROVAL_RATE_LIMIT_MESSAGE = {
  error: "Too many requests, please try again later",
} as const;

export const APPROVAL_SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
} as const;

export function approvalSecurityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  for (const [name, value] of Object.entries(APPROVAL_SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
  next();
}

export type ApprovalLimiterOverrides = Pick<
  Partial<Options>,
  "windowMs" | "limit" | "max" | "validate" | "store"
>;

export function createApprovalLimiter(
  overrides: ApprovalLimiterOverrides = {},
): RateLimitRequestHandler {
  return rateLimit({
    windowMs: APPROVAL_RATE_LIMIT_WINDOW_MS,
    max: APPROVAL_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: APPROVAL_RATE_LIMIT_MESSAGE,
    ...overrides,
  });
}

export const approvalLimiter = createApprovalLimiter();
