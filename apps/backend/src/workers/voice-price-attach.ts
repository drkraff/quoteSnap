import { parseCatalogUnit } from "../catalog/units.js";
import { lookupRateCardEntry, type RateCardQueryFn } from "../rate-card/upsert.js";
import type { BuiltVoiceLine, PriceSource, ValidatedLineItem } from "./voice-validation.js";

export type RateCardCentsLookup = (args: {
  name: string;
  unit: string;
  trade: string | null;
}) => number | null | Promise<number | null>;

export const SYNTHESIZED_LABOR_NAME = "Labor";

function isPositiveCents(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** Signup markup is 0–100 inclusive. Null/invalid means do not compute a material sell price. */
export function parseSignupMarkupPercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    return null;
  }
  return value;
}

/**
 * Sell cents from a known material cost and signup markup %. Integer cents,
 * rounded. Markup 0 is a real rate (sell = cost). Does not invent a cost.
 */
export function computeMaterialSellCents(
  costCents: number,
  markupPercent: number,
): number | null {
  if (!isPositiveCents(costCents)) {
    return null;
  }
  if (!Number.isInteger(markupPercent) || markupPercent < 0 || markupPercent > 100) {
    return null;
  }
  const sell = Math.round(costCents * (1 + markupPercent / 100));
  return sell > 0 ? sell : null;
}

export function parseSpokenHours(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
}

/** Labor is an hour-unit line. Material cost × markup is never applied to hour lines. */
export function isLaborVoiceLine(line: { unit: string | null }): boolean {
  return parseCatalogUnit(line.unit) === "hour";
}

/**
 * If the contractor spoke job hours and no hour-unit line exists, add a Labor
 * line so attach can fill hours × hourly. Does not invent a price.
 */
export function ensureLaborLineFromSpokenHours(
  lines: BuiltVoiceLine[],
  spokenHours: number | null,
): BuiltVoiceLine[] {
  const hours = parseSpokenHours(spokenHours);
  if (hours == null) {
    return lines;
  }
  if (lines.some(isLaborVoiceLine)) {
    return lines;
  }
  return [
    ...lines,
    {
      catalogItemId: null,
      name: SYNTHESIZED_LABOR_NAME,
      quantity: hours,
      unit: "hour",
      spokenUnitPriceCents: null,
      spokenMaterialCostCents: null,
      catalogUnitPriceCents: null,
      confidence: 0.8,
      roomName: null,
    },
  ];
}

/**
 * Spoken sell wins; mapped SKU uses catalog cents; otherwise exact rate-card;
 * otherwise labor = hours × signup hourly (unit price = hourly cents);
 * otherwise material = spoken/typed cost × (1 + signup markup/100);
 * otherwise blank. Never uses trade defaults or an LLM price field.
 * Markup without a cost does not invent a SKU price. Cost without markup
 * is not treated as a sell price.
 */
export function attachOneVoicePrice(
  line: BuiltVoiceLine,
  rateCardCents: number | null,
  hourlyRateCents: number | null = null,
  markupPercent: number | null = null,
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
  if (isLaborVoiceLine(line) && isPositiveCents(hourlyRateCents)) {
    return { unitPriceCents: hourlyRateCents, priceSource: "computed" };
  }
  if (!isLaborVoiceLine(line)) {
    const markup = parseSignupMarkupPercent(markupPercent);
    if (markup != null && isPositiveCents(line.spokenMaterialCostCents)) {
      const sell = computeMaterialSellCents(line.spokenMaterialCostCents, markup);
      if (sell != null) {
        return { unitPriceCents: sell, priceSource: "computed" };
      }
    }
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
  hourlyRateCents: number | null = null,
  markupPercent: number | null = null,
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
    const attached = attachOneVoicePrice(
      line,
      rateCardCents,
      hourlyRateCents,
      markupPercent,
    );
    priced.push({
      catalogItemId: line.catalogItemId,
      name: line.name,
      quantity: line.quantity,
      unit: line.unit,
      unitPriceCents: attached.unitPriceCents,
      priceSource: attached.priceSource,
      confidence: line.confidence,
      roomName: line.roomName,
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
