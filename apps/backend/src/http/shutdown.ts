import type { EventEmitter } from "node:events";

export type ShutdownDeps = {
  closeServer: () => Promise<void>;
  stopBoss: () => Promise<void>;
  closePool: () => Promise<void>;
  exit: (code: number) => void;
  logError: (err: unknown) => void;
};

/** Close HTTP, then pg-boss, then the pool. A second signal does not start a second pass. */
export function createShutdownHandler(deps: ShutdownDeps): () => void {
  let started = false;
  return () => {
    if (started) return;
    started = true;
    void (async () => {
      try {
        await deps.closeServer();
        await deps.stopBoss();
        await deps.closePool();
        deps.exit(0);
      } catch (err) {
        deps.logError(err);
        try {
          await deps.closePool();
        } catch {
          // The pool may already be closed. Exit is the remaining step.
        }
        deps.exit(1);
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
