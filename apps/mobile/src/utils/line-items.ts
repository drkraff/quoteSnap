import { customerUnitLabel, parseCatalogUnit } from '../catalog/units';
import {
  newOptionGroupId,
  parseOptionGroupId,
  parseOptionRole,
  sanitizeOptionGroups,
  selectOptionForTotal as selectOptionRoleForTotal,
  selectedOptionTotalCents,
  lineAmountCents,
  type OptionRole,
} from '../quotes/option-groups';
import { normalizePrivateNote } from '../quotes/private-notes';
import { parseRoomId } from '../quotes/rooms';
import { formatMoneyCents as formatCurrencyCents, type CurrencyCode } from '../money/currency';
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
  /** Spoken/typed material cost (cents). Input to cost × markup — not a sell price. */
  materialCostCents?: number | null;
  /** Shared UUID for a thin base+alternate pair. */
  optionGroupId?: string;
  /** base = in the quote total; alt = visible, excluded from total. */
  optionRole?: OptionRole;
  /** Optional room/zone. Undefined = ungrouped / default single-memo. */
  roomId?: string;
  /** Client-stable id so photos can attach across edits. */
  clientId?: string;
}

export function isUnknownUnitPrice(cents: number | null | undefined): boolean {
  return cents == null || cents === 0;
}

export function formatUnitPriceLabel(
  cents: number | null | undefined,
  currency: CurrencyCode = 'ILS',
): string {
  if (cents == null || cents === 0) {
    return 'Price needed';
  }
  return formatCurrencyCents(cents, currency);
}

export function formatQuantityLabel(quantity: number, unit?: string | null): string {
  const label = customerUnitLabel(unit);
  if (!label) {
    return String(quantity);
  }
  return `${quantity} ${label}`;
}

/** Half an hour is 0.5. There is no one-hour minimum. Missing or invalid stays 1. */
function coerceQuantity(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
    return 1;
  }
  const scaled = Math.round(n * 100) / 100;
  return scaled > 0 ? scaled : 1;
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
    quantity: coerceQuantity(raw.quantity),
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
  if (Object.prototype.hasOwnProperty.call(raw, 'privateNote')) {
    const rawNote = raw.privateNote;
    line.privateNote = normalizePrivateNote(
      rawNote === null || typeof rawNote === 'string' ? rawNote : undefined,
    );
  }
  const priceSource = parsePriceSource(raw.priceSource);
  if (priceSource) {
    line.priceSource = priceSource;
  }
  const materialCost = raw.materialCostCents;
  if (Number.isInteger(materialCost) && (materialCost as number) > 0) {
    line.materialCostCents = materialCost as number;
  }
  const optionGroupId = parseOptionGroupId(raw.optionGroupId);
  const optionRole = parseOptionRole(raw.optionRole);
  if (optionGroupId && optionRole) {
    line.optionGroupId = optionGroupId;
    line.optionRole = optionRole;
  }
  const roomId = parseRoomId(raw.roomId);
  if (roomId) {
    line.roomId = roomId;
  }
  const clientId = parseRoomId(raw.clientId);
  if (clientId) {
    line.clientId = clientId;
  }
  return line;
}

export function parseLineItems(json: string): LineItem[] {
  try {
    const parsed: unknown = JSON.parse(json);
    const items = Array.isArray(parsed) ? parsed.map(coerceLineItem) : [];
    return sanitizeOptionGroups(items);
  } catch {
    return [];
  }
}

export function addItem(
  items: LineItem[],
  catalogItem: { id: string; name: string; unitPriceCents: number; unit?: string },
  roomId?: string | null,
): LineItem[] {
  const line: LineItem = {
    catalogItemId: catalogItem.id,
    name: catalogItem.name,
    quantity: 1,
    unitPriceCents: catalogItem.unitPriceCents,
    priceSource: 'catalog',
    ...(catalogItem.unit ? { unit: catalogItem.unit } : {}),
  };
  const parsedRoom = parseRoomId(roomId);
  if (parsedRoom) {
    line.roomId = parsedRoom;
  }
  return [...items, line];
}

