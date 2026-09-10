/**
 * Login/register identifier parsing (A-16 / AUTH-01).
 *
 * Splits a single field into email **or** phone so the client never sends both
 * (backend `resolveLoginIdentifier` prefers email when mixed). Phone is
 * normalized to E.164 before write/lookup so it matches `contractors.phone`.
 *
 * Keep digit rules in sync with `apps/backend/src/auth/auth-phone.ts`.
 */

export type AuthIdentifier = {
  field: 'email' | 'phone';
  value: string;
};

export type AuthIdentifierParseResult =
  | { ok: true; identifier: AuthIdentifier }
  | { ok: false; error: string };

/** Same allow-list as `apps/backend/src/routes/auth.ts`. */
export const AUTH_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** E.164: `+` plus 10–15 digits, country code not starting with 0. */
const E164_REGEX = /^\+[1-9]\d{9,14}$/;

/**
 * Normalize a typed phone to E.164.
 *
 * - Already-`+` values: strip non-digits, keep the leading `+`.
 * - 10 digits with no `+`: US `+1` (QuoteSnap trades are NANP).
 * - 11 digits starting with `1` and no `+`: US with country code.
 * - 11–15 digits with no `+`: treat as country code already included.
 */
export function normalizeAuthPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
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

export function parseAuthIdentifier(raw: string): AuthIdentifierParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'Email or phone is required.' };
  }

  // `@` means email — never fall through to phone (matches email-wins lookup).
  if (trimmed.includes('@')) {
    if (!AUTH_EMAIL_REGEX.test(trimmed)) {
      return { ok: false, error: 'Enter a valid email address.' };
    }
    return { ok: true, identifier: { field: 'email', value: trimmed } };
  }

  const phone = normalizeAuthPhone(trimmed);
  if (!phone) {
    return { ok: false, error: 'Enter a valid email or phone number.' };
  }
  return { ok: true, identifier: { field: 'phone', value: phone } };
}

/** Exactly one of `email` or `phone` — never both. */
export function credentialsFromIdentifier(
  identifier: AuthIdentifier,
  password: string,
): { email: string; password: string } | { phone: string; password: string } {
  if (identifier.field === 'email') {
    return { email: identifier.value, password };
  }
  return { phone: identifier.value, password };
}
