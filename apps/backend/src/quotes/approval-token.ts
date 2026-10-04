import crypto from "node:crypto";

/** SMS-10 default. QUOTE_APPROVAL_TTL_MS overrides this. */
export const DEFAULT_QUOTE_APPROVAL_TTL_MS = 72 * 60 * 60 * 1000;

/** 32 random bytes, unpadded base64url (43 characters). */
export const APPROVAL_TOKEN_BYTES = 32;

const APPROVAL_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Parse QUOTE_APPROVAL_TTL_MS. Unset, blank, non-finite, or non-positive
 * values fall back to 72 hours.
 */
export function resolveQuoteApprovalTtlMs(envValue: string | undefined): number {
  if (envValue === undefined || envValue.trim() === "") {
    return DEFAULT_QUOTE_APPROVAL_TTL_MS;
  }
  const parsed = Number(envValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_QUOTE_APPROVAL_TTL_MS;
  }
  return parsed;
}

export function approvalExpiresAt(now: Date, ttlMs: number): Date {
  return new Date(now.getTime() + ttlMs);
}

/** Raw token returned once. Only the SHA-256 hex of this string is stored. */
export function generateApprovalToken(): string {
  return crypto.randomBytes(APPROVAL_TOKEN_BYTES).toString("base64url");
}

export function hashApprovalToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Shape check only. A miss and a bad shape share one not-found response. */
export function isApprovalTokenShape(token: string): boolean {
  return APPROVAL_TOKEN_RE.test(token);
}

export function resolvePublicBaseUrl(envValue: string | undefined): string {
  if (envValue === undefined || envValue.trim() === "") {
    return "http://localhost:3000";
  }
  return envValue.trim().replace(/\/+$/, "");
}

export function buildApprovalUrl(publicBaseUrl: string, rawToken: string): string {
  const base = publicBaseUrl.replace(/\/+$/, "");
  return `${base}/q/${rawToken}`;
}