export function removeItem(items: LineItem[], index: number): LineItem[] {
  const removed = items[index];
  const next = items.filter((_, i) => i !== index);
  if (!removed?.optionGroupId) {
    return next;
  }
  return next.map((item) => {
    if (item.optionGroupId !== removed.optionGroupId) {
      return item;
    }
    const cleared = { ...item };
    delete cleared.optionGroupId;
    delete cleared.optionRole;
    return cleared;
  });
}

/**
 * Add one alternate for an unpaired line. Existing pair is a no-op.
 * Alternate price is whatever the contractor typed or picked — never invented.
 */
export function addAlternate(
  items: LineItem[],
  baseIndex: number,
  alternate: {
    name: string;
    unitPriceCents: number | null;
    catalogItemId?: string;
    unit?: string | null;
    priceSource?: PriceSource;
  },
  groupId: string = newOptionGroupId(),
): LineItem[] {
  const cleaned = sanitizeOptionGroups(items);
  const base = cleaned[baseIndex];
  if (!base) {
    return items;
  }
  if (base.optionGroupId) {
    return cleaned === items ? items : cleaned;
  }
  const name = alternate.name.trim();
  if (name === '') {
    return cleaned === items ? items : cleaned;
  }
  const altLine: LineItem = {
    catalogItemId: alternate.catalogItemId ?? '',
    name,
    quantity: base.quantity,
    unitPriceCents: alternate.unitPriceCents,
    optionGroupId: groupId,
    optionRole: 'alt',
  };
  if (alternate.unit) {
    altLine.unit = alternate.unit;
  } else if (base.unit) {
    altLine.unit = base.unit;
  }
  if (alternate.priceSource) {
    altLine.priceSource = alternate.priceSource;
  }
  if (base.roomId) {
    altLine.roomId = base.roomId;
  }
  const next = cleaned.map((item, i) =>
    i === baseIndex
      ? { ...item, optionGroupId: groupId, optionRole: 'base' as const }
      : item,
  );
  next.splice(baseIndex + 1, 0, altLine);
  return next;
}

/** Make this line the selected (base) option; its partner becomes alt. */
export function selectOptionForTotal(items: LineItem[], index: number): LineItem[] {
  return selectOptionRoleForTotal(items, index);
}

/**
 * Whole quantities do not step below 1. A spoken fraction already under 1
 * (half an hour) stays put instead of being rounded up.
 */
export function nextLineQuantity(current: number, delta: number): number {
  const min = current > 0 && current < 1 ? current : 1;
  const next = current + delta;
  return next < min ? min : next;
}

export function updateQuantity(
  items: LineItem[],
  index: number,
  delta: number,
): LineItem[] {
  return items.map((item, i) =>
    i === index
      ? {
          ...item,
          quantity: nextLineQuantity(item.quantity, delta),
          confidence: undefined,
        }
      : item,
  );
}

export function updatePrice(
  items: LineItem[],
  index: number,
  newPriceCents: number | null,
  extras?: {
    priceSource?: PriceSource;
    materialCostCents?: number | null;
  },
): LineItem[] {
  return items.map((item, i) => {
    if (i !== index) {
      return item;
    }
    const next: LineItem = {
      ...item,
      unitPriceCents: newPriceCents,
      confidence: undefined,
      priceSource: extras?.priceSource ?? typedPriceSource(newPriceCents),
    };
    if (extras && Object.prototype.hasOwnProperty.call(extras, 'materialCostCents')) {
      if (extras.materialCostCents != null && extras.materialCostCents > 0) {
        next.materialCostCents = extras.materialCostCents;
      } else {
        delete next.materialCostCents;
      }
    }
    return next;
  });
}

export function updatePrivateNote(
  items: LineItem[],
  index: number,
  privateNote: string | null,
): LineItem[] {
  if (index < 0 || index >= items.length) return items;
  const note = normalizePrivateNote(privateNote);
  const current = items[index]!;
  if (normalizePrivateNote(current.privateNote) === note) {
    if (note !== null || current.privateNote == null) return items;
  }
  return items.map((item, i) => {
    if (i !== index) return item;
    return { ...item, privateNote: note };
  });
}

