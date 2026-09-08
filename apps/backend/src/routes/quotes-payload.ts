import type { QuoteLineItemResponse, QuoteListItemResponse, QuoteResponse } from "../types/quotes.js";

export type QuoteRow = {
  id: string;
  contractor_id: string;
  status: string;
  customer_phone: string | null;
  total_cents: number;
  created_at: Date;
  updated_at: Date;
  sent_at: Date | null;
  voice_job_id: string | null;
};

export type QuoteLineItemRow = {
  id: string;
  quote_id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
  created_at: Date;
  confidence: number | null;
  catalog_item_id: string | null;
};

export const QUOTE_COLUMNS =
  "id, contractor_id, status, customer_phone, total_cents, created_at, updated_at, sent_at, voice_job_id";

export const LINE_ITEM_COLUMNS =
  "id, quote_id, name, quantity, unit_price_cents, created_at, confidence, catalog_item_id";

export function quoteRowToResponse(row: QuoteRow): QuoteResponse {
  return {
    id: row.id,
    status: row.status,
    customerPhone: row.customer_phone,
    totalCents: row.total_cents,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    sentAt: row.sent_at ? row.sent_at.toISOString() : null,
    voiceJobId: row.voice_job_id,
  };
}

export function lineItemRowToResponse(row: QuoteLineItemRow): QuoteLineItemResponse {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    confidence: row.confidence,
    catalogItemId: row.catalog_item_id,
  };
}

/** Nest line items under their parent quotes, preserving quote order. */
export function nestLineItems(
  quotes: QuoteResponse[],
  lineItems: QuoteLineItemRow[]
): QuoteListItemResponse[] {
  const byQuoteId = new Map<string, QuoteLineItemResponse[]>();
  for (const row of lineItems) {
    const list = byQuoteId.get(row.quote_id);
    const mapped = lineItemRowToResponse(row);
    if (list) {
      list.push(mapped);
    } else {
      byQuoteId.set(row.quote_id, [mapped]);
    }
  }

  return quotes.map((quote) => ({
    ...quote,
    lineItems: byQuoteId.get(quote.id) ?? [],
  }));
}
