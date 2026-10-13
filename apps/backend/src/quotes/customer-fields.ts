/**
 * Customer-facing name and exclusions. Empty / whitespace → null.
 * Keep the length limits in sync with the mobile normalizer.
 */

export const CUSTOMER_NAME_MAX_LENGTH = 200;
export const EXCLUSIONS_MAX_LENGTH = 2000;

export const CUSTOMER_NAME_FIELD_ERROR =
  `customerName must be a string or null (max ${CUSTOMER_NAME_MAX_LENGTH} characters)`;

export const EXCLUSIONS_FIELD_ERROR =
  `exclusions must be a string or null (max ${EXCLUSIONS_MAX_LENGTH} characters)`;

export function normalizeLimitedText(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export function normalizeCustomerName(value: string | null | undefined): string | null {
  return normalizeLimitedText(value, CUSTOMER_NAME_MAX_LENGTH);
}

export function normalizeExclusions(value: string | null | undefined): string | null {
  return normalizeLimitedText(value, EXCLUSIONS_MAX_LENGTH);
}

function parseLimited(
  value: unknown,
  maxLength: number,
  error: string,
): { ok: true; text: string | null } | { ok: false; error: string } {
  if (value === null) return { ok: true, text: null };
  if (typeof value !== "string") return { ok: false, error };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, text: null };
  if (trimmed.length > maxLength) return { ok: false, error };
  return { ok: true, text: trimmed };
}

export function parseOptionalCustomerName(
  value: unknown,
): { ok: true; name: string | null } | { ok: false; error: string } {
  const parsed = parseLimited(value, CUSTOMER_NAME_MAX_LENGTH, CUSTOMER_NAME_FIELD_ERROR);
  if (!parsed.ok) return parsed;
  return { ok: true, name: parsed.text };
}

export function parseOptionalExclusions(
  value: unknown,
): { ok: true; exclusions: string | null } | { ok: false; error: string } {
  const parsed = parseLimited(value, EXCLUSIONS_MAX_LENGTH, EXCLUSIONS_FIELD_ERROR);
  if (!parsed.ok) return parsed;
  return { ok: true, exclusions: parsed.text };
}

export function capitalizeItemName(name: string): string {
  return name.replace(/\S+/g, (word) => {
    if (/[A-Z]/.test(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}
