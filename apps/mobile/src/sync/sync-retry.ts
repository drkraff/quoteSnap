/** SYNC-03: 5s → 15s → 60s → 5m → 15m → dead-letter */
export const RETRY_BACKOFF_MS = [5_000, 15_000, 60_000, 5 * 60_000, 15 * 60_000] as const;

export type RetrySchedule = {
  status: 'pending' | 'dead_letter';
  nextRetryAtMs: number | null;
};

/**
 * `retryCount` is the count AFTER the latest failure (1-based).
 * Returns null delay when the item should dead-letter (after the 15m attempt fails).
 */
export function retryDelayMs(retryCount: number): number | null {
  if (retryCount < 1 || retryCount > RETRY_BACKOFF_MS.length) {
    return null;
  }
  return RETRY_BACKOFF_MS[retryCount - 1];
}

export function applyFailureSchedule(retryCountAfterFailure: number, nowMs: number): RetrySchedule {
  const delay = retryDelayMs(retryCountAfterFailure);
  if (delay == null) {
    return { status: 'dead_letter', nextRetryAtMs: null };
  }
  return { status: 'pending', nextRetryAtMs: nowMs + delay };
}

export function isQueueItemDue(
  item: { status: string; nextRetryAtMs: number | null },
  nowMs: number,
): boolean {
  if (item.status === 'dead_letter') return false;
  // in_progress at the start of a pass is a stale claim (crash or prior overlapping run)
  if (item.status === 'in_progress') return true;
  if (item.status !== 'pending' && item.status !== 'failed') return false;
  if (item.nextRetryAtMs == null) return true;
  return item.nextRetryAtMs <= nowMs;
}

export function soonestFutureRetryMs(
  items: { status: string; nextRetryAtMs: number | null }[],
  nowMs: number,
): number | null {
  let soonest: number | null = null;
  for (const item of items) {
    if (item.status !== 'pending' && item.status !== 'failed') continue;
    if (item.nextRetryAtMs == null || item.nextRetryAtMs <= nowMs) continue;
    if (soonest == null || item.nextRetryAtMs < soonest) {
      soonest = item.nextRetryAtMs;
    }
  }
  return soonest;
}
