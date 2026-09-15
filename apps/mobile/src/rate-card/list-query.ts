import { parseCatalogUnit } from '../catalog/units';
import { normalizeRateCardName } from './normalize';

export const RATE_CARD_LIST_PAGE_SIZE = 100;

export type RateCardListQuery = {
  limit?: number;
  offset?: number;
  q?: string;
  unit?: string;
};

export type MyRatesEmptyKind = 'none' | 'no-rates' | 'no-matches';

/** Normalized substring for GET /rate-card?q=. Empty means unfiltered list. */
export function rateCardListSearchParam(raw: string | undefined): string | undefined {
  if (raw == null) {
    return undefined;
  }
  const q = normalizeRateCardName(raw);
  return q === '' ? undefined : q;
}

/**
 * Optional catalog unit for GET /rate-card?unit=. Invalid / blank is omitted —
 * never invent a unit or send a junk filter.
 */
export function rateCardListUnitParam(raw: string | undefined | null): string | undefined {
  if (raw == null) {
    return undefined;
  }
  return parseCatalogUnit(raw) ?? undefined;
}

export function rateCardListHasFilter(query?: Pick<RateCardListQuery, 'q' | 'unit'>): boolean {
  return Boolean(rateCardListSearchParam(query?.q) || rateCardListUnitParam(query?.unit));
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
  const unit = rateCardListUnitParam(query?.unit);
  if (unit) {
    params.set('unit', unit);
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

/**
 * Empty list UX. Filtered miss is a calm no-match — never a suggested row.
 * Unfiltered empty is the “no rates yet” import hint.
 */
export function myRatesEmptyKind(args: {
  loading?: boolean;
  error?: boolean;
  entryCount: number;
  q?: string;
  unit?: string;
}): MyRatesEmptyKind {
  if (args.loading || args.error || args.entryCount > 0) {
    return 'none';
  }
  return rateCardListHasFilter({ q: args.q, unit: args.unit }) ? 'no-matches' : 'no-rates';
}

export function rateCardDeleteEnqueuePayload(entry: { id: string; displayName: string }): {
  entityType: 'rate_card';
  entityId: string;
  action: 'delete';
  payload: { id: string; name: string };
} {
  return {
    entityType: 'rate_card',
    entityId: entry.id,
    action: 'delete',
    payload: { id: entry.id, name: entry.displayName },
  };
}

/** Drop one row. Remaining prices stay as stored — never invent a replacement. */
export function removeRateCardListEntry<T extends { id: string }>(
  entries: readonly T[],
  id: string,
): T[] {
  return entries.filter((row) => row.id !== id);
}

/**
 * Apply a GET /rate-card page while delete is still queued.
 * Hidden ids stay out of the list until the server page no longer returns them.
 * Never fabricates rows or cents.
 */
export function mergeRateCardListPage<T extends { id: string }>(args: {
  appending: boolean;
  current: readonly T[];
  pageEntries: readonly T[];
  pageTotal: number;
  hiddenIds: ReadonlySet<string>;
}): { entries: T[]; total: number; hiddenIds: Set<string> } {
  const hiddenIds = new Set(args.hiddenIds);
  if (!args.appending) {
    for (const id of [...hiddenIds]) {
      if (!args.pageEntries.some((row) => row.id === id)) {
        hiddenIds.delete(id);
      }
    }
  }
  const visiblePage = args.pageEntries.filter((row) => !hiddenIds.has(row.id));
  const entries = args.appending ? [...args.current, ...visiblePage] : [...visiblePage];
  const hiddenOnPage = args.pageEntries.reduce(
    (count, row) => (hiddenIds.has(row.id) ? count + 1 : count),
    0,
  );
  return {
    entries,
    total: Math.max(0, args.pageTotal - hiddenOnPage),
    hiddenIds,
  };
}
