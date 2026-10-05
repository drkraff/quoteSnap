import type { EventEmitter } from "node:events";

export type ShutdownDeps = {
  closeServer: () => Promise<void>;
  stopBoss: () => Promise<void>;
  closePool: () => Promise<void>;
  exit: (code: number) => void;
  logError: (err: unknown) => void;
};

/**
 * Close HTTP, then pg-boss, then the pool.
 * A second signal force-exits and does not start a second close.
 */
export function createShutdownHandler(deps: ShutdownDeps): () => void {
  let started = false;
  let exiting = false;
  let poolCloseStarted = false;

  const finish = (code: number) => {
    if (exiting) return;
    exiting = true;
    deps.exit(code);
  };

  const closePoolOnce = async () => {
    if (poolCloseStarted) return;
    poolCloseStarted = true;
    await deps.closePool();
  };

  return () => {
    if (started) {
      finish(1);
      return;
    }
    started = true;
    void (async () => {
      try {
        await deps.closeServer();
        if (exiting) return;
        await deps.stopBoss();
        if (exiting) return;
        await closePoolOnce();
        if (exiting) return;
        finish(0);
      } catch (err) {
        if (exiting) return;
        deps.logError(err);
        try {
          await closePoolOnce();
        } catch {
          // The pool may already be closed, or end failed. Do not call it again.
        }
        if (exiting) return;
        finish(1);
      }
    })();
  };
}

export function installGracefulShutdown(
  deps: ShutdownDeps & { signals?: EventEmitter },
): void {
  const emitter = deps.signals ?? process;
  const handler = createShutdownHandler(deps);
  emitter.on("SIGTERM", handler);
  emitter.on("SIGINT", handler);
}
