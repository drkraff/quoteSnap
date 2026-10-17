/** Signed Postgres INTEGER upper bound. */
export const POSTGRES_INTEGER_MAX = 2_147_483_647;

export function isStorableNonNegativeCents(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= POSTGRES_INTEGER_MAX
  );
}

export function isStorableQuantity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= POSTGRES_INTEGER_MAX
  );
}

/**
 * Spoken hours may be fractional. Half an hour is 0.5. There is no one-hour
 * minimum — migration 007's INTEGER column and `quantity >= 1` check rounded
 * 0.5 up to 1; migration 025 stores numeric and allows fractions (2 decimals).
 */
export function isStorableHours(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return false;
  }
  if (value > POSTGRES_INTEGER_MAX) {
    return false;
  }
  const scaled = value * 100;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/**
 * Quantity from quote_line_items. The pool parses numeric(12,2) as a number.
 * Whole values stay integers (2 → 2). A value that is not a positive finite
 * number falls back to 1.
 */
export function coerceStoredQuantity(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value * 100) / 100;
  }
  return 1;
}
