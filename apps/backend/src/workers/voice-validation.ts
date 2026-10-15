import { parseCatalogUnit, type CatalogUnit } from "../catalog/units.js";
import { displayRateCardName } from "../rate-card/normalize.js";
import {
  isStorableHours,
  isStorableNonNegativeCents,
  isStorableQuantity,
  POSTGRES_INTEGER_MAX,
} from "../quotes/integer-money.js";
import type { AILineItem } from "../types/voice.js";
import { normalizeRoomName } from "../quotes/rooms.js";
import {
  attachOneVoicePrice,
  attachVoiceLinePrices,
  ensureLaborLineFromSpokenHours,
  parseSpokenHours,
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

export type PriceSource = "spoken" | "catalog" | "learned" | "computed" | "unknown";

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
  spokenMaterialCostCents: number | null;
  catalogUnitPriceCents: number | null;
  confidence: number;
  roomName: string | null;
}

export interface ValidatedLineItem {
  catalogItemId: string | null;
  name: string;
  quantity: number;
  unit: string | null;
  unitPriceCents: number | null;
  priceSource: PriceSource;
  confidence: number;
  roomName: string | null;
}

export function parseSpokenUnitPriceCents(value: unknown): number | null {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    return null;
  }
  if ((value as number) > POSTGRES_INTEGER_MAX) {
    return null;
  }
  return value as number;
}

function parseVoiceQuantity(value: unknown, unit: string | null): number {
  if (parseCatalogUnit(unit) === "hour" && isStorableHours(value)) {
    return value;
  }
  if (isStorableQuantity(value)) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    const rounded = Math.round(value);
    if (isStorableQuantity(rounded)) {
      return rounded;
    }
  }
  return 1;
}

/**
 * A line whose extension, or the running total after it, cannot fit in
 * `integer` is stored blank/`unknown`. Earlier lines stay. No smaller price
 * is invented.
 */
function fitVoiceLinesToIntegerColumns(lineItems: ValidatedLineItem[]): {
  lineItems: ValidatedLineItem[];
  totalCents: number;
} {
  let total = 0;
  const fitted = lineItems.map((line) => {
    const price = line.unitPriceCents;
    if (price == null) {
      return line;
    }
    const extension = Math.round(line.quantity * price);
    const next = total + extension;
    if (
      !isStorableNonNegativeCents(price) ||
      !Number.isSafeInteger(extension) ||
      extension > POSTGRES_INTEGER_MAX ||
      !Number.isSafeInteger(next) ||
      next > POSTGRES_INTEGER_MAX
    ) {
      return { ...line, unitPriceCents: null, priceSource: "unknown" as const };
    }
    total = next;
    return line;
  });
  return { lineItems: fitted, totalCents: total };
}

function parseVoiceConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * The transcript named a length in feet or ft and did not say square.
 * "sq ft" / "sqft" / "square feet" are area, so this stays false.
 */
export function transcriptSaysLinearFeet(transcript: string | null | undefined): boolean {
  if (typeof transcript !== "string" || transcript.trim() === "") {
    return false;
  }
  const lower = transcript.toLowerCase();
  if (/\bsquare\b|\bsq\.?\s*ft\b|\bsqft\b|\bsq\s*feet\b/.test(lower)) {
    return false;
  }
  return /\b(?:linear\s+)?(?:feet|foot)\b|\bft\b|\d\s*ft\b/.test(lower);
}

/**
 * Spoken feet stay feet. An unmatched sqft line becomes foot when the
 * transcript said feet and not square. A square-foot catalog row does not
 * replace a spoken foot unit, or a linear-feet line the model also called sqft.
 */
