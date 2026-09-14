import { parseCatalogUnit } from "../catalog/units.js";
import { lookupRateCardEntry, type RateCardQueryFn } from "../rate-card/upsert.js";
import type { BuiltVoiceLine, PriceSource, ValidatedLineItem } from "./voice-validation.js";

export type RateCardCentsLookup = (args: {
  name: string;
  unit: string;
  trade: string | null;
}) => number | null | Promise<number | null>;

function isPositiveCents(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Spoken wins; mapped SKU uses catalog cents; otherwise exact rate-card;
 * otherwise blank. Never uses trade defaults or an LLM price field.
 */
export function attachOneVoicePrice(
  line: BuiltVoiceLine,
  rateCardCents: number | null,
): { unitPriceCents: number | null; priceSource: PriceSource } {
  if (isPositiveCents(line.spokenUnitPriceCents)) {
    return { unitPriceCents: line.spokenUnitPriceCents, priceSource: "spoken" };
  }
  if (line.catalogItemId && isPositiveCents(line.catalogUnitPriceCents)) {
    return { unitPriceCents: line.catalogUnitPriceCents, priceSource: "catalog" };
  }
  if (isPositiveCents(rateCardCents)) {
    return { unitPriceCents: rateCardCents, priceSource: "learned" };
  }
  return { unitPriceCents: null, priceSource: "unknown" };
}

export function voiceLineNeedsRateCard(line: BuiltVoiceLine): boolean {
  if (isPositiveCents(line.spokenUnitPriceCents)) {
    return false;
  }
  if (line.catalogItemId && isPositiveCents(line.catalogUnitPriceCents)) {
    return false;
  }
  return parseCatalogUnit(line.unit) !== null;
}

export async function lookupExactRateCardCents(
  queryFn: RateCardQueryFn,
  args: { contractorId: string; name: string; unit: string; trade: string | null },
): Promise<number | null> {
  const unit = parseCatalogUnit(args.unit);
  if (!unit) {
    return null;
  }

  const tryLookup = async (trade: string | null): Promise<number | null> => {
    const outcome = await lookupRateCardEntry(queryFn, {
      contractorId: args.contractorId,
      query: trade ? { name: args.name, unit, trade } : { name: args.name, unit },
    });
    if (outcome.status !== 200 || outcome.json.entry == null) {
      return null;
    }
    const cents = outcome.json.entry.unitPriceCents;
    return isPositiveCents(cents) ? cents : null;
  };

  const withTrade = await tryLookup(args.trade);
  if (withTrade != null) {
    return withTrade;
  }
  if (args.trade) {
    return tryLookup(null);
  }
  return null;
}

export async function attachVoiceLinePrices(
  lines: BuiltVoiceLine[],
  lookupRateCard: RateCardCentsLookup,
  trade: string | null = null,
): Promise<ValidatedLineItem[]> {
  const priced: ValidatedLineItem[] = [];
  for (const line of lines) {
    let rateCardCents: number | null = null;
    if (voiceLineNeedsRateCard(line) && line.unit) {
      rateCardCents = (await lookupRateCard({
        name: line.name,
        unit: line.unit,
        trade,
      })) ?? null;
    }
    const attached = attachOneVoicePrice(line, rateCardCents);
    priced.push({
      catalogItemId: line.catalogItemId,
      name: line.name,
      quantity: line.quantity,
      unit: line.unit,
      unitPriceCents: attached.unitPriceCents,
      priceSource: attached.priceSource,
      confidence: line.confidence,
    });
  }
  return priced;
}

export function snapshotUnitPriceCents(unitPriceCents: number | null): number {
  return unitPriceCents == null ? 0 : unitPriceCents;
}

export function totalCentsFromPricedLines(
  lines: Array<{ quantity: number; unitPriceCents: number | null }>,
): number {
  return lines.reduce(
    (sum, item) => sum + item.quantity * snapshotUnitPriceCents(item.unitPriceCents),
    0,
  );
}
