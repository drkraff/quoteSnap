/**
 * Snapshot price provenance on quote_line_items.
 *
 * Voice attach (in-memory) already emits spoken | catalog | learned |
 * computed | unknown. Persist those plus `known` for a contractor-typed
 * confirm on review. Draft UI maps catalog/learned/known → Known (quiet).
 */

export const SNAPSHOT_PRICE_SOURCES = [
  "spoken",
  "catalog",
  "learned",
  "computed",
  "unknown",
  "known",
] as const;

export type SnapshotPriceSource = (typeof SNAPSHOT_PRICE_SOURCES)[number];

const PRICE_SOURCE_ERROR =
  "priceSource must be spoken, catalog, learned, computed, unknown, or known";

export function isSnapshotPriceSource(value: unknown): value is SnapshotPriceSource {
  return typeof value === "string" && (SNAPSHOT_PRICE_SOURCES as readonly string[]).includes(value);
}

/**
 * Omitted / null / empty → preserve (undefined). Invalid string → 400.
 */
export function parseOptionalPriceSource(
  value: unknown,
): { ok: true; source: SnapshotPriceSource | undefined } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, source: undefined };
  }
  if (isSnapshotPriceSource(value)) {
    return { ok: true, source: value };
  }
  return { ok: false, error: PRICE_SOURCE_ERROR };
}

/** Pre-migration rows and unmatched PUT lines: a filled snapshot is Known, blank is Unknown. */
export function inferSnapshotPriceSource(unitPriceCents: number): SnapshotPriceSource {
  return unitPriceCents > 0 ? "known" : "unknown";
}

export function snapshotPriceSourceFromRow(
  stored: string | null | undefined,
  unitPriceCents: number,
): SnapshotPriceSource {
  if (isSnapshotPriceSource(stored)) {
    return stored;
  }
  return inferSnapshotPriceSource(unitPriceCents);
}
