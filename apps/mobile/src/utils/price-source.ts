/** Persist values: attach sources plus contractor-typed `known`. */
export const PRICE_SOURCES = [
  'spoken',
  'catalog',
  'learned',
  'computed',
  'unknown',
  'known',
] as const;

export type PriceSource = (typeof PRICE_SOURCES)[number];

/** Design §7 draft quality flags. catalog / learned / known collapse to Known. */
export type DraftPriceFlag = 'spoken' | 'computed' | 'known' | 'unknown';

export function parsePriceSource(value: unknown): PriceSource | undefined {
  if (typeof value !== 'string') return undefined;
  return (PRICE_SOURCES as readonly string[]).includes(value)
    ? (value as PriceSource)
    : undefined;
}

/**
 * Blank cents are always Unknown — never show "you said" / "from your rate"
 * on a missing price. A filled price without a stored source is Known (quiet).
 */
export function draftPriceFlag(
  priceSource: string | null | undefined,
  unitPriceCents: number | null | undefined,
): DraftPriceFlag {
  if (unitPriceCents == null || unitPriceCents === 0) {
    return 'unknown';
  }
  if (priceSource === 'spoken') return 'spoken';
  if (priceSource === 'computed') return 'computed';
  return 'known';
}

export function draftPriceSourceLabel(flag: DraftPriceFlag): string | null {
  switch (flag) {
    case 'spoken':
      return 'you said';
    case 'computed':
      return 'from your rate';
    case 'known':
      return null;
    case 'unknown':
      return null;
  }
}

/** Contractor typed/confirmed a number on review. Blank stays unknown — never invent. */
export function typedPriceSource(unitPriceCents: number | null | undefined): PriceSource {
  return unitPriceCents != null && unitPriceCents > 0 ? 'known' : 'unknown';
}
