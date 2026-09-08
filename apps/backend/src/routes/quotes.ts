import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { query, withTransaction } from "../db/connection.js";
import { applyQuotePut, parseQuoteCreateBody, parseQuotePutBody } from "../quotes/quote-write.js";
import { filterUuidCatalogIds } from "../workers/voice-validation.js";
import {
  LINE_ITEM_COLUMNS,
  QUOTE_COLUMNS,
  lineItemRowToResponse,
  nestLineItems,
  quoteRowToResponse,
  type QuoteLineItemRow,
  type QuoteRow,
} from "./quotes-payload.js";

export const router = Router();

// GET / — list quotes for contractor sorted by recency, with line items + voiceJobId
router.get("/", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const result = await query(
      `SELECT ${QUOTE_COLUMNS}
       FROM quotes
       WHERE contractor_id = $1
       ORDER BY created_at DESC`,
      [contractorId]
    );
    const quoteRows = result.rows as QuoteRow[];
    const quoteIds = filterUuidCatalogIds(quoteRows.map((row) => row.id));

    let lineItemRows: QuoteLineItemRow[] = [];
    if (quoteIds.length > 0) {
      const lineItemsResult = await query(
        `SELECT ${LINE_ITEM_COLUMNS}
         FROM quote_line_items
         WHERE quote_id = ANY($1::uuid[])
         ORDER BY created_at ASC`,
        [quoteIds]
      );
      lineItemRows = lineItemsResult.rows as QuoteLineItemRow[];
    }

    const quotes = nestLineItems(quoteRows.map(quoteRowToResponse), lineItemRows);
    res.json({ quotes });
  } catch (err) {
    console.error("GET /quotes error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST / — create a new quote
router.post("/", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const parsed = parseQuoteCreateBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const result = await query(
      `INSERT INTO quotes (contractor_id, status, customer_phone, total_cents)
       VALUES ($1, $2, $3, $4)
       RETURNING ${QUOTE_COLUMNS}`,
      [contractorId, parsed.status, parsed.customerPhone, parsed.totalCents]
    );

    const quote = quoteRowToResponse(result.rows[0] as QuoteRow);
    res.status(201).json({ quote });
  } catch (err) {
    console.error("POST /quotes error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /:id — get a single quote with its line items
router.get("/:id", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const { id } = req.params as { id: string };

    const quoteResult = await query(
      `SELECT ${QUOTE_COLUMNS}
       FROM quotes
       WHERE id = $1 AND contractor_id = $2`,
      [id, contractorId]
    );

    if (quoteResult.rows.length === 0) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }

    const lineItemsResult = await query(
      `SELECT ${LINE_ITEM_COLUMNS}
       FROM quote_line_items
       WHERE quote_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    const quote = quoteRowToResponse(quoteResult.rows[0] as QuoteRow);
    const lineItems = (lineItemsResult.rows as QuoteLineItemRow[]).map(lineItemRowToResponse);

    res.json({ quote, lineItems });
  } catch (err) {
    console.error("GET /quotes/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /:id — update quote metadata and optionally replace line items (one transaction)
router.put("/:id", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const { id } = req.params as { id: string };
    const parsed = parseQuotePutBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const outcome = await withTransaction((txQuery) =>
      applyQuotePut(txQuery, { quoteId: id, contractorId, body: req.body }),
    );
    res.status(outcome.status).json(outcome.json);
  } catch (err) {
    console.error("PUT /quotes/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
