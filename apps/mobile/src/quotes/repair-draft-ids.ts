/**
 * Voice drafts can store a non-UUID catalogItemId (`""` or `line-0`) and
 * reuse a placeholder client id. The server rejects anything that is not a
 * UUID or null. Repair keeps every line, price, and price source, and is
 * safe to run again.
 */

import { parseLineItems, serializeLineItems, type LineItem } from '../utils/line-items';
import { normalizePrivateNote } from './private-notes';
import { newRoomId, parseRoomId } from './rooms';

export function catalogItemIdForSync(value: string | null | undefined): string | null {
  return parseRoomId(value) ?? null;
}

function freshId(newId: () => string, used: Set<string>): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = newId();
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
  const id = newId();
  used.add(id);
  return id;
}

export function repairDraftLineItems(
  items: LineItem[],
  newId: () => string = newRoomId,
): { items: LineItem[]; changed: boolean } {
  const used = new Set<string>();
  let changed = false;
  const next = items.map((item) => {
    const catalogItemId = parseRoomId(item.catalogItemId) ?? '';
    if (catalogItemId !== item.catalogItemId) {
      changed = true;
    }
    let clientId = parseRoomId(item.clientId);
    if (!clientId || used.has(clientId)) {
      clientId = freshId(newId, used);
      changed = true;
    } else {
      used.add(clientId);
    }
    const roomId = item.roomId && parseRoomId(item.roomId) ? item.roomId : undefined;
    if (roomId !== item.roomId && !(roomId == null && item.roomId == null)) {
      changed = true;
    }
    if (
      catalogItemId === item.catalogItemId
      && clientId === item.clientId
      && roomId === item.roomId
    ) {
      return item;
    }
    const repaired: LineItem = { ...item, catalogItemId, clientId };
    if (roomId) {
      repaired.roomId = roomId;
    } else {
      delete repaired.roomId;
    }
    return repaired;
  });
  return { items: next, changed };
}

export function repairDraftLineItemsJson(
  json: string,
  newId: () => string = newRoomId,
): { json: string; items: LineItem[]; changed: boolean } {
  const repaired = repairDraftLineItems(parseLineItems(json), newId);
  return {
    json: repaired.changed ? serializeLineItems(repaired.items) : json,
    items: repaired.items,
    changed: repaired.changed,
  };
}

export type QuotePutLine = {
  name: string;
  quantity: number;
  unitPriceCents: number | null;
  catalogItemId: string | null;
  unit?: string | null;
  privateNote?: string | null;
  priceSource?: string | null;
  optionGroupId?: string | null;
  optionRole?: string | null;
  roomId?: string | null;
  clientId?: string | null;
};

/** Body for PUT /quotes. Non-UUID catalog ids become null. Prices are not rewritten. */
export function lineItemsForQuotePut(items: readonly LineItem[]): QuotePutLine[] {
  return items.map((item) => {
    const line: QuotePutLine = {
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      catalogItemId: catalogItemIdForSync(item.catalogItemId),
    };
    if (item.unit) {
      line.unit = item.unit;
    }
    if (item.privateNote !== undefined) {
      line.privateNote = normalizePrivateNote(item.privateNote);
    }
    if (item.priceSource) {
      line.priceSource = item.priceSource;
    }
    if (item.optionGroupId && item.optionRole) {
      line.optionGroupId = item.optionGroupId;
      line.optionRole = item.optionRole;
    }
    const roomId = parseRoomId(item.roomId);
    if (roomId) {
      line.roomId = roomId;
    }
    const clientId = parseRoomId(item.clientId);
    if (clientId) {
      line.clientId = clientId;
    }
    return line;
  });
}
