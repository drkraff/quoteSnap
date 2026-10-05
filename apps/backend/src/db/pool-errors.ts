import { errorSummary } from "../log/logger.js";
import { redactString } from "../log/redact.js";

export type IdleErrorWriter = (
  level: "error",
  fields: { msg: string; error: { name: string; message: string } },
) => void;

/** Idle pg clients emit on the pool. Swallowing that event keeps the process up. */
export function attachIdleClientErrorHandler(
  pool: { on: (event: "error", listener: (err: Error) => void) => void },
  write: IdleErrorWriter,
): void {
  pool.on("error", (err: Error) => {
    const summary = errorSummary(err);
    write("error", {
      msg: "idle_client_error",
      error: { name: summary.name, message: redactString(summary.message) },
    });
  });
}
