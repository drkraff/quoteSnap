import type { PgBoss } from 'pg-boss';
import type { Job } from 'pg-boss';

/** Quotes stuck in ai_processing longer than this become ai_failed. */
export const DEFAULT_AI_PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;

export const AI_PROCESSING_REAPER_QUEUE = 'ai-processing-reaper';

/** Five-field cron: every minute (pg-boss Timekeeper, UTC). */
export const AI_PROCESSING_REAPER_CRON = '* * * * *';

export type QueryFn = (
  text: string,
  params?: unknown[]
) => Promise<{ rows: unknown[] }>;

/**
 * Parse AI_PROCESSING_TIMEOUT_MS. Unset, blank, non-finite, or non-positive
 * values fall back to 15 minutes — long enough for Whisper + GPT-4o and
 * pg-boss's default 15-minute active-job expiry, short enough that a hung
 * upload/worker cannot pin the mobile poller forever.
 */
export function resolveAiProcessingTimeoutMs(
  envValue: string | undefined
): number {
  if (envValue === undefined || envValue.trim() === '') {
    return DEFAULT_AI_PROCESSING_TIMEOUT_MS;
  }
  const parsed = Number(envValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_AI_PROCESSING_TIMEOUT_MS;
  }
  return parsed;
}

export async function reapStaleAiProcessingQuotes(
  runQuery: QueryFn,
  timeoutMs: number,
  now: Date = new Date()
): Promise<string[]> {
  const cutoff = new Date(now.getTime() - timeoutMs);
  const result = await runQuery(
    `UPDATE quotes
     SET status = 'ai_failed'
     WHERE status = 'ai_processing'
       AND created_at < $1
     RETURNING id`,
    [cutoff]
  );
  return (result.rows as Array<{ id: string }>).map((row) => row.id);
}

export async function startAiProcessingReaper(
  boss: PgBoss,
  runQuery: QueryFn
): Promise<void> {
  await boss.createQueue(AI_PROCESSING_REAPER_QUEUE);

  await boss.schedule(AI_PROCESSING_REAPER_QUEUE, AI_PROCESSING_REAPER_CRON, null, {
    tz: 'UTC',
  });

  await boss.work(AI_PROCESSING_REAPER_QUEUE, async (_jobs: Job[]) => {
    const timeoutMs = resolveAiProcessingTimeoutMs(
      process.env['AI_PROCESSING_TIMEOUT_MS']
    );
    const reapedIds = await reapStaleAiProcessingQuotes(runQuery, timeoutMs);
    if (reapedIds.length > 0) {
      console.info(
        `[ai-processing-reaper] marked ${reapedIds.length} stale quote(s) as ai_failed`
      );
    }
  });
}
