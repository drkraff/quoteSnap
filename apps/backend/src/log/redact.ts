/**
 * Redact secrets and PII before a value is written to a log line.
 * Approval links keep the /q/ mount and replace the token segment.
 */

const REDACTED = "[redacted]";

const SENSITIVE_KEYS = new Set([
  "authorization",
  "proxyauthorization",
  "cookie",
  "setcookie",
  "password",
  "passwordhash",
  "currentpassword",
  "newpassword",
  "customerphone",
  "phone",
  "apikey",
  "openaiapikey",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "token",
  "secret",
  "jwtaccesssecret",
  "databaseurl",
  "r2secretaccesskey",
]);

const SIGNED_URL = /https?:\/\/[^\s"'<>]+/gi;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const OPENAI_KEY = /\bsk-[A-Za-z0-9_-]{12,}\b/g;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const APPROVAL_PATH = /\/q\/[^/?#\s]+/g;
const TOKEN_QUERY = /([?&](?:token|access_token|refresh_token|approval_token)=)[^&#\s]+/gi;
const JSON_SECRET =
  /("(?:password|passwordHash|password_hash|customerPhone|customer_phone|phone|authorization|apiKey|api_key|openai_api_key|token|accessToken|refreshToken)"\s*:\s*")([^"\\]*)(")/gi;
const PASSWORD_ASSIGN = /((?:password|passwd|pwd)\s*["']?\s*[:=]\s*["']?)([^"'&\s]+)/gi;
const PHONE_ASSIGN =
  /((?:customer[_-]?phone|phone)\s*["']?\s*[:=]\s*["']?)(\+?\d[\d\s().-]{6,20})/gi;
const TOKEN_ASSIGN =
  /((?:approval_token|access_token|refresh_token|token)\s*[:=]\s*["']?)([A-Za-z0-9_-]{8,})/gi;
const E164 = /\+\d{10,15}\b/g;
const NANP = /(^|[^\d])((?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})\b/g;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (SENSITIVE_KEYS.has(normalized)) return true;
  if (
    normalized.includes("password") ||
    normalized.includes("secret") ||
    normalized.includes("apikey")
  ) {
    return true;
  }
  if (normalized === "phone" || normalized.endsWith("phone")) return true;
  if (normalized === "token" || normalized.endsWith("token")) return true;
  if (normalized === "authorization" || normalized.endsWith("authorization")) return true;
  return false;
}

function isSignedUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (
    lower.includes("x-amz-signature=") ||
    lower.includes("x-amz-credential=") ||
    lower.includes("x-amz-security-token=") ||
    lower.includes("awsaccesskeyid=") ||
    /[?&]sig=/.test(lower)
  ) {
    return true;
  }
  const r2Host =
    lower.includes("r2.cloudflarestorage.com") || lower.includes(".r2.dev");
  return r2Host && url.includes("?");
}

/** Replace secret-shaped substrings. Safe to run more than once. */
export function redactString(input: string): string {
  let out = input.replace(SIGNED_URL, (url) => (isSignedUrl(url) ? "[redacted-url]" : url));
  out = out.replace(BEARER, "$1 [redacted]");
  out = out.replace(OPENAI_KEY, REDACTED);
  out = out.replace(JWT, REDACTED);
  out = out.replace(APPROVAL_PATH, "/q/:redacted");
  out = out.replace(TOKEN_QUERY, "$1[redacted]");
  out = out.replace(JSON_SECRET, "$1[redacted]$3");
  out = out.replace(PASSWORD_ASSIGN, "$1[redacted]");
  out = out.replace(PHONE_ASSIGN, "$1[redacted]");
  out = out.replace(TOKEN_ASSIGN, "$1[redacted]");
  out = out.replace(E164, REDACTED);
  out = out.replace(NANP, "$1[redacted]");
  return out;
}

/** `/q/<token>` and `/q/:token` both become `/q/:redacted`. Query strings are dropped. */
export function redactRoutePath(path: string): string {
  const pathname = path.split("?")[0] ?? path;
  return redactString(pathname);
}

export function redactForLog(value: unknown): unknown {
  return walk(value, new WeakSet<object>());
}

function walk(value: unknown, seen: WeakSet<object>): unknown {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return REDACTED;
  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: redactString(value.message),
    };
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return REDACTED;
    seen.add(value);
    return value.map((item) => walk(item, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value)) return REDACTED;
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === "stack") continue;
      if (isSensitiveKey(key)) {
        out[key] = REDACTED;
        continue;
      }
      out[key] = walk(child, seen);
    }
    return out;
  }
  return undefined;
}
