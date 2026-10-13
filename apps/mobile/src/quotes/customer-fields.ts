/** Customer-facing quote text. Empty becomes null. Never a placeholder. */

export const CUSTOMER_NAME_MAX_LENGTH = 200;
export const EXCLUSIONS_MAX_LENGTH = 2000;

export const EXCLUSIONS_LABEL = 'Not included';
export const EXCLUSIONS_HINT = 'Shown on the customer PDF. Leave blank if nothing is excluded.';
export const EXCLUSIONS_PLACEHOLDER = 'Leave blank if nothing is excluded';

export const CUSTOMER_NAME_LABEL = 'Customer name';

export function normalizeLimitedText(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export function normalizeCustomerName(value: string | null | undefined): string | null {
  return normalizeLimitedText(value, CUSTOMER_NAME_MAX_LENGTH);
}

export function normalizeExclusions(value: string | null | undefined): string | null {
  return normalizeLimitedText(value, EXCLUSIONS_MAX_LENGTH);
}

/** First letter of each all-lowercase word. "SKU" and "Walk-in" stay put. */
export function capitalizeItemName(name: string): string {
  return name.replace(/\S+/g, (word) => {
    if (/[A-Z]/.test(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DEFAULT_QUOTE_VALID_DAYS = 14;

export function formatQuoteDate(value: Date): string {
  return `${value.getUTCDate()} ${MONTHS[value.getUTCMonth()]} ${value.getUTCFullYear()}`;
}

export function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Stable short number from the quote id. No sequence column. */
export function formatQuoteNumber(id: string | null | undefined): string | null {
  if (id == null) return null;
  const compact = id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (compact.length < 4) return null;
  return `QS-${compact.slice(-6)}`;
}

export function businessInitials(name: string | null | undefined): string | null {
  if (name == null) return null;
  const parts = name.trim().split(/\s+/).filter((part) => part !== '');
  if (parts.length === 0) return null;
  const letters = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
  const mark = letters.join('');
  return mark === '' ? null : mark;
}
