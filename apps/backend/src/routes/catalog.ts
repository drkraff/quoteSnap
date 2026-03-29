import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { query } from "../db/connection.js";
import type {
  CatalogItemResponse,
  CreateCatalogItemBody,
  UpdateCatalogItemBody,
} from "../types/catalog.js";

export const router = Router();

const VALID_UNITS = ["each", "hour", "foot", "sqft", "job"] as const;

type CatalogRow = {
  id: string;
  name: string;
  unit: string;
  unit_price_cents: number;
  trade_category: string | null;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
};

function rowToResponse(row: CatalogRow): CatalogItemResponse {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    unitPriceCents: row.unit_price_cents,
    tradeCategory: row.trade_category,
    isArchived: row.is_archived,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// GET / — list active items
router.get("/", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const result = await query(
      `SELECT id, name, unit, unit_price_cents, trade_category, is_archived, created_at, updated_at
       FROM catalog_items
       WHERE contractor_id = $1 AND is_archived = FALSE
       ORDER BY trade_category ASC NULLS LAST, name ASC`,
      [contractorId]
    );
    const items = (result.rows as CatalogRow[]).map(rowToResponse);
    res.json({ items });
  } catch (err) {
    console.error("GET /catalog error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST / — create item
router.post("/", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const body = req.body as CreateCatalogItemBody;

    // Validate name
    if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
      res.status(400).json({ error: "name is required and must be a non-empty string" });
      return;
    }

    // Validate unit
    if (!body.unit || !(VALID_UNITS as readonly string[]).includes(body.unit)) {
      res.status(400).json({ error: `unit must be one of: ${VALID_UNITS.join(", ")}` });
      return;
    }

    // Validate unitPriceCents
    if (
      body.unitPriceCents === undefined ||
      body.unitPriceCents === null ||
      !Number.isInteger(body.unitPriceCents) ||
      body.unitPriceCents <= 0
    ) {
      res.status(400).json({ error: "unitPriceCents must be an integer greater than 0" });
      return;
    }

    const tradeCategory = body.tradeCategory ?? null;

    const result = await query(
      `INSERT INTO catalog_items (contractor_id, name, unit, unit_price_cents, trade_category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, unit, unit_price_cents, trade_category, is_archived, created_at, updated_at`,
      [contractorId, body.name.trim(), body.unit, body.unitPriceCents, tradeCategory]
    );

    const item = rowToResponse(result.rows[0] as CatalogRow);
    res.status(201).json({ item });
  } catch (err) {
    console.error("POST /catalog error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /:id — update item
router.put("/:id", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const { id } = req.params as { id: string };
    const body = req.body as UpdateCatalogItemBody;

    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim() === "") {
        res.status(400).json({ error: "name must be a non-empty string" });
        return;
      }
      params.push(body.name.trim());
      setClauses.push(`name = $${params.length}`);
    }

    if (body.unit !== undefined) {
      if (!(VALID_UNITS as readonly string[]).includes(body.unit)) {
        res.status(400).json({ error: `unit must be one of: ${VALID_UNITS.join(", ")}` });
        return;
      }
      params.push(body.unit);
      setClauses.push(`unit = $${params.length}`);
    }

    if (body.unitPriceCents !== undefined) {
      if (!Number.isInteger(body.unitPriceCents) || body.unitPriceCents <= 0) {
        res.status(400).json({ error: "unitPriceCents must be an integer greater than 0" });
        return;
      }
      params.push(body.unitPriceCents);
      setClauses.push(`unit_price_cents = $${params.length}`);
    }

    if (body.tradeCategory !== undefined) {
      params.push(body.tradeCategory);
      setClauses.push(`trade_category = $${params.length}`);
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: "At least one field required" });
      return;
    }

    params.push(id);
    const idParam = params.length;
    params.push(contractorId);
    const contractorParam = params.length;

    const result = await query(
      `UPDATE catalog_items
       SET ${setClauses.join(", ")}
       WHERE id = $${idParam} AND contractor_id = $${contractorParam}
       RETURNING id, name, unit, unit_price_cents, trade_category, is_archived, created_at, updated_at`,
      params
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    const item = rowToResponse(result.rows[0] as CatalogRow);
    res.json({ item });
  } catch (err) {
    console.error("PUT /catalog/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /:id/archive — soft-delete item
router.patch("/:id/archive", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const { id } = req.params as { id: string };

    const result = await query(
      `UPDATE catalog_items
       SET is_archived = TRUE
       WHERE id = $1 AND contractor_id = $2 AND is_archived = FALSE
       RETURNING id`,
      [id, contractorId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    res.json({ archived: true });
  } catch (err) {
    console.error("PATCH /catalog/:id/archive error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
