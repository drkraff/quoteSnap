import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { query } from "../db/connection.js";
import type {
  QuoteResponse,
  QuoteLineItemResponse,
  CreateQuoteBody,
  UpdateQuoteBody,
} from "../types/quotes.js";

export const router = Router();

type QuoteRow = {
  id: string;
  contractor_id: string;
  status: string;
  customer_phone: string | null;
  total_cents: number;
  created_at: Date;
  updated_at: Date;
  sent_at: Date | null;
};

type QuoteLineItemRow = {
  id: string;
  quote_id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
  created_at: Date;
};

function rowToResponse(row: QuoteRow): QuoteResponse {
  return {
    id: row.id,
    status: row.status,
    customerPhone: row.customer_phone,
    totalCents: row.total_cents,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    sentAt: row.sent_at ? row.sent_at.toISOString() : null,
  };
}

function lineItemRowToResponse(row: QuoteLineItemRow): QuoteLineItemResponse {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
  };
}

// GET / — list quotes for contractor sorted by recency
router.get("/", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const result = await query(
      `SELECT id, contractor_id, status, customer_phone, total_cents, created_at, updated_at, sent_at
       FROM quotes
       WHERE contractor_id = $1
       ORDER BY created_at DESC`,
      [contractorId]
    );
    const quotes = (result.rows as QuoteRow[]).map(rowToResponse);
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
       RETURNING id, contractor_id, status, customer_phone, total_cents, created_at, updated_at, sent_at`,
      [contractorId, status, customerPhone, totalCents]
    );

    const quote = rowToResponse(result.rows[0] as QuoteRow);
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
      `SELECT id, contractor_id, status, customer_phone, total_cents, created_at, updated_at, sent_at
       FROM quotes
       WHERE id = $1 AND contractor_id = $2`,
      [id, contractorId]
    );

    if (quoteResult.rows.length === 0) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }

    const lineItemsResult = await query(
      `SELECT id, quote_id, name, quantity, unit_price_cents, created_at
       FROM quote_line_items
       WHERE quote_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    const quote = rowToResponse(quoteResult.rows[0] as QuoteRow);
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
         RETURNING id, contractor_id, status, customer_phone, total_cents, created_at, updated_at, sent_at`,
        params
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Quote not found" });
        return;
      }

      quote = rowToResponse(result.rows[0] as QuoteRow);
    } else {
      // No metadata changes, just fetch the quote to verify ownership
      const result = await query(
        `SELECT id, contractor_id, status, customer_phone, total_cents, created_at, updated_at, sent_at
         FROM quotes
         WHERE id = $1 AND contractor_id = $2`,
        [id, contractorId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Quote not found" });
        return;
      }

      quote = rowToResponse(result.rows[0] as QuoteRow);
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
