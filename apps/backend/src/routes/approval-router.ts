import { Router, type Request, type RequestHandler, type Response } from "express";
import { approvalHttpResult, renderNotFoundPage } from "../quotes/approval-page.js";
import type { SnapshotQueryFn } from "../quotes/quote-snapshot.js";
import {
  approvalLimiter,
  approvalSecurityHeaders,
  isCrossSiteApprovalPost,
} from "../quotes/approval-security.js";
import { logRequestFailure } from "../log/logger.js";

/**
 * Public hosted approval page. Mount at /q.
 * No session cookie: the unguessable token is the capability.
 */
export function createApprovalRouter(deps: {
  queryFn: SnapshotQueryFn;
  now?: () => Date;
  limiter?: RequestHandler;
}): Router {
  const router = Router();
  const now = deps.now ?? (() => new Date());
  router.use(approvalSecurityHeaders);
  router.use(deps.limiter ?? approvalLimiter);

  router.get("/:token", async (req: Request, res: Response) => {
    const token = String(req.params.token ?? "");
    try {
      const result = await approvalHttpResult({
        token,
        queryFn: deps.queryFn,
        now: now(),
      });
      res.status(result.status).type("html").send(result.html);
    } catch (err) {
      logRequestFailure(req, err, "GET /q/:token error");
      res.status(500).type("html").send("Something went wrong.");
    }
  });

  router.post("/:token/approve", async (req: Request, res: Response) => {
    await postDecision(req, res, "approve");
  });

  router.post("/:token/decline", async (req: Request, res: Response) => {
    await postDecision(req, res, "decline");
  });

  async function postDecision(
    req: Request,
    res: Response,
    action: "approve" | "decline",
  ): Promise<void> {
    const token = String(req.params.token ?? "");
    if (isCrossSiteApprovalPost(req)) {
      res.status(403).type("html").send(renderNotFoundPage());
      return;
    }
    try {
      const result = await approvalHttpResult({
        token,
        action,
        queryFn: deps.queryFn,
        now: now(),
      });
      res.status(result.status).type("html").send(result.html);
    } catch (err) {
      logRequestFailure(req, err, `POST /q/:token/${action} error`);
      res.status(500).type("html").send("Something went wrong.");
    }
  }

  return router;
}
