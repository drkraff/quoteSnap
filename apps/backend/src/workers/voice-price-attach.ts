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

export function parseSpokenHours(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
}

/** Labor is an hour-unit line. Materials/SKUs with other units are never computed. */
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
      catalogUnitPriceCents: null,
      confidence: 0.8,
      roomName: null,
    },
  ];
}

/**
 * Spoken wins; mapped SKU uses catalog cents; otherwise exact rate-card;
 * otherwise labor = hours × signup hourly (unit price = hourly cents);
 * otherwise blank. Never uses trade defaults or an LLM price field.
 */
export function attachOneVoicePrice(
  line: BuiltVoiceLine,
  rateCardCents: number | null,
  hourlyRateCents: number | null = null,
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
    const attached = attachOneVoicePrice(line, rateCardCents, hourlyRateCents);
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
