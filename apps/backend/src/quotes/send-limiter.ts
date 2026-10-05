import { rateLimit, type Options, type RateLimitRequestHandler } from "express-rate-limit";

/** Per-contractor window for POST /quotes/:id/send. */
export const SEND_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * High enough that a second send of the same quote still reaches the handler
 * and returns 409 (write-once snapshot). The cap is not 1.
 */
export const SEND_RATE_LIMIT_MAX = 20;

export const SEND_RATE_LIMIT_MESSAGE = {
  error: "Too many send attempts, please try again later",
} as const;

export function sendRateLimitKey(contractorId: string | undefined): string {
  if (typeof contractorId !== "string") return "contractor:missing";
  const trimmed = contractorId.trim();
  if (trimmed === "") return "contractor:missing";
  return `contractor:${trimmed}`;
}

export type SendLimiterOverrides = Pick<
  Partial<Options>,
  "windowMs" | "limit" | "max" | "validate" | "store"
>;

export function createSendLimiter(
  overrides: SendLimiterOverrides = {},
): RateLimitRequestHandler {
  return rateLimit({
    windowMs: SEND_RATE_LIMIT_WINDOW_MS,
    max: SEND_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: SEND_RATE_LIMIT_MESSAGE,
    keyGenerator: (req) => sendRateLimitKey(req.contractor?.contractorId),
    // Key is the contractor id, not the socket address.
    validate: { keyGeneratorIpFallback: false },
    ...overrides,
  });
}
