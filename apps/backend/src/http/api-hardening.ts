import type { Express, NextFunction, Request, Response } from "express";

/**
 * One trusted hop (Railway's proxy). A numeric hop count is not `true`, so
 * express-rate-limit does not treat it as a permissive trust-proxy setting,
 * and `req.ip` is the client address in `X-Forwarded-For` rather than the socket.
 */
export function applyApiHardening(app: Express): void {
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
}
