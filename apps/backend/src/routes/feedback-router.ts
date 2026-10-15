import { Router, type Request, type Response, type RequestHandler } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { logRequestFailure } from "../log/logger.js";
import { createAdminAuth } from "../feedback/admin-auth.js";
import { createFeedbackLimiter } from "../feedback/limiter.js";
import { listFeedback } from "../feedback/list.js";
import { insertFeedback, type FeedbackQuery } from "../feedback/submit.js";
import { parseFeedbackBody } from "../feedback/validate.js";

export type FeedbackRouterDeps = {
  query: FeedbackQuery;
  authenticate?: RequestHandler;
  adminAuth?: RequestHandler;
  limiter?: RequestHandler;
};

export function createFeedbackRouter(deps: FeedbackRouterDeps): Router {
  const runQuery = deps.query;
  const authenticate = deps.authenticate ?? authenticateToken;
  const adminAuth = deps.adminAuth ?? createAdminAuth();
  const limiter = deps.limiter ?? createFeedbackLimiter();
  const router = Router();

  router.post("/", authenticate, (req: Request, res: Response, next) => {
    const parsed = parseFeedbackBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    res.locals["feedback"] = parsed.value;
    next();
  }, limiter, async (req: Request, res: Response): Promise<void> => {
    try {
      const contractorId = req.contractor!.contractorId;
      const outcome = await insertFeedback(runQuery, contractorId, res.locals["feedback"]);
      res.status(outcome.status).json(outcome.json);
    } catch (err) {
      logRequestFailure(req, err, "POST /feedback error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/", adminAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const outcome = await listFeedback(runQuery, {
        limit: req.query["limit"],
        offset: req.query["offset"],
      });
      res.status(outcome.status).json(outcome.json);
    } catch (err) {
      logRequestFailure(req, err, "GET /feedback error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
