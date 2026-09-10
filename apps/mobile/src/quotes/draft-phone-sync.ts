export const PHONE_SYNC_DEBOUNCE_MS = 400;

export type DraftPhoneSyncPayload = {
  quoteId: string;
  customerPhone: string;
};

type DebouncedLatest<T> = {
  schedule: (value: T) => void;
  flush: () => Promise<void>;
  cancel: () => void;
};

/**
 * Keep only the latest scheduled value. Rapid schedule() calls collapse to
 * one callback after `delayMs`, or immediately on flush().
 */
export function createLatestDebouncer<T>(
  callback: (value: T) => void | Promise<void>,
  delayMs: number,
): DebouncedLatest<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { value: T } | null = null;
  let running: Promise<void> = Promise.resolve();

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const invokePending = (): Promise<void> => {
    if (!pending) {
      return running;
    }
    const { value } = pending;
    pending = null;
    running = running.then(async () => {
      try {
        await callback(value);
      } catch {
        // Enqueue failures stay on the next attempt; do not break the chain.
      }
    });
    return running;
  };

  return {
    schedule(value: T): void {
      pending = { value };
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        void invokePending();
      }, delayMs);
    },
    async flush(): Promise<void> {
      clearTimer();
      await invokePending();
    },
    cancel(): void {
      clearTimer();
      pending = null;
    },
  };
}

function samePhoneSync(
  a: DraftPhoneSyncPayload | undefined,
  b: DraftPhoneSyncPayload,
): boolean {
  return a != null
    && a.quoteId === b.quoteId
    && a.customerPhone === b.customerPhone;
}

/**
 * Draft editor phone field: local SQLite can write on every keystroke
 * (REVIEW-05); sync_queue_items must not. Coalesce enqueue to the latest
 * number after PHONE_SYNC_DEBOUNCE_MS, and flush on blur / unmount / send.
 * The quote id is captured at schedule time so a later navigation cannot
 * attach the pending number to a different row.
 */
export function createDraftPhoneSync(
  enqueuePhone: (payload: DraftPhoneSyncPayload) => Promise<void>,
  delayMs: number = PHONE_SYNC_DEBOUNCE_MS,
): DebouncedLatest<DraftPhoneSyncPayload> & {
  markSynced: (payload: DraftPhoneSyncPayload) => void;
} {
  let lastEnqueued: DraftPhoneSyncPayload | undefined;

  const debouncer = createLatestDebouncer(
    async (payload: DraftPhoneSyncPayload) => {
      if (samePhoneSync(lastEnqueued, payload)) {
        return;
      }
      await enqueuePhone(payload);
      lastEnqueued = payload;
    },
    delayMs,
  );

  return {
    markSynced(payload: DraftPhoneSyncPayload): void {
      lastEnqueued = payload;
    },
    schedule: debouncer.schedule,
    flush: debouncer.flush,
    cancel: debouncer.cancel,
  };
}
