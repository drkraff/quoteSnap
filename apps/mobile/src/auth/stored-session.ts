export function parseStoredContractor(
  raw: string | null | undefined,
): { id: string } | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const id = (value as { id?: unknown }).id;
    if (typeof id !== 'string' || id.trim() === '') return null;
    return value as { id: string };
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): { exp?: unknown } | null {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const json = globalThis.atob(padded + pad);
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as { exp?: unknown };
  } catch {
    return null;
  }
}

/**
 * True only for a JWT whose exp is already due. Opaque or unreadable tokens
 * are left for the API so a non-JWT stored access token is not forced through refresh.
 */
export function accessTokenExpired(
  token: string | null | undefined,
  nowMs: number,
): boolean {
  if (typeof token !== 'string' || token.trim() === '') return false;
  const payload = decodeJwtPayload(token.trim());
  if (!payload || typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    return false;
  }
  return payload.exp * 1000 <= nowMs;
}
