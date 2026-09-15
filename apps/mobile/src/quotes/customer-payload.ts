/**
 * Phase 6 SMS / PDF / approval page MUST serialize through this allowlist.
 * Do not spread a Quote / LineItem / contractor GET body — those include
 * privateNote for hydrate and draft sync.
 *
 * Client-facing scope (clientSentence) is on the allowlist. Empty / whitespace
 * becomes null — never a placeholder that invents job scope. Private notes
 * are a different object (design #9) and must never be copied here.
 */

import { normalizeClientSentence } from './client-sentence';
import { normalizePrivateNote } from './private-notes';

export type CustomerLineItemPayload = {
  name: string;
  quantity: number;
  unitPriceCents: number | null;
  unit: string | null;
  roomName: string | null;
};

export type CustomerQuotePayload = {
  customerPhone: string | null;
  totalCents: number;
  clientSentence: string | null;
  lineItems: CustomerLineItemPayload[];
};

const CUSTOMER_QUOTE_KEYS = ['customerPhone', 'totalCents', 'clientSentence', 'lineItems'] as const;
const CUSTOMER_LINE_KEYS = ['name', 'quantity', 'unitPriceCents', 'unit', 'roomName'] as const;

export type CustomerQuoteSource = {
  customerPhone: string | null;
  totalCents: number;
  clientSentence?: string | null;
  privateNote?: string | null;
  notes?: string | null;
  lineItems: {
    name: string;
    quantity: number;
    unitPriceCents: number | null;
    unit?: string | null;
    privateNote?: string | null;
    notes?: string | null;
    priceSource?: string | null;
    optionGroupId?: string | null;
    optionRole?: string | null;
    roomId?: string | null;
    roomName?: string | null;
  }[];
  rooms?: { id: string; name: string; privateNote?: string | null }[];
  photos?: { id: string; clientId?: string; localUri?: string; r2Key?: string }[];
};

export function toCustomerQuotePayload(source: CustomerQuoteSource): CustomerQuotePayload {
  return {
    customerPhone: source.customerPhone,
    totalCents: source.totalCents,
    clientSentence: normalizeClientSentence(source.clientSentence),
    lineItems: source.lineItems
      .filter((item) => item.optionRole !== 'alt')
      .map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        unit: item.unit ?? null,
        roomName:
          item.roomName
          ?? source.rooms?.find((room) => room.id === item.roomId)?.name
          ?? null,
      })),
  };
}

export function customerQuotePayloadKeys(): readonly string[] {
  return CUSTOMER_QUOTE_KEYS;
}

export function customerLinePayloadKeys(): readonly string[] {
  return CUSTOMER_LINE_KEYS;
}

const PRIVATE_NOTE_KEY_RE = /private[_]?note|internal[_]?note/i;

export function customerPayloadHasPrivateNoteKey(payload: unknown): boolean {
  if (payload === null || typeof payload !== 'object') {
    return false;
  }
  if (Array.isArray(payload)) {
    return payload.some(customerPayloadHasPrivateNoteKey);
  }
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (PRIVATE_NOTE_KEY_RE.test(key)) {
      return true;
    }
    if (customerPayloadHasPrivateNoteKey(value)) {
      return true;
    }
  }
  return false;
}

/** Contractor PUT/sync may include private notes. Never use this for PDF/SMS. */
export function toContractorLineItemSync(item: {
  name: string;
  quantity: number;
  unitPriceCents: number | null;
  unit?: string | null;
  privateNote?: string | null;
  priceSource?: string | null;
  optionGroupId?: string | null;
  optionRole?: string | null;
  roomId?: string | null;
  clientId?: string | null;
}): {
  name: string;
  quantity: number;
  unitPriceCents: number;
  unit: string | null;
  privateNote: string | null;
  priceSource?: string;
  optionGroupId?: string;
  optionRole?: string;
  roomId?: string | null;
  clientId?: string | null;
} {
  return {
    name: item.name,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents ?? 0,
    unit: item.unit ?? null,
    privateNote: normalizePrivateNote(item.privateNote),
    ...(item.priceSource ? { priceSource: item.priceSource } : {}),
    ...(item.optionGroupId && item.optionRole
      ? { optionGroupId: item.optionGroupId, optionRole: item.optionRole }
      : {}),
    ...(item.roomId ? { roomId: item.roomId } : {}),
    ...(item.clientId ? { clientId: item.clientId } : {}),
  };
}
