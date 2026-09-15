import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { query } from "../db/connection.js";
import { importOldQuotes } from "../rate-card/import-apply.js";
import {
  deleteRateCardEntry,
  isRateCardExactLookupQuery,
  listRateCardEntries,
} from "../rate-card/list.js";
import { lookupRateCardEntry, upsertRateCardEntry } from "../rate-card/upsert.js";

export const router = Router();

// POST /import — parse pasted (or extracted) old-quote text and upsert source=imported.
// Never blocks quoting: empty/unreadable input is 200 with imported: 0, not 4xx.
router.post("/import", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const outcome = await importOldQuotes(query, {
      contractorId,
      body: req.body,
    });
    res.status(outcome.status).json(outcome.json);
  } catch (err) {
    console.error("POST /rate-card/import error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

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

// GET / — omit name for the contractor list (paginated; optional q/search + unit).
// name+unit is exact lookup (voice attach). q never switches to lookup.
router.get("/", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    if (isRateCardExactLookupQuery({ name: req.query["name"] })) {
      const outcome = await lookupRateCardEntry(query, {
        contractorId,
        query: {
          name: req.query["name"],
          unit: req.query["unit"],
          trade: req.query["trade"],
        },
      });
      res.status(outcome.status).json(outcome.json);
      return;
    }
    const outcome = await listRateCardEntries(query, {
      contractorId,
      query: {
        limit: req.query["limit"],
        offset: req.query["offset"],
        q: req.query["q"],
        search: req.query["search"],
        unit: req.query["unit"],
      },
    });
    res.status(outcome.status).json(outcome.json);
  } catch (err) {
    console.error("GET /rate-card error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /:id — remove one learned row. Tenant-scoped; does not invent a replacement.
router.delete("/:id", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const { id } = req.params as { id: string };
    const outcome = await deleteRateCardEntry(query, {
      contractorId,
      id,
    });
    res.status(outcome.status).json(outcome.json);
  } catch (err) {
    console.error("DELETE /rate-card/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
