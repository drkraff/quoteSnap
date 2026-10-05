import type { Job, PgBoss } from "pg-boss";
import { log } from "../log/logger.js";

/** SMS-05: mark still-sent quotes expired after the approval token TTL. */
export const QUOTE_APPROVAL_EXPIRY_QUEUE = "quote-approval-expiry";

/** Five-field cron: every minute (pg-boss Timekeeper, UTC). */
export const QUOTE_APPROVAL_EXPIRY_CRON = "* * * * *";

export type ExpiryQueryFn = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: unknown[] }>;

/**
 * Only `sent` quotes with a token already past expires_at move to `expired`.
 * Approved and declined stay decided. Snapshots are not updated.
 */
export const EXPIRE_SENT_QUOTES_SQL = `UPDATE quotes q
   SET status = 'expired'
   WHERE q.status = 'sent'
     AND EXISTS (
       SELECT 1
       FROM quote_approval_tokens t
       WHERE t.quote_id = q.id
         AND t.expires_at <= $1
     )
   RETURNING q.id`;

export async function expireSentApprovalQuotes(
  runQuery: ExpiryQueryFn,
  now: Date = new Date(),
): Promise<string[]> {
  const result = await runQuery(EXPIRE_SENT_QUOTES_SQL, [now]);
  return (result.rows as Array<{ id: string }>).map((row) => row.id);
}

export async function startQuoteApprovalExpiry(
  boss: PgBoss,
  runQuery: ExpiryQueryFn,
): Promise<void> {
  await boss.createQueue(QUOTE_APPROVAL_EXPIRY_QUEUE);

  await boss.schedule(
    QUOTE_APPROVAL_EXPIRY_QUEUE,
    QUOTE_APPROVAL_EXPIRY_CRON,
    null,
    { tz: "UTC" },
  );

  await boss.work(QUOTE_APPROVAL_EXPIRY_QUEUE, async (_jobs: Job[]) => {
    const expiredIds = await expireSentApprovalQuotes(runQuery, new Date());
    if (expiredIds.length > 0) {
      log("info", {
        msg: "quote_approval_expired",
        count: expiredIds.length,
      });
    }
  });
}
