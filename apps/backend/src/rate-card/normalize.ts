/** English-first exact-match key: trim, collapse whitespace, lowercase. No fuzzy/stemming. */
export function normalizeRateCardName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Preserve contractor casing; still trim + collapse whitespace for display. */
export function displayRateCardName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** NULL/blank trade is the same key (empty trade_key). */
export function rateCardTradeKey(trade: string | null | undefined): string {
  if (typeof trade !== "string") {
    return "";
  }
  return trade.trim();
}
