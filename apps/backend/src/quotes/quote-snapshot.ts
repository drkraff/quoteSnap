/**
 * SMS-02: build and insert the customer snapshot once.
 * There is no update function. A second save returns the stored row.
 */

import type { CustomerQuotePayload } from "./customer-payload.js";
import { toCustomerQuotePayload } from "./customer-payload.js";
import { roomNameForId, roomsFromDb } from "./rooms.js";
import type { QuoteLineItemRow, QuoteRow } from "../routes/quotes-payload.js";

export type SnapshotQueryFn = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: unknown[] }>;

export type QuoteSnapshotRecord = {
  id: string;
  quoteId: string;
  payload: CustomerQuotePayload;
  contractorDisplayName: string | null;
  contractorTrade: string | null;
  createdAt: Date;
};

export const SELECT_SNAPSHOT_FOR_QUOTE_SQL = `SELECT id, quote_id, payload, contractor_display_name, contractor_trade, created_at
  FROM quote_snapshots
  WHERE quote_id = $1`;

export const INSERT_QUOTE_SNAPSHOT_SQL = `INSERT INTO quote_snapshots (
    quote_id, contractor_id, payload, contractor_display_name, contractor_trade
  ) VALUES ($1, $2, $3::jsonb, $4, $5)
  RETURNING id, quote_id, payload, contractor_display_name, contractor_trade, created_at`;

/** Stored 0 means unknown on adhoc lines. Customer payload keeps that blank. */
export function customerUnitPriceCents(unitPriceCents: number): number | null {
  return unitPriceCents === 0 ? null : unitPriceCents;
}

export function normalizeSnapshotBrand(
  displayName: string | null | undefined,
  trade: string | null | undefined,
): { displayName: string | null; trade: string | null } {
  const name = typeof displayName === "string" ? displayName.trim() : "";
  const tradeName = typeof trade === "string" ? trade.trim() : "";
  return {
    displayName: name.length > 0 ? name : null,
    trade: tradeName.length > 0 ? tradeName : null,
  };
}

/**
 * Customer allowlist at send time. Private notes, unselected alts, photos,
 * and price_source never enter the JSON. Totals are the stored quote total.
 */
export function buildQuoteSnapshotPayload(args: {
  quote: Pick<
    QuoteRow,
    "customer_phone" | "total_cents" | "client_sentence" | "private_note" | "rooms"
  >;
  lineItems: QuoteLineItemRow[];
}): CustomerQuotePayload {
  const rooms = roomsFromDb(args.quote.rooms);
  return toCustomerQuotePayload({
    customerPhone: args.quote.customer_phone,
    totalCents: args.quote.total_cents,
    clientSentence: args.quote.client_sentence,
    privateNote: args.quote.private_note,
    rooms,
    lineItems: args.lineItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: customerUnitPriceCents(item.unit_price_cents),
      unit: item.unit,
      privateNote: item.private_note,
      priceSource: item.price_source,
      optionGroupId: item.option_group_id,
      optionRole: item.option_role,
      roomId: item.room_id,
      roomName: roomNameForId(rooms, item.room_id),
    })),
  });
}

type SnapshotRow = {
  id: string;
  quote_id: string;
  payload: unknown;
  contractor_display_name: string | null;
  contractor_trade: string | null;
  created_at: Date | string;
};

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function snapshotRecordFromRow(row: SnapshotRow): QuoteSnapshotRecord {
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  return {
    id: row.id,
    quoteId: row.quote_id,
    payload: payload as CustomerQuotePayload,
    contractorDisplayName: row.contractor_display_name,
    contractorTrade: row.contractor_trade,
    createdAt: asDate(row.created_at),
  };
}

/**
 * Insert the snapshot if this quote does not have one.
 * An existing row is returned unchanged — this function never issues UPDATE.
 * Callers that hold a transaction should serialize on the quote row first;
 * a unique violation aborts that transaction instead of being swallowed.
 */
export async function insertQuoteSnapshotOnce(
  queryFn: SnapshotQueryFn,
  args: {
    quoteId: string;
    contractorId: string;
    payload: CustomerQuotePayload;
    contractorDisplayName: string | null;
    contractorTrade: string | null;
  },
): Promise<{ created: boolean; snapshot: QuoteSnapshotRecord }> {
  const existing = await queryFn(SELECT_SNAPSHOT_FOR_QUOTE_SQL, [args.quoteId]);
  if (existing.rows.length > 0) {
    return {
      created: false,
      snapshot: snapshotRecordFromRow(existing.rows[0] as SnapshotRow),
    };
  }

  const payloadJson = JSON.stringify(args.payload);
  const inserted = await queryFn(INSERT_QUOTE_SNAPSHOT_SQL, [
    args.quoteId,
    args.contractorId,
    payloadJson,
    args.contractorDisplayName,
    args.contractorTrade,
  ]);
  return {
    created: true,
    snapshot: snapshotRecordFromRow(inserted.rows[0] as SnapshotRow),
  };
}
