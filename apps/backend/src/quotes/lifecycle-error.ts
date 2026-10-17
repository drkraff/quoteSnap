import { QUOTE_MONEY_FROZEN_ERROR } from "./statuses.js";

/**
 * Text of the 031 triggers. Hand-written match: no schema library.
 * A generic CHECK failure (bad status name, bad cents) must not become a 409.
 */
const FROZEN_STATUS_THAW = "frozen quote cannot return to draft or voice";
const FROZEN_LINE_WRITE = "quote line items are write-once after send";

/** 409 when a frozen quote is sent back to draft or voice processing. */
export const QUOTE_STATUS_LOCKED_ERROR =
  "A sent quote cannot return to draft or voice processing";

function errorText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return "";
}

/**
 * Maps a 031 trigger rejection to the API string. Returns null for every
 * other failure, including other check_violation errors.
 */
export function quoteLifecycleConflict(err: unknown): string | null {
  const message = errorText(err);
  if (message.includes(FROZEN_STATUS_THAW)) return QUOTE_STATUS_LOCKED_ERROR;
  if (message.includes(FROZEN_LINE_WRITE)) return QUOTE_MONEY_FROZEN_ERROR;
  return null;
}
