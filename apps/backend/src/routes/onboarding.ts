import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { withTransaction } from "../db/connection.js";
import { logRequestFailure } from "../log/logger.js";
import { applyOnboardingProfile, parseOnboardingProfileBody } from "../onboarding/profile.js";
import { applyOnboardingSeed, parseSeedBody } from "../onboarding/seed.js";

export const router = Router();

router.post("/profile", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const parsed = parseOnboardingProfileBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const outcome = await withTransaction((txQuery) =>
      applyOnboardingProfile(txQuery, {
        contractorId,
        trade: parsed.trade,
        hourlyRateCents: parsed.hourlyRateCents,
        markupPercent: parsed.markupPercent,
      }),
    );
    res.status(outcome.status).json(outcome.json);
  } catch (err) {
    logRequestFailure(req, err, "Onboarding profile error");
    res.status(500).json({ error: "Internal server error" });
  }
});

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
    logRequestFailure(req, err, "Seed error");
    res.status(500).json({ error: "Internal server error" });
  }
});
