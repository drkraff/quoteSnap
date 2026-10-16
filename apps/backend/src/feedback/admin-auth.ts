import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const ADMIN_UNAUTHORIZED = "Unauthorized";

/** Authorization scheme is case-insensitive. The token itself is not trimmed. */
export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  const token = match?.[1];
  return token && token.length > 0 ? token : null;
}

export function adminTokenMatches(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) {
    timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Fail closed when ADMIN_TOKEN is missing or blank. A contractor JWT is not
 * an admin credential; only an exact match of the env value is.
 */
export function createAdminAuth(env: NodeJS.ProcessEnv = process.env) {
  return function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
    const expected = env["ADMIN_TOKEN"]?.trim() ?? "";
    const provided = bearerToken(req.header("authorization"));
    if (expected.length === 0 || !provided || !adminTokenMatches(provided, expected)) {
      res.status(401).json({ error: ADMIN_UNAUTHORIZED });
      return;
    }
    next();
  };
}
