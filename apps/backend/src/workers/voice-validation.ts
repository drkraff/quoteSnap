import { parseCatalogUnit } from "../catalog/units.js";
import { displayRateCardName } from "../rate-card/normalize.js";
import type { AILineItem } from "../types/voice.js";
import {
  attachOneVoicePrice,
  attachVoiceLinePrices,
  totalCentsFromPricedLines,
  voiceLineNeedsRateCard,
  type RateCardCentsLookup,
} from "./voice-price-attach.js";

export type CatalogItemRow = {
  id: string;
  name: string;
  unit_price_cents: number;
  unit?: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PriceSource = "spoken" | "catalog" | "learned" | "unknown";

/**
 * Drop AI-invented non-UUID catalog IDs before they are bound to
 * `id = ANY($n::uuid[])`. Invalid values crash Postgres instead of filtering.
 */
export function filterUuidCatalogIds(ids: string[]): string[] {
  return ids.filter((id) => UUID_RE.test(id));
}

export interface BuiltVoiceLine {
  catalogItemId: string | null;
  name: string;
  quantity: number;
  unit: string | null;
  spokenUnitPriceCents: number | null;
  catalogUnitPriceCents: number | null;
  confidence: number;
}

export interface ValidatedLineItem {
  catalogItemId: string | null;
  name: string;
  quantity: number;
  unit: string | null;
  unitPriceCents: number | null;
  priceSource: PriceSource;
  confidence: number;
}

export function parseSpokenUnitPriceCents(value: unknown): number | null {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    return null;
  }
  return value as number;
}

function parseVoiceQuantity(value: unknown): number {
  if (Number.isInteger(value) && (value as number) >= 1) {
    return value as number;
  }
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    return Math.max(1, Math.round(value));
  }
  return 1;
}

function parseVoiceConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function parseVoiceName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return displayRateCardName(value).slice(0, 200);
}

/**
 * Catalog UUID → SKU snapshot (name/unit from catalog).
 * Unknown / missing UUID + a spoken name → adhoc line (catalogItemId null).
 * Drop garbage with neither a catalog match nor a name.
 * Does not attach prices (see attachVoiceLinePrices).
 */
export function buildVoiceLineItems(
  aiItems: AILineItem[],
  validCatalogItems: CatalogItemRow[],
): BuiltVoiceLine[] {
  const validCatalogMap = new Map<string, CatalogItemRow>(
    validCatalogItems.map((item) => [item.id, item]),
  );

  const lines: BuiltVoiceLine[] = [];
  for (const item of aiItems) {
    const catalogId =
      typeof item.catalogItemId === "string" && validCatalogMap.has(item.catalogItemId)
        ? item.catalogItemId
        : null;
    const catalogItem = catalogId ? validCatalogMap.get(catalogId) : undefined;
    const spokenName = parseVoiceName(item.name);
    const name = catalogItem?.name ?? spokenName;
    if (!name) {
      continue;
    }

    const catalogUnit = catalogItem ? parseCatalogUnit(catalogItem.unit) : null;
    const spokenUnit = parseCatalogUnit(item.unit);

    lines.push({
      catalogItemId: catalogId,
      name,
      quantity: parseVoiceQuantity(item.quantity),
      unit: catalogUnit ?? spokenUnit,
      spokenUnitPriceCents: parseSpokenUnitPriceCents(item.spokenUnitPriceCents),
      catalogUnitPriceCents: catalogItem?.unit_price_cents ?? null,
      confidence: parseVoiceConfidence(item.confidence),
    });
  }
  return lines;
}

function finalizeLine(line: BuiltVoiceLine, rateCardCents: number | null): ValidatedLineItem {
  const attached = attachOneVoicePrice(line, rateCardCents);
  return {
    catalogItemId: line.catalogItemId,
    name: line.name,
    quantity: line.quantity,
    unit: line.unit,
    unitPriceCents: attached.unitPriceCents,
    priceSource: attached.priceSource,
    confidence: line.confidence,
  };
}

/**
 * Filters AI-returned items to catalog SKUs or adhoc spoken lines,
 * then attaches prices: spoken → catalog (mapped SKU) → exact rate-card → blank.
 * Optional sync lookup so unit tests can inject learned cents without I/O.
 */
export function validateAndBuildLineItems(
  aiItems: AILineItem[],
  validCatalogItems: CatalogItemRow[],
  options?: {
    lookupRateCard?: RateCardCentsLookup;
    trade?: string | null;
  },
): { lineItems: ValidatedLineItem[]; totalCents: number } {
  const built = buildVoiceLineItems(aiItems, validCatalogItems);
  const lookup = options?.lookupRateCard;
  const trade = options?.trade ?? null;

  const lineItems = built.map((line) => {
    let rateCardCents: number | null = null;
    if (lookup && voiceLineNeedsRateCard(line) && line.unit) {
      const result = lookup({ name: line.name, unit: line.unit, trade });
      if (typeof result === "number") {
        rateCardCents = result;
      }
    }
    return finalizeLine(line, rateCardCents);
  });

  return {
    lineItems,
    totalCents: totalCentsFromPricedLines(lineItems),
  };
}

export async function validateAndBuildLineItemsAsync(
  aiItems: AILineItem[],
  validCatalogItems: CatalogItemRow[],
  options?: {
    lookupRateCard?: RateCardCentsLookup;
    trade?: string | null;
  },
): Promise<{ lineItems: ValidatedLineItem[]; totalCents: number }> {
  const built = buildVoiceLineItems(aiItems, validCatalogItems);
  const lookup = options?.lookupRateCard ?? (() => null);
  const lineItems = await attachVoiceLinePrices(built, lookup, options?.trade ?? null);
  return {
    lineItems,
    totalCents: totalCentsFromPricedLines(lineItems),
  };
}

export { attachOneVoicePrice, attachVoiceLinePrices };
