import type { RequestHandler } from "express";

type HealthApp = {
  get: (path: string, handler: RequestHandler) => void;
};

/**
 * `/health` is liveness: it does not touch Postgres.
 * `/ready` is the database check. Its body is only `ready` or `not_ready`.
 */
export function mountHealth(
  app: HealthApp,
  deps: { ready: () => Promise<boolean> },
): void {
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/ready", async (_req, res) => {
    let ok = false;
    try {
      ok = await deps.ready();
    } catch {
      ok = false;
    }
    if (ok) {
      res.status(200).json({ status: "ready" });
      return;
    }
    res.status(503).json({ status: "not_ready" });
  });
}
