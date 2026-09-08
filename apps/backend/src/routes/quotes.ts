import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { query } from "../db/connection.js";
import { filterUuidCatalogIds } from "../workers/voice-validation.js";
import type {
  QuoteResponse,
  CreateQuoteBody,
  UpdateQuoteBody,
} from "../types/quotes.js";
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
    const body = req.body as CreateQuoteBody;

    const status = body.status ?? "draft_local";
    const customerPhone = body.customerPhone ?? null;
    const totalCents = body.totalCents ?? 0;

    const result = await query(
      `INSERT INTO quotes (contractor_id, status, customer_phone, total_cents)
       VALUES ($1, $2, $3, $4)
       RETURNING ${QUOTE_COLUMNS}`,
      [contractorId, status, customerPhone, totalCents]
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

// PUT /:id — update quote metadata and optionally replace line items
router.put("/:id", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const { id } = req.params as { id: string };
    const body = req.body as UpdateQuoteBody;

    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (body.status !== undefined) {
      params.push(body.status);
      setClauses.push(`status = $${params.length}`);
    }

    if (body.customerPhone !== undefined) {
      params.push(body.customerPhone);
      setClauses.push(`customer_phone = $${params.length}`);
    }

    if (body.totalCents !== undefined) {
      params.push(body.totalCents);
      setClauses.push(`total_cents = $${params.length}`);
    }

    if (setClauses.length === 0 && !body.lineItems) {
      res.status(400).json({ error: "At least one field required" });
      return;
    }

    let quote: QuoteResponse;

    if (setClauses.length > 0) {
      params.push(id);
      const idParam = params.length;
      params.push(contractorId);
      const contractorParam = params.length;

      const result = await query(
        `UPDATE quotes
         SET ${setClauses.join(", ")}
         WHERE id = $${idParam} AND contractor_id = $${contractorParam}
         RETURNING ${QUOTE_COLUMNS}`,
        params
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Quote not found" });
        return;
      }

      quote = quoteRowToResponse(result.rows[0] as QuoteRow);
    } else {
      // No metadata changes, just fetch the quote to verify ownership
      const result = await query(
        `SELECT ${QUOTE_COLUMNS}
         FROM quotes
         WHERE id = $1 AND contractor_id = $2`,
        [id, contractorId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Quote not found" });
        return;
      }

      quote = quoteRowToResponse(result.rows[0] as QuoteRow);
    }

    // Replace line items if provided
    if (body.lineItems !== undefined) {
      await query(`DELETE FROM quote_line_items WHERE quote_id = $1`, [id]);

      for (const item of body.lineItems) {
        await query(
          `INSERT INTO quote_line_items (quote_id, name, quantity, unit_price_cents)
           VALUES ($1, $2, $3, $4)`,
          [id, item.name, item.quantity, item.unitPriceCents]
        );
      }
    }

    res.json({ quote });
  } catch (err) {
    console.error("PUT /quotes/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
