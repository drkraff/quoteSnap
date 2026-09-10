/**
 * E.164 phone for AUTH-01 register/login.
 * Keep digit rules in sync with `apps/mobile/src/auth/auth-identifier.ts`.
 */

/** E.164: `+` plus 10–15 digits, country code not starting with 0. */
const E164_REGEX = /^\+[1-9]\d{9,14}$/;

/**
 * Normalize a typed phone to E.164.
 *
 * - Already-`+` values: strip non-digits, keep the leading `+`.
 * - 10 digits with no `+`: US `+1`.
 * - 11–15 digits with no `+`: treat as country code already included.
 */
export function normalizeAuthPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    return null;
  }

  let e164: string;
  if (hasPlus) {
    e164 = `+${digits}`;
  } else if (digits.length === 10) {
    e164 = `+1${digits}`;
  } else {
    e164 = `+${digits}`;
  }

  return E164_REGEX.test(e164) ? e164 : null;
}
