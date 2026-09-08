import { rateLimit, type Options, type RateLimitRequestHandler } from "express-rate-limit";

/** Per-IP window for POST /auth/register, /login, and /refresh. */
export const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Max attempts per IP per window. Shared across register, login, and refresh
 * so mixed auth abuse from one client shares one bucket. Six is enough for a
 * legitimate signup (one request, a few retries) without opening account spam.
 */
export const AUTH_RATE_LIMIT_MAX = 6;

export const AUTH_RATE_LIMIT_MESSAGE = {
  error: "Too many attempts, please try again later",
} as const;

export type AuthLimiterOverrides = Pick<
  Partial<Options>,
  "windowMs" | "limit" | "max" | "validate" | "store"
>;

export function createAuthLimiter(
  overrides: AuthLimiterOverrides = {},
): RateLimitRequestHandler {
  return rateLimit({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    max: AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: AUTH_RATE_LIMIT_MESSAGE,
    ...overrides,
  });
}

/** Shared instance used by register, login, and refresh. */
export const authLimiter = createAuthLimiter();
