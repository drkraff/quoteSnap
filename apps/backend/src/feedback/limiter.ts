import { rateLimit, type Options, type RateLimitRequestHandler } from "express-rate-limit";

/** Per-contractor window for POST /feedback. */
export const FEEDBACK_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Enough for a few notes and retries. Not a firehose. */
export const FEEDBACK_RATE_LIMIT_MAX = 10;

export const FEEDBACK_RATE_LIMIT_MESSAGE = {
  error: "Too many feedback notes, please try again later",
} as const;

export function feedbackRateLimitKey(contractorId: string | undefined): string {
  if (typeof contractorId !== "string") return "contractor:missing";
  const trimmed = contractorId.trim();
  if (trimmed === "") return "contractor:missing";
  return `contractor:${trimmed}`;
}

export type FeedbackLimiterOverrides = Pick<
  Partial<Options>,
  "windowMs" | "limit" | "max" | "validate" | "store"
>;

export function createFeedbackLimiter(
  overrides: FeedbackLimiterOverrides = {},
): RateLimitRequestHandler {
  return rateLimit({
    windowMs: FEEDBACK_RATE_LIMIT_WINDOW_MS,
    max: FEEDBACK_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: FEEDBACK_RATE_LIMIT_MESSAGE,
    keyGenerator: (req) => feedbackRateLimitKey(req.contractor?.contractorId),
    validate: { keyGeneratorIpFallback: false },
    ...overrides,
  });
}
