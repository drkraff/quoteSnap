import { parseCatalogUnit } from '../catalog/units';
import {
  lineContributesToTotal,
  newOptionGroupId,
  parseOptionGroupId,
  parseOptionRole,
  type OptionRole,
} from '../quotes/option-groups';
import { parseRoomId } from '../quotes/rooms';
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
  /** Shared UUID for a thin base+alternate pair. */
  optionGroupId?: string;
  /** base = in the quote total; alt = visible, excluded from total. */
  optionRole?: OptionRole;
  /** Optional room/zone. Undefined = ungrouped / default single-memo. */
  roomId?: string;
  /** Client-stable id so photos can attach across edits. */
  clientId?: string;
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
    return Array.isArray(parsed) ? parsed.map(coerceLineItem) : [];
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
  const base = items[baseIndex];
  if (!base) {
    return items;
  }
  if (base.optionGroupId) {
    return items;
  }
  const name = alternate.name.trim();
  if (name === '') {
    return items;
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
  const next = items.map((item, i) =>
    i === baseIndex
      ? { ...item, optionGroupId: groupId, optionRole: 'base' as const }
      : item,
  );
  next.splice(baseIndex + 1, 0, altLine);
  return next;
}

/** Make this line the selected (base) option; its partner becomes alt. */
export function selectOptionForTotal(items: LineItem[], index: number): LineItem[] {
  const chosen = items[index];
  if (!chosen?.optionGroupId || chosen.optionRole === 'base') {
    return items;
  }
  const groupId = chosen.optionGroupId;
  return items.map((item, i) => {
    if (item.optionGroupId !== groupId) {
      return item;
    }
    return {
      ...item,
      optionRole: i === index ? 'base' : 'alt',
    };
  });
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
  return items.reduce((sum, item) => {
    if (!lineContributesToTotal(item)) {
      return sum;
    }
    return sum + item.quantity * (item.unitPriceCents ?? 0);
  }, 0);
}

export function serializeLineItems(items: LineItem[]): string {
  return JSON.stringify(items);
}
