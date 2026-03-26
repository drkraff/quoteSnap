import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { query } from "../db/connection.js";
import { TRADE_TEMPLATES } from "../data/trade-templates.js";
import type { SeedBody, SeedResponse, Trade } from "../types/onboarding.js";

export const router = Router();

const VALID_TRADES: Trade[] = ["plumbing", "electrical", "hvac"];

router.post("/seed", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const { trade } = req.body as SeedBody;

    // Validate trade
    if (!trade || !VALID_TRADES.includes(trade)) {
      res.status(400).json({ error: "Invalid trade. Must be one of: plumbing, electrical, hvac" });
      return;
    }

    // Check if already seeded (contractor has trade set)
    const existing = await query(
      "SELECT trade FROM contractors WHERE id = $1",
      [contractorId]
    );
    if (existing.rows[0]?.trade) {
      res.status(409).json({ error: "Catalog already seeded" });
      return;
    }

    // Update contractor's trade
    await query(
      "UPDATE contractors SET trade = $1 WHERE id = $2",
      [trade, contractorId]
    );

    // Insert catalog items from template
    const template = TRADE_TEMPLATES[trade];
    const insertedItems: SeedResponse["items"] = [];

    for (const item of template) {
      const result = await query(
        `INSERT INTO catalog_items (contractor_id, name, unit, unit_price_cents, trade_category)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, unit, unit_price_cents, trade_category`,
        [contractorId, item.name, item.unit, item.unitPriceCents, item.tradeCategory]
      );
      const row = result.rows[0] as {
        id: string;
        name: string;
        unit: string;
        unit_price_cents: number;
        trade_category: string;
      };
      insertedItems.push({
        id: row.id,
        name: row.name,
        unit: row.unit,
        unitPriceCents: row.unit_price_cents,
        tradeCategory: row.trade_category,
      });
    }

    const response: SeedResponse = {
      trade,
      itemCount: insertedItems.length,
      items: insertedItems,
    };

    res.status(201).json(response);
  } catch (err) {
    console.error("Seed error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
