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
  /**
   * Approve/decline must run on one connection. `SELECT … FOR UPDATE` only
   * blocks the other tap through COMMIT. The default runs the statements on
   * `queryFn` with no transaction — production passes `withTransaction`.
   */
  withTransaction?: <T>(fn: (query: SnapshotQueryFn) => Promise<T>) => Promise<T>;
}): Router {
  const router = Router();
  const now = deps.now ?? (() => new Date());
  const inTransaction = deps.withTransaction
    ?? (<T>(fn: (query: SnapshotQueryFn) => Promise<T>) => fn(deps.queryFn));
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
      const result = await inTransaction((txQuery) =>
        approvalHttpResult({
          token,
          action,
          queryFn: txQuery,
          now: now(),
        }),
      );
      res.status(result.status).type("html").send(result.html);
    } catch (err) {
      logRequestFailure(req, err, `POST /q/:token/${action} error`);
      res.status(500).type("html").send("Something went wrong.");
    }
  }

  return router;
}
