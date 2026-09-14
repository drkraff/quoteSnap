import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { query } from "../db/connection.js";
import { lookupRateCardEntry, upsertRateCardEntry } from "../rate-card/upsert.js";

export const router = Router();

// POST / — learn last confirmed unit price (exact name+unit+optional trade).
router.post("/", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const outcome = await upsertRateCardEntry(query, {
      contractorId,
      body: req.body,
    });
    res.status(outcome.status).json(outcome.json);
  } catch (err) {
    console.error("POST /rate-card error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET / — exact lookup by name + unit (+ optional trade). Miss returns { entry: null }.
router.get("/", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const outcome = await lookupRateCardEntry(query, {
      contractorId,
      query: {
        name: req.query["name"],
        unit: req.query["unit"],
        trade: req.query["trade"],
      },
    });
    res.status(outcome.status).json(outcome.json);
  } catch (err) {
    console.error("GET /rate-card error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
