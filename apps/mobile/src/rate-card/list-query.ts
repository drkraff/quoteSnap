export const RATE_CARD_LIST_PAGE_SIZE = 100;

/** Path for GET contractor list. Must not send `name` (that is exact lookup). */
export function rateCardListPath(query?: { limit?: number; offset?: number }): string {
  const params = new URLSearchParams();
  if (query?.limit != null) {
    params.set('limit', String(query.limit));
  }
  if (query?.offset != null) {
    params.set('offset', String(query.offset));
  }
  const qs = params.toString();
  return qs ? `/rate-card?${qs}` : '/rate-card';
}

export function nextRateCardListOffset(loaded: number, total: number): number | null {
  if (loaded >= total) {
    return null;
  }
  return loaded;
}
