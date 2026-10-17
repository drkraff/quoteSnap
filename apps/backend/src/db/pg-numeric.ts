import { types } from "pg";

/**
 * Postgres `numeric` and `decimal` share OID 1700.
 * node-pg's default parser returns that value as a string ("10.00").
 * quantity is numeric(12,2) and vat_percent is numeric(6,3). Both fit in a
 * JS number. Money stays integer cents and does not use this parser.
 */
export const PG_NUMERIC_OID = 1700;

export function parsePgNumeric(value: string): number {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Invalid numeric value");
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }
  return n;
}

/** Call once, before the pool runs a query. */
export function installPgNumericParser(): void {
  types.setTypeParser(PG_NUMERIC_OID, parsePgNumeric);
}
