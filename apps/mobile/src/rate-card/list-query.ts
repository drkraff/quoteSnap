import { normalizeRateCardName } from './normalize';

export const RATE_CARD_LIST_PAGE_SIZE = 100;

export type RateCardListQuery = {
  limit?: number;
  offset?: number;
  q?: string;
  unit?: string;
};

/** Normalized substring for GET /rate-card?q=. Empty means unfiltered list. */
export function rateCardListSearchParam(raw: string | undefined): string | undefined {
  if (raw == null) {
    return undefined;
  }
  const q = normalizeRateCardName(raw);
  return q === '' ? undefined : q;
}

/** Path for GET contractor list. Must not send `name` (that is exact lookup). */
export function rateCardListPath(query?: RateCardListQuery): string {
  const params = new URLSearchParams();
  if (query?.limit != null) {
    params.set('limit', String(query.limit));
  }
  if (query?.offset != null) {
    params.set('offset', String(query.offset));
  }
  const q = rateCardListSearchParam(query?.q);
  if (q) {
    params.set('q', q);
  }
  if (query?.unit) {
    params.set('unit', query.unit);
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