export const UNIT_PRICE_LABEL = 'Unit price';
export const LINE_TOTAL_LABEL = 'Line total';
export const SUBTOTAL_LABEL = 'Subtotal';
export const QUOTE_TOTAL_LABEL = 'Total';
export const ADD_LINE_LABEL = 'Add line';

/** Qty × unit price in cents. Blank or unknown prices contribute 0 — never a guessed dollar. */
export function lineTotalCents(item: {
  quantity?: number | null;
  unitPriceCents?: number | null;
}): number {
  return lineAmountCents(item);
}

export function formatMoneyCents(
  cents: number | null | undefined,
  currency: CurrencyCode = 'ILS',
): string {
  return formatCurrencyCents(cents, currency);
}

/** "2 ea × ₪30.00" so the unit price is not read as the line total. */
export function formatQtyTimesUnitPrice(
  quantity: number,
  unitPriceCents: number | null | undefined,
  unit?: string | null,
  currency: CurrencyCode = 'ILS',
): string {
  return `${formatQuantityLabel(quantity, unit)} × ${formatUnitPriceLabel(unitPriceCents, currency)}`;
}

/** Typed quantity. Fractions (half an hour) stay. Empty, zero, or junk is null. */
export function parseLineQuantityInput(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  const scaled = Math.round(n * 100) / 100;
  return scaled > 0 ? scaled : null;
}

export function setLineQuantity(
  items: LineItem[],
  index: number,
  quantity: number,
): LineItem[] {
  if (index < 0 || index >= items.length) return items;
  if (!Number.isFinite(quantity) || quantity <= 0) return items;
  const scaled = Math.round(quantity * 100) / 100;
  if (scaled <= 0) return items;
  const current = items[index];
  if (!current || current.quantity === scaled) return items;
  return items.map((item, i) =>
    i === index ? { ...item, quantity: scaled, confidence: undefined } : item,
  );
}

export function updateLineName(items: LineItem[], index: number, name: string): LineItem[] {
  if (index < 0 || index >= items.length) return items;
  const trimmed = name.trim();
  if (trimmed === '') return items;
  const current = items[index];
  if (!current || current.name === trimmed) return items;
  return items.map((item, i) => (i === index ? { ...item, name: trimmed } : item));
}

export type FreeTextLineInput = {
  name: string;
  quantity?: number;
  unit?: string | null;
  unitPriceCents?: number | null;
  clientId?: string;
};

/**
 * A typed line with no catalog row. Blank name is a no-op.
 * Missing price stays blank (`unknown`) — never a guessed dollar.
 */
export function addFreeTextLine(
  items: LineItem[],
  input: FreeTextLineInput,
  roomId?: string | null,
): LineItem[] {
  const name = input.name.trim();
  if (name === '') return items;
  const parsedQty =
    typeof input.quantity === 'number' ? parseLineQuantityInput(String(input.quantity)) : null;
  const cents = input.unitPriceCents;
  const unitPriceCents =
    cents == null || !Number.isInteger(cents) || cents <= 0 ? null : cents;
  const line: LineItem = {
    catalogItemId: '',
    name,
    quantity: parsedQty ?? 1,
    unitPriceCents,
    priceSource: unitPriceCents == null ? 'unknown' : 'known',
  };
  const unit = input.unit ? parseCatalogUnit(input.unit) : null;
  if (unit) line.unit = unit;
  const clientId = parseRoomId(input.clientId);
  if (clientId) line.clientId = clientId;
  const parsedRoom = parseRoomId(roomId);
  if (parsedRoom) line.roomId = parsedRoom;
  return [...items, line];
}

export function recalculateTotal(items: LineItem[]): number {
  return selectedOptionTotalCents(items);
}

export function serializeLineItems(items: LineItem[]): string {
  return JSON.stringify(items);
}
