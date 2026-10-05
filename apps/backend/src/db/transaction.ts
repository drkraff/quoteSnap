import { errorSummary, log } from "../log/logger.js";
import { redactString } from "../log/redact.js";

export type TxQueryFn = (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

export type TxClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  release: (err?: Error) => void;
  on?: (event: "error", listener: (err: Error) => void) => void;
  removeListener?: (event: "error", listener: (err: Error) => void) => void;
};

function loggedError(err: unknown): { name: string; message: string } {
  const summary = errorSummary(err);
  return { name: summary.name, message: redactString(summary.message) };
}

/**
 * One pooled client, BEGIN/COMMIT, ROLLBACK on failure.
 * A checked-out client's `error` event is logged so it does not become an
 * uncaught exception. A failed ROLLBACK destroys the client instead of
 * returning it to the pool.
 */
export async function runTransaction<T>(
  connect: () => Promise<TxClient>,
  fn: (query: TxQueryFn) => Promise<T>,
): Promise<T> {
  const client = await connect();
  let released = false;
  const releaseOnce = (err?: Error) => {
    if (released) return;
    released = true;
    client.release(err);
  };
  const onError = (err: Error) => {
    log("error", { msg: "active_client_error", error: loggedError(err) });
  };
  client.on?.("error", onError);
  try {
    await client.query("BEGIN");
    const result = await fn((text, params) => client.query(text, params));
    await client.query("COMMIT");
    return result;
  } catch (err) {
    let rollbackFailed = false;
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      rollbackFailed = true;
      log("error", {
        msg: "transaction_rollback_failed",
        error: loggedError(rollbackErr),
      });
    }
    if (rollbackFailed) {
      releaseOnce(err instanceof Error ? err : new Error("transaction failed"));
    }
    throw err;
  } finally {
    client.removeListener?.("error", onError);
    releaseOnce();
  }
}
