/**
 * Phase 6 SMS / PDF / approval page MUST serialize through this allowlist.
 * Do not spread QuoteResponse / QuoteRow — those include privateNote for
 * the authenticated contractor API (hydrate + draft sync).
 *
 * Client-facing scope (clientSentence) is on the allowlist. Empty / whitespace
 * becomes null — never a placeholder that invents job scope. Private notes
 * are a different object (design #9) and must never be copied here.
 */

import {
  DEFAULT_CURRENCY,
  DEFAULT_VAT_PERCENT,
  parseCurrencyCode,
  parseVatPercent,
  type CurrencyCode,
} from "../money/currency.js";
import { normalizeClientSentence } from "./client-sentence.js";
import { normalizeCustomerName, normalizeExclusions } from "./customer-fields.js";

export type CustomerLineItemPayload = {
  name: string;
  quantity: number;
  unitPriceCents: number | null;
  unit: string | null;
  /** Customer-facing room/zone label. Null = ungrouped. */
  roomName: string | null;
};

export type CustomerQuotePayload = {
  customerPhone: string | null;
  customerName: string | null;
  totalCents: number;
  clientSentence: string | null;
  exclusions: string | null;
  currencyCode: CurrencyCode;
  /** Null on a snapshot written before VAT was captured. Do not invent 18%. */
  vatPercent: number | null;
  lineItems: CustomerLineItemPayload[];
};

const CUSTOMER_QUOTE_KEYS = [
  "customerPhone",
  "customerName",
  "totalCents",
  "clientSentence",
  "exclusions",
  "currencyCode",
  "vatPercent",
  "lineItems",
] as const;
const CUSTOMER_LINE_KEYS = ["name", "quantity", "unitPriceCents", "unit", "roomName"] as const;

export type CustomerQuoteSource = {
  customerPhone: string | null;
  customerName?: string | null;
  totalCents: number;
  clientSentence?: string | null;
  exclusions?: string | null;
  currencyCode?: string | null;
  vatPercent?: number | null;
  privateNote?: string | null;
  notes?: string | null;
  lineItems: Array<{
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
  }>;
  rooms?: Array<{ id: string; name: string; privateNote?: string | null }>;
  /** Contractor-only stills. Must never be copied into the customer payload. */
  photos?: Array<{
    id: string;
    clientId?: string;
    localUri?: string;
    r2Key?: string;
    mime?: string;
  }>;
};

export function toCustomerQuotePayload(source: CustomerQuoteSource): CustomerQuotePayload {
  return {
    customerPhone: source.customerPhone,
    customerName: normalizeCustomerName(source.customerName),
    totalCents: source.totalCents,
    clientSentence: normalizeClientSentence(source.clientSentence),
    exclusions: normalizeExclusions(source.exclusions),
    currencyCode: parseCurrencyCode(source.currencyCode) ?? DEFAULT_CURRENCY,
    vatPercent: parseVatPercent(source.vatPercent) ?? DEFAULT_VAT_PERCENT,
    lineItems: source.lineItems
      .filter((item) => item.optionRole !== "alt")
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

/** True if a serialized customer payload still contains private-note keys. */
export function customerPayloadHasPrivateNoteKey(payload: unknown): boolean {
  if (payload === null || typeof payload !== "object") {
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
