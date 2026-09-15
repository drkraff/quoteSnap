/**
 * Phase 6 SMS / PDF / approval page MUST serialize through this allowlist.
 * Do not spread a Quote / LineItem / contractor GET body — those include
 * privateNote for hydrate and draft sync.
 *
 * Client-facing scope and private notes are different objects (design #9).
 */

export type CustomerLineItemPayload = {
  name: string;
  quantity: number;
  unitPriceCents: number | null;
  unit: string | null;
};

export type CustomerQuotePayload = {
  customerPhone: string | null;
  totalCents: number;
  lineItems: CustomerLineItemPayload[];
};

const CUSTOMER_QUOTE_KEYS = ['customerPhone', 'totalCents', 'lineItems'] as const;
const CUSTOMER_LINE_KEYS = ['name', 'quantity', 'unitPriceCents', 'unit'] as const;

export type CustomerQuoteSource = {
  customerPhone: string | null;
  totalCents: number;
  privateNote?: string | null;
  notes?: string | null;
  lineItems: {
    name: string;
    quantity: number;
    unitPriceCents: number | null;
    unit?: string | null;
    privateNote?: string | null;
    notes?: string | null;
  }[];
};

export function toCustomerQuotePayload(source: CustomerQuoteSource): CustomerQuotePayload {
  return {
    customerPhone: source.customerPhone,
    totalCents: source.totalCents,
    lineItems: source.lineItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      unit: item.unit ?? null,
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
}): {
  name: string;
  quantity: number;
  unitPriceCents: number;
  unit: string | null;
  privateNote: string | null;
} {
  return {
    name: item.name,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents ?? 0,
    unit: item.unit ?? null,
    privateNote: item.privateNote ?? null,
  };
}
