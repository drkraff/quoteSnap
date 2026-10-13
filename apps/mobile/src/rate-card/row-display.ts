import { UNIT_LABELS, parseCatalogUnit } from '../catalog/units';
import { formatMoneyCents, type CurrencyCode } from '../money/currency';
import type { RateCardSource } from '../api/rate-card';

export type RateCardRowDisplay = {
  name: string;
  priceDisplay: string;
  unitLabel: string;
  useCountLabel: string;
  sourceLabel: string | null;
  accessibilityLabel: string;
};

const SOURCE_LABEL: Record<RateCardSource, string> = {
  imported: 'Imported',
  confirmed: 'Confirmed',
  typed: 'Typed',
};

export function rateCardSourceLabel(source: RateCardSource | string): string | null {
  if (source === 'imported' || source === 'confirmed' || source === 'typed') {
    return SOURCE_LABEL[source];
  }
  return null;
}

export function rateCardUseCountLabel(useCount: number): string {
  if (useCount === 1) {
    return 'Used 1 time';
  }
  return `Used ${useCount} times`;
}

export function rateCardRowDisplay(entry: {
  displayName: string;
  unit: string;
  unitPriceCents: number;
  useCount: number;
  source: RateCardSource | string;
  currency?: CurrencyCode;
}): RateCardRowDisplay {
  const priceDisplay = formatMoneyCents(entry.unitPriceCents, entry.currency);
  const parsed = parseCatalogUnit(entry.unit);
  const unitLabel = parsed ? UNIT_LABELS[parsed] : entry.unit;
  const useCountLabel = rateCardUseCountLabel(entry.useCount);
  const sourceLabel = rateCardSourceLabel(entry.source);
  const sourceBit = sourceLabel ? `, ${sourceLabel.toLowerCase()}` : '';
  const accessibilityLabel = `${entry.displayName}, ${priceDisplay} per ${unitLabel}, ${useCountLabel.toLowerCase()}${sourceBit}. Double tap to edit.`;

  return {
    name: entry.displayName,
    priceDisplay,
    unitLabel,
    useCountLabel,
    sourceLabel,
    accessibilityLabel,
  };
}
