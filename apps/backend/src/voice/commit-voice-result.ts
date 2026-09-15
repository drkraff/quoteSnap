import {
  inferSnapshotPriceSource,
  isSnapshotPriceSource,
  type SnapshotPriceSource,
} from "../quotes/price-source.js";
import { snapshotUnitPriceCents } from "../workers/voice-price-attach.js";
import type { AiFailureStage } from "./ai-failure.js";

export type VoiceCommitClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

export type VoiceCommitLine = {
  catalogItemId: string | null;
  name: string;
  quantity: number;
  unit: string | null;
  unitPriceCents: number | null;
  confidence: number;
  priceSource?: SnapshotPriceSource | string | null;
};

export const DELETE_VOICE_LINE_ITEMS_SQL = `DELETE FROM quote_line_items WHERE quote_id = $1`;

export const INSERT_VOICE_LINE_ITEM_SQL = `INSERT INTO quote_line_items (quote_id, catalog_item_id, name, quantity, unit_price_cents, confidence, unit, price_source) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;

function commitPriceSource(item: VoiceCommitLine): SnapshotPriceSource {
  const cents = snapshotUnitPriceCents(item.unitPriceCents);
  if (isSnapshotPriceSource(item.priceSource)) {
    return item.priceSource;
  }
  return inferSnapshotPriceSource(cents);
}

export const UPDATE_VOICE_QUOTE_RESULT_SQL = `UPDATE quotes SET status = $1, total_cents = $2, ai_failure_stage = $3 WHERE id = $4`;

/**
 * Replace line items and set quote status in the caller's transaction.
 * Used for a successful draft_local commit and for FAIL-05 partial ai_failed.
 */
export async function replaceVoiceQuoteLines(
  client: VoiceCommitClient,
  args: {
    quoteId: string;
    lineItems: VoiceCommitLine[];
    status: "draft_local" | "ai_failed";
    totalCents: number;
    failureStage: AiFailureStage | null;
  },
): Promise<void> {
  await client.query(DELETE_VOICE_LINE_ITEMS_SQL, [args.quoteId]);
  for (const item of args.lineItems) {
    await client.query(INSERT_VOICE_LINE_ITEM_SQL, [
      args.quoteId,
      item.catalogItemId,
      item.name,
      item.quantity,
      snapshotUnitPriceCents(item.unitPriceCents),
      item.confidence,
      item.unit,
      commitPriceSource(item),
    ]);
  }
  await client.query(UPDATE_VOICE_QUOTE_RESULT_SQL, [
    args.status,
    args.totalCents,
    args.status === "ai_failed" ? args.failureStage : null,
    args.quoteId,
  ]);
}
