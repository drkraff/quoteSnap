import express, { type NextFunction, type Request, type Response } from "express";

/** Same default Express uses for every other JSON route. */
export const DEFAULT_JSON_BODY_LIMIT = "100kb";

/**
 * A 1MB JPEG is about 1.4MB of base64, plus the rest of the note.
 * 2mb leaves room for that cap and still rejects a larger body.
 */
export const FEEDBACK_JSON_BODY_LIMIT = "2mb";

const defaultJson = express.json({ limit: DEFAULT_JSON_BODY_LIMIT });
const feedbackJson = express.json({ limit: FEEDBACK_JSON_BODY_LIMIT });

export function jsonLimitFor(method: string, path: string): string {
  const pathname = path.split("?")[0] ?? path;
  if (method.toUpperCase() === "POST" && (pathname === "/feedback" || pathname === "/feedback/")) {
    return FEEDBACK_JSON_BODY_LIMIT;
  }
  return DEFAULT_JSON_BODY_LIMIT;
}

export function jsonBodyParser(req: Request, res: Response, next: NextFunction): void {
  const parser = jsonLimitFor(req.method, req.path) === FEEDBACK_JSON_BODY_LIMIT
    ? feedbackJson
    : defaultJson;
  parser(req, res, next);
}
