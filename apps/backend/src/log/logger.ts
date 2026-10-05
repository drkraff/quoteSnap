import { redactForLog, redactRoutePath } from "./redact.js";

export type LogLevel = "info" | "warn" | "error";

export type LogFields = {
  msg: string;
  requestId?: string | null;
  route?: string;
  status?: number;
  error?: { name: string; message: string };
} & Record<string, unknown>;

type RequestLike = {
  method?: string;
  baseUrl?: string;
  originalUrl?: string;
  url?: string;
  path?: string;
  requestId?: string;
  route?: { path?: string | RegExp };
};

/** Name and message only. Stacks stay off the log line and off HTTP bodies. */
export function errorSummary(err: unknown): { name: string; message: string } {
  if (err instanceof Error) {
    return { name: err.name || "Error", message: err.message };
  }
  if (typeof err === "string") {
    return { name: "Error", message: err };
  }
  return { name: "Error", message: "Unknown error" };
}

/**
 * Method plus path. A matched Express pattern is used when present so the
 * raw approval token is not copied. `/q/<token>` is still rewritten.
 */
export function routeForLog(req: RequestLike): string {
  const method = req.method ?? "UNKNOWN";
  const pattern = req.route?.path;
  let path: string;
  if (typeof pattern === "string") {
    const base = req.baseUrl ?? "";
    path = `${base}${pattern.startsWith("/") ? pattern : `/${pattern}`}`;
  } else {
    const raw = req.originalUrl || req.url || req.path || "";
    path = raw.split("?")[0] ?? raw;
  }
  return `${method} ${redactRoutePath(path)}`;
}

/** One JSON object per line on stdout/stderr for Railway. */
export function log<T extends { msg: string }>(level: LogLevel, fields: T): void {
  const line = redactForLog({ level, ...fields });
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.info(text);
}

export function logRequestFailure(
  req: RequestLike,
  err: unknown,
  msg: string,
  status = 500,
): void {
  log("error", {
    msg,
    requestId: req.requestId ?? null,
    route: routeForLog(req),
    status,
    error: errorSummary(err),
  });
}
