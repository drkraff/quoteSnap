import {
  RETRY_BACKOFF_MS,
  applyFailureSchedule,
  isQueueItemDue,
  retryDelayMs,
  soonestFutureRetryMs,
} from './sync-retry';

describe('retryDelayMs', () => {
  it('uses the documented 5s / 15s / 60s / 5m / 15m schedule', () => {
    expect(RETRY_BACKOFF_MS).toEqual([5_000, 15_000, 60_000, 300_000, 900_000]);
    expect(retryDelayMs(1)).toBe(5_000);
    expect(retryDelayMs(2)).toBe(15_000);
    expect(retryDelayMs(3)).toBe(60_000);
    expect(retryDelayMs(4)).toBe(300_000);
    expect(retryDelayMs(5)).toBe(900_000);
  });

  it('dead-letters after the 15m attempt (retryCount 6+)', () => {
    expect(retryDelayMs(6)).toBeNull();
    expect(retryDelayMs(7)).toBeNull();
    expect(retryDelayMs(0)).toBeNull();
  });
});

describe('applyFailureSchedule', () => {
  const now = 1_000_000;

  it('keeps the item pending with nextRetryAt so processQueue can pick it up', () => {
    expect(applyFailureSchedule(1, now)).toEqual({
      status: 'pending',
      nextRetryAtMs: now + 5_000,
    });
  });

  it('marks dead_letter after backoff is exhausted', () => {
    expect(applyFailureSchedule(6, now)).toEqual({
      status: 'dead_letter',
      nextRetryAtMs: null,
    });
  });
});

describe('isQueueItemDue', () => {
  const now = 50_000;

  it('retries pending/failed items with no nextRetryAt (including pre-fix failed rows)', () => {
    expect(isQueueItemDue({ status: 'pending', nextRetryAtMs: null }, now)).toBe(true);
    expect(isQueueItemDue({ status: 'failed', nextRetryAtMs: null }, now)).toBe(true);
  });

  it('does not retry pending items still in backoff', () => {
    expect(isQueueItemDue({ status: 'pending', nextRetryAtMs: now + 1 }, now)).toBe(false);
    expect(isQueueItemDue({ status: 'failed', nextRetryAtMs: now + 1 }, now)).toBe(false);
  });

  it('retries once nextRetryAt has elapsed', () => {
    expect(isQueueItemDue({ status: 'pending', nextRetryAtMs: now }, now)).toBe(true);
    expect(isQueueItemDue({ status: 'pending', nextRetryAtMs: now - 1 }, now)).toBe(true);
  });

  it('treats in_progress as due (stale claim), never retries dead_letter, and leaves needs_review parked', () => {
    expect(isQueueItemDue({ status: 'in_progress', nextRetryAtMs: now + 99_000 }, now)).toBe(true);
    expect(isQueueItemDue({ status: 'dead_letter', nextRetryAtMs: null }, now)).toBe(false);
    expect(isQueueItemDue({ status: 'needs_review', nextRetryAtMs: null }, now)).toBe(false);
  });
});

describe('soonestFutureRetryMs', () => {
  it('schedules the earliest future pending/failed retry', () => {
    const now = 10_000;
    expect(
      soonestFutureRetryMs(
        [
          { status: 'pending', nextRetryAtMs: now + 15_000 },
          { status: 'pending', nextRetryAtMs: now + 5_000 },
          { status: 'dead_letter', nextRetryAtMs: now + 1_000 },
          { status: 'pending', nextRetryAtMs: now - 1 },
        ],
        now,
      ),
    ).toBe(now + 5_000);
  });
});
