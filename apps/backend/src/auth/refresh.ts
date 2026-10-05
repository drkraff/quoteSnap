import crypto from "crypto";
import type { ContractorPayload, TokenPair } from "../types/auth.js";

/** Same shape as `QueryFn` without importing `connection.ts` (needs DATABASE_URL). */
export type RefreshQueryFn = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: unknown[] }>;

export const INVALID_REFRESH_TOKEN_ERROR = "Invalid or expired refresh token";

/**
 * Lock the matching unrevoked, unexpired refresh row so overlapping
 * `/auth/refresh` calls cannot both pass the select. Caller must wrap
 * `rotateRefreshToken` in `withTransaction` so the lock is held through
 * revoke + insert and released on COMMIT/ROLLBACK.
 */
export const SELECT_REFRESH_TOKEN_FOR_UPDATE_SQL = `SELECT rt.id, rt.contractor_id
       FROM refresh_tokens rt
       WHERE rt.token_hash = $1
         AND rt.revoked_at IS NULL
         AND rt.expires_at > NOW()
       FOR UPDATE`;

export const SELECT_CONTRACTOR_FOR_REFRESH_SQL =
  "SELECT id, email, phone FROM contractors WHERE id = $1";

export const REVOKE_REFRESH_TOKEN_SQL =
  "UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1";

export const INSERT_REFRESH_TOKEN_SQL = `INSERT INTO refresh_tokens (contractor_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '30 days')`;

/** Presented token was already revoked. Used only after the live-row lock misses. */
export const SELECT_REVOKED_REFRESH_TOKEN_SQL = `SELECT contractor_id, revoked_at
       FROM refresh_tokens
       WHERE token_hash = $1
         AND revoked_at IS NOT NULL`;

/** Reuse of a revoked token outside the overlap window kills the contractor's other live refresh rows. */
export const REVOKE_CONTRACTOR_REFRESH_TOKENS_SQL = `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE contractor_id = $1
       AND revoked_at IS NULL`;

/**
 * Overlapping refresh of the same token revokes it and then the waiter
 * observes that revoke. Family revocation waits out that race.
 */
export const REFRESH_REUSE_GRACE_MS = 30_000;

export type RotateRefreshOutcome =
  | { status: 401; json: { error: string } }
  | { status: 200; json: TokenPair };

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Unparseable `revoked_at` fails closed and revokes the family. */
function reuseOutsideGrace(revokedAt: unknown, now = Date.now()): boolean {
  const time = revokedAt instanceof Date
    ? revokedAt.getTime()
    : new Date(String(revokedAt)).getTime();
  if (!Number.isFinite(time)) return true;
  return now - time > REFRESH_REUSE_GRACE_MS;
}

/**
 * Rotate one refresh token on a single query function: lock the current row,
 * revoke it, insert the replacement. A second overlapping rotation of the same
 * hash blocks on `FOR UPDATE` and then sees `revoked_at IS NOT NULL` → 401.
 *
 * A revoked token presented after `REFRESH_REUSE_GRACE_MS` revokes that
 * contractor's other live refresh rows. A revoke inside the grace window
 * (the overlapping waiter) returns 401 and leaves the newly issued token.
 */
export async function rotateRefreshToken(
  queryFn: RefreshQueryFn,
  args: {
    refreshToken: string;
    signAccessToken: (payload: ContractorPayload) => string;
    generateRefreshToken?: () => string;
  },
): Promise<RotateRefreshOutcome> {
  const tokenHash = hashRefreshToken(args.refreshToken);
  const tokenResult = await queryFn(SELECT_REFRESH_TOKEN_FOR_UPDATE_SQL, [tokenHash]);
  if (tokenResult.rows.length === 0) {
    const revoked = await queryFn(SELECT_REVOKED_REFRESH_TOKEN_SQL, [tokenHash]);
    if (revoked.rows.length > 0) {
      const row = revoked.rows[0] as { contractor_id: string; revoked_at: unknown };
      if (reuseOutsideGrace(row.revoked_at)) {
        await queryFn(REVOKE_CONTRACTOR_REFRESH_TOKENS_SQL, [row.contractor_id]);
      }
    }
    return { status: 401, json: { error: INVALID_REFRESH_TOKEN_ERROR } };
  }
  const tokenRow = tokenResult.rows[0] as { id: string; contractor_id: string };

  const contractorResult = await queryFn(SELECT_CONTRACTOR_FOR_REFRESH_SQL, [
    tokenRow.contractor_id,
  ]);
  if (contractorResult.rows.length === 0) {
    return { status: 401, json: { error: INVALID_REFRESH_TOKEN_ERROR } };
  }
  const contractor = contractorResult.rows[0] as {
    id: string;
    email: string | null;
    phone: string | null;
  };

  await queryFn(REVOKE_REFRESH_TOKEN_SQL, [tokenRow.id]);

  const nextRefresh =
    args.generateRefreshToken !== undefined
      ? args.generateRefreshToken()
      : generateRefreshToken();
  await queryFn(INSERT_REFRESH_TOKEN_SQL, [
    contractor.id,
    hashRefreshToken(nextRefresh),
  ]);

  const accessToken = args.signAccessToken({
    contractorId: contractor.id,
    email: contractor.email,
    phone: contractor.phone,
  });

  return {
    status: 200,
    json: { accessToken, refreshToken: nextRefresh },
  };
}
