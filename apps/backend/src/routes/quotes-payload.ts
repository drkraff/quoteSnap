import { snapshotPriceSourceFromRow } from "../quotes/price-source.js";
import { normalizePrivateNote } from "../quotes/private-note.js";
import { roomsFromDb } from "../quotes/rooms.js";
import type { QuoteLineItemResponse, QuoteListItemResponse, QuoteResponse } from "../types/quotes.js";
import { parseAiFailureStage } from "../voice/ai-failure.js";

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
  is_archived: boolean;
  private_note: string | null;
  client_sentence: string | null;
  rooms: unknown;
  ai_failure_stage?: string | null;
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
  unit: string | null;
  private_note: string | null;
  price_source: string | null;
  option_group_id: string | null;
  option_role: string | null;
  room_id: string | null;
  client_id: string | null;
};

export const QUOTE_COLUMNS =
  "id, contractor_id, status, customer_phone, total_cents, created_at, updated_at, sent_at, voice_job_id, is_archived, private_note, client_sentence, rooms, ai_failure_stage";

/** Active Quotes list (catalog GET analog). Default GET /quotes. */
export function listQuotesSql(archived: boolean): string {
  return `SELECT ${QUOTE_COLUMNS}
       FROM quotes
       WHERE contractor_id = $1 AND is_archived = ${archived ? "TRUE" : "FALSE"}
       ORDER BY created_at DESC`;
}

export const LIST_ACTIVE_QUOTES_SQL = listQuotesSql(false);
export const LIST_ARCHIVED_QUOTES_SQL = listQuotesSql(true);

/** `GET /quotes?archived=true` lists soft-archived rows for hydrate + the Archived screen. */
export function parseQuotesListArchivedQuery(archived: unknown): boolean {
  const value = Array.isArray(archived) ? archived[0] : archived;
  return value === true || value === "true" || value === "1";
}

export const LINE_ITEM_COLUMNS =
  "id, quote_id, name, quantity, unit_price_cents, created_at, confidence, catalog_item_id, unit, private_note, price_source, option_group_id, option_role, room_id, client_id";

export function quoteRowToResponse(row: QuoteRow): QuoteResponse {
  const failureStage =
    row.status === "ai_failed" ? parseAiFailureStage(row.ai_failure_stage) : null;
  return {
    id: row.id,
    status: row.status,
    customerPhone: row.customer_phone,
    totalCents: row.total_cents,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    sentAt: row.sent_at ? row.sent_at.toISOString() : null,
    voiceJobId: row.voice_job_id,
    isArchived: row.is_archived,
    privateNote: normalizePrivateNote(row.private_note),
    clientSentence: row.client_sentence,
    rooms: roomsFromDb(row.rooms),
    ...(failureStage ? { failureStage } : {}),
  };
}

export function lineItemRowToResponse(row: QuoteLineItemRow): QuoteLineItemResponse {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    unit: row.unit,
    confidence: row.confidence,
    catalogItemId: row.catalog_item_id,
    privateNote: normalizePrivateNote(row.private_note),
    priceSource: snapshotPriceSourceFromRow(row.price_source, row.unit_price_cents),
    optionGroupId: row.option_group_id,
    optionRole: row.option_role,
    roomId: row.room_id,
    clientId: row.client_id,
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
