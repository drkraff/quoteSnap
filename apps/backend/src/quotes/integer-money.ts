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
