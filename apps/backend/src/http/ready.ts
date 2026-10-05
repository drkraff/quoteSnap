export const READY_PROBE_TIMEOUT_MS = 2_000;

export type ReadyClient = {
  query: (sql: string) => Promise<unknown>;
  release: (err?: Error) => void;
  on?: (event: "error", listener: (err: Error) => void) => void;
  removeListener?: (event: "error", listener: (err: Error) => void) => void;
};

/** `SELECT 1` with a short timeout. Callers must not put the error text on the wire. */
export async function probeDatabase(
  connect: () => Promise<ReadyClient>,
  timeoutMs = READY_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  let client: ReadyClient | undefined;
  let released = false;
  const release = (err?: Error) => {
    if (!client || released) return;
    released = true;
    try {
      client.release(err);
    } catch {
      // Already released. The probe result is what the caller needs.
    }
  };
  const onError = () => {};
  let timer: NodeJS.Timeout | undefined;
  let abandoned = false;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abandoned = true;
      reject(new Error("timeout"));
    }, timeoutMs);
  });
  // A connect that loses the race can still resolve. Swallow that rejection
  // so it does not become an unhandledRejection after the probe has moved on.
  timeout.catch(() => {});
  try {
    const connected = await Promise.race([
      connect()
        .then((next) => {
          if (abandoned) {
            try {
              next.release(new Error("ready_check_failed"));
            } catch {
              // The late client could not be returned. The probe already failed.
            }
            return undefined;
          }
          return next;
        })
        .catch(() => undefined),
      timeout,
    ]);
    if (!connected) return false;
    client = connected;
    client.on?.("error", onError);
    await Promise.race([client.query("SELECT 1"), timeout]);
    release();
    return true;
  } catch {
    release(new Error("ready_check_failed"));
    return false;
  } finally {
    if (timer) clearTimeout(timer);
    client?.removeListener?.("error", onError);
  }
}
