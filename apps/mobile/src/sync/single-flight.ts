/**
 * Coalesce overlapping async runs: one pass at a time, plus a single rerun if
 * another caller arrived while work was in flight (so enqueued work is not dropped).
 */
export function createSingleFlight(): {
  run: (task: () => Promise<void>) => Promise<void>;
  reset: () => void;
  isRunning: () => boolean;
} {
  let inFlight: Promise<void> | null = null;
  let rerunRequested = false;

  return {
    run(task: () => Promise<void>): Promise<void> {
      if (inFlight) {
        rerunRequested = true;
        return inFlight;
      }

      inFlight = (async () => {
        try {
          do {
            rerunRequested = false;
            await task();
          } while (rerunRequested);
        } finally {
          inFlight = null;
        }
      })();

      return inFlight;
    },
    reset(): void {
      inFlight = null;
      rerunRequested = false;
    },
    isRunning(): boolean {
      return inFlight !== null;
    },
  };
}
