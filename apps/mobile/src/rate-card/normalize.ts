/** English-first exact-match key: trim, collapse whitespace, lowercase. No fuzzy/stemming. */
export function normalizeRateCardName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function displayRateCardName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function rateCardTradeKey(trade: string | null | undefined): string {
  if (typeof trade !== 'string') {
    return '';
  }
  return trade.trim();
}