export function resolveVoiceUnit(
  spokenUnit: CatalogUnit | null,
  catalogUnit: CatalogUnit | null,
  linearFeet: boolean,
): CatalogUnit | null {
  if (spokenUnit === "foot" && catalogUnit === "sqft") {
    return "foot";
  }
  const spokenIsLength = spokenUnit === "foot" || spokenUnit === "sqft";
  if (linearFeet) {
    if (catalogUnit == null && spokenIsLength) {
      return "foot";
    }
    if (catalogUnit === "sqft" && (spokenIsLength || spokenUnit == null)) {
      return "foot";
    }
  }
  return catalogUnit ?? spokenUnit;
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
  transcript?: string | null,
): BuiltVoiceLine[] {
  const linearFeet = transcriptSaysLinearFeet(transcript);
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
    const unit = resolveVoiceUnit(spokenUnit, catalogUnit, linearFeet);

    lines.push({
      catalogItemId: catalogId,
      name,
      quantity: parseVoiceQuantity(item.quantity, unit),
      unit,
      spokenUnitPriceCents: parseSpokenUnitPriceCents(item.spokenUnitPriceCents),
      spokenMaterialCostCents: parseSpokenUnitPriceCents(item.spokenMaterialCostCents),
      catalogUnitPriceCents: catalogItem?.unit_price_cents ?? null,
      confidence: parseVoiceConfidence(item.confidence),
      roomName: normalizeRoomName(item.room),
    });
  }
  return lines;
}

function finalizeLine(
  line: BuiltVoiceLine,
  rateCardCents: number | null,
  hourlyRateCents: number | null,
  markupPercent: number | null,
): ValidatedLineItem {
  const attached = attachOneVoicePrice(
    line,
    rateCardCents,
    hourlyRateCents,
    markupPercent,
  );
  return {
    catalogItemId: line.catalogItemId,
    name: line.name,
    quantity: line.quantity,
    unit: line.unit,
    unitPriceCents: attached.unitPriceCents,
    priceSource: attached.priceSource,
    confidence: line.confidence,
    roomName: line.roomName,
  };
}

/**
 * Filters AI-returned items to catalog SKUs or adhoc spoken lines,
 * then attaches prices: spoken sell → catalog (mapped SKU) → exact rate-card →
 * computed labor (hours × hourly) → computed material (cost × markup) → blank.
 * Optional sync lookup so unit tests can inject learned cents without I/O.
 */
export function validateAndBuildLineItems(
  aiItems: AILineItem[],
  validCatalogItems: CatalogItemRow[],
  options?: {
    lookupRateCard?: RateCardCentsLookup;
    trade?: string | null;
    hourlyRateCents?: number | null;
    markupPercent?: number | null;
    spokenHours?: number | null;
    transcript?: string | null;
  },
): { lineItems: ValidatedLineItem[]; totalCents: number } {
  const built = ensureLaborLineFromSpokenHours(
    buildVoiceLineItems(aiItems, validCatalogItems, options?.transcript),
    options?.spokenHours ?? null,
  );
  const lookup = options?.lookupRateCard;
  const trade = options?.trade ?? null;
  const hourlyRateCents = options?.hourlyRateCents ?? null;
  const markupPercent = options?.markupPercent ?? null;

  const lineItems = built.map((line) => {
    let rateCardCents: number | null = null;
    if (lookup && voiceLineNeedsRateCard(line) && line.unit) {
      const result = lookup({ name: line.name, unit: line.unit, trade });
      if (typeof result === "number") {
        rateCardCents = result;
      }
    }
    return finalizeLine(line, rateCardCents, hourlyRateCents, markupPercent);
  });

  return fitVoiceLinesToIntegerColumns(lineItems);
}

export async function validateAndBuildLineItemsAsync(
  aiItems: AILineItem[],
  validCatalogItems: CatalogItemRow[],
  options?: {
    lookupRateCard?: RateCardCentsLookup;
    trade?: string | null;
    hourlyRateCents?: number | null;
    markupPercent?: number | null;
    spokenHours?: number | null;
    transcript?: string | null;
  },
): Promise<{ lineItems: ValidatedLineItem[]; totalCents: number }> {
  const built = ensureLaborLineFromSpokenHours(
    buildVoiceLineItems(aiItems, validCatalogItems, options?.transcript),
    options?.spokenHours ?? null,
  );
  const lookup = options?.lookupRateCard ?? (() => null);
  const lineItems = await attachVoiceLinePrices(
    built,
    lookup,
    options?.trade ?? null,
    options?.hourlyRateCents ?? null,
    options?.markupPercent ?? null,
  );
  return fitVoiceLinesToIntegerColumns(lineItems);
}

export { attachOneVoicePrice, attachVoiceLinePrices, parseSpokenHours };
