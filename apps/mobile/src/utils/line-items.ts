import { parseCatalogUnit } from '../catalog/units';
import { parsePriceSource, typedPriceSource, type PriceSource } from './price-source';

export interface LineItem {
  catalogItemId: string;
  name: string;
  quantity: number;
  unitPriceCents: number | null;
  unit?: string | null;
  confidence?: number; // 0-1 from AI pipeline; undefined for manual items
  /** Contractor-only. Never copy into a customer PDF/SMS payload. */
  privateNote?: string | null;
  /** Snapshot provenance: spoken | catalog | learned | computed | unknown | known. */
  priceSource?: PriceSource;
}

const UNIT_SHORT: Record<string, string> = {
  each: 'ea',
  hour: 'h',
  foot: 'ft',
  sqft: 'sq ft',
  job: 'job',
};

export function isUnknownUnitPrice(cents: number | null | undefined): boolean {
  return cents == null || cents === 0;
}

export function formatUnitPriceLabel(cents: number | null | undefined): string {
  if (cents == null || cents === 0) {
    return 'Price needed';
  }
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatQuantityLabel(quantity: number, unit?: string | null): string {
  const parsed = unit ? parseCatalogUnit(unit) : null;
  if (!parsed) {
    return String(quantity);
  }
  return `${quantity} ${UNIT_SHORT[parsed]}`;
}

function coerceLineItem(value: unknown): LineItem {
  const raw =
    value !== null && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const unitPrice = raw.unitPriceCents;
  const line: LineItem = {
    catalogItemId: typeof raw.catalogItemId === 'string' ? raw.catalogItemId : '',
    name: typeof raw.name === 'string' ? raw.name : '',
    quantity: Number.isInteger(raw.quantity) && (raw.quantity as number) >= 1
      ? (raw.quantity as number)
      : 1,
    unitPriceCents:
      unitPrice === null
        ? null
        : Number.isInteger(unitPrice) && (unitPrice as number) >= 0
          ? (unitPrice as number)
          : 0,
  };
  if (typeof raw.unit === 'string' && raw.unit !== '') {
    line.unit = parseCatalogUnit(raw.unit) ?? raw.unit;
  }
  if (typeof raw.confidence === 'number') {
    line.confidence = raw.confidence;
  }
  if (typeof raw.privateNote === 'string' && raw.privateNote.trim() !== '') {
    line.privateNote = raw.privateNote.trim();
  }
  const priceSource = parsePriceSource(raw.priceSource);
  if (priceSource) {
    line.priceSource = priceSource;
  }
  return line;
}

export function parseLineItems(json: string): LineItem[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(coerceLineItem) : [];
  } catch {
    return [];
  }
}

export function addItem(
  items: LineItem[],
  catalogItem: { id: string; name: string; unitPriceCents: number; unit?: string },
): LineItem[] {
  return [
    ...items,
    {
      catalogItemId: catalogItem.id,
      name: catalogItem.name,
      quantity: 1,
      unitPriceCents: catalogItem.unitPriceCents,
      priceSource: 'catalog',
      ...(catalogItem.unit ? { unit: catalogItem.unit } : {}),
    },
  ];
}

export function removeItem(items: LineItem[], index: number): LineItem[] {
  return items.filter((_, i) => i !== index);
}

export function updateQuantity(
  items: LineItem[],
  index: number,
  delta: number,
): LineItem[] {
  return items.map((item, i) =>
    i === index
      ? { ...item, quantity: Math.max(1, item.quantity + delta), confidence: undefined }
      : item,
  );
}

export function updatePrice(
  items: LineItem[],
  index: number,
  newPriceCents: number,
): LineItem[] {
  return items.map((item, i) =>
    i === index
      ? {
          ...item,
          unitPriceCents: newPriceCents,
          confidence: undefined,
          priceSource: typedPriceSource(newPriceCents),
        }
      : item,
  );
}

export function updatePrivateNote(
  items: LineItem[],
  index: number,
  privateNote: string | null,
): LineItem[] {
  return items.map((item, i) => {
    if (i !== index) return item;
    const next = { ...item };
    if (privateNote == null || privateNote.trim() === '') {
      delete next.privateNote;
    } else {
      next.privateNote = privateNote.trim();
    }
    return next;
  });
}

export function recalculateTotal(items: LineItem[]): number {
  return items.reduce(
    (sum, item) => sum + item.quantity * (item.unitPriceCents ?? 0),
    0,
  );
}

export function serializeLineItems(items: LineItem[]): string {
  return JSON.stringify(items);
}
