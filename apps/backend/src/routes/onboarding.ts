import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { withTransaction } from "../db/connection.js";
import { applyOnboardingSeed, parseSeedBody } from "../onboarding/seed.js";

export const router = Router();

router.post("/seed", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const parsed = parseSeedBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const outcome = await withTransaction((txQuery) =>
      applyOnboardingSeed(txQuery, { contractorId, trade: parsed.trade }),
    );
    res.status(outcome.status).json(outcome.json);
  } catch (err) {
    console.error("Seed error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
