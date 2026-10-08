import type { RequestHandler } from "express";
import { logRequestFailure } from "../log/logger.js";
import { coerceStoredQuantity } from "../quotes/integer-money.js";
import { snapshotPriceSourceFromRow } from "../quotes/price-source.js";
import { roomsFromDb } from "../quotes/rooms.js";
import { isVoiceDraftReadable } from "../voice/ai-failure.js";
import { isUuid } from "../uuid.js";
import type { QuotesRouteQuery } from "./quotes-router.js";

/**
 * GET /voice/draft/:quoteId. A non-UUID id is the same not-found body as a
 * missing row, and it is not sent to the uuid column.
 */
export function createVoiceDraftHandler(runQuery: QuotesRouteQuery): RequestHandler {
  return async (req, res): Promise<void> => {
    try {
      const contractorId = req.contractor!.contractorId;
      const { quoteId } = req.params as { quoteId: string };
      if (!isUuid(quoteId)) {
        res.status(404).json({ error: "Draft not found" });
        return;
      }

      const quoteResult = await runQuery(
        `SELECT id, status, total_cents, client_sentence, rooms FROM quotes WHERE id = $1 AND contractor_id = $2`,
        [quoteId, contractorId],
      );

      if (quoteResult.rows.length === 0) {
        res.status(404).json({ error: "Draft not found" });
        return;
      }

      const quoteRow = quoteResult.rows[0] as {
        id: string;
        status: string;
        total_cents: number;
        client_sentence: string | null;
        rooms: unknown;
      };

      if (!isVoiceDraftReadable(quoteRow.status)) {
        res.status(404).json({ error: "Draft not ready" });
        return;
      }

      const lineItemsResult = await runQuery(
        `SELECT qli.catalog_item_id AS "catalogItemId",
                qli.name,
                qli.quantity,
                qli.unit_price_cents AS "unitPriceCents",
                qli.unit,
                qli.confidence,
                qli.price_source AS "priceSource",
                qli.room_id AS "roomId"
         FROM quote_line_items qli
         WHERE qli.quote_id = $1
         ORDER BY qli.created_at ASC`,
        [quoteId],
      );

      type LineItemRow = {
        catalogItemId: string | null;
        name: string;
        quantity: number;
        unitPriceCents: number;
        unit: string | null;
        confidence: number | null;
        priceSource: string | null;
        roomId: string | null;
      };

      const lineItems = (lineItemsResult.rows as LineItemRow[]).map((row) => ({
        catalogItemId: row.catalogItemId,
        name: row.name,
        quantity: coerceStoredQuantity(row.quantity),
        unitPriceCents: row.unitPriceCents > 0 ? row.unitPriceCents : null,
        unit: row.unit,
        confidence: row.confidence ?? undefined,
        priceSource: snapshotPriceSourceFromRow(row.priceSource, row.unitPriceCents),
        roomId: row.roomId,
      }));

      res.json({
        quoteId,
        totalCents: quoteRow.total_cents,
        clientSentence: quoteRow.client_sentence ?? null,
        rooms: roomsFromDb(quoteRow.rooms),
        lineItems,
      });
    } catch (err) {
      logRequestFailure(req, err, "GET /voice/draft/:quoteId error");
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
