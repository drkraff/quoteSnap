import {
  mergeRateCardListPage,
  myRatesEmptyKind,
  nextRateCardListOffset,
  rateCardDeleteEnqueuePayload,
  rateCardListHasFilter,
  rateCardListPath,
  rateCardListSearchParam,
  rateCardListUnitParam,
  RATE_CARD_LIST_PAGE_SIZE,
  removeRateCardListEntry,
} from './list-query';

describe('rateCardListPath', () => {
  it('omits name so GET stays a list, not exact lookup', () => {
    expect(rateCardListPath()).toBe('/rate-card');
    expect(rateCardListPath({ limit: RATE_CARD_LIST_PAGE_SIZE, offset: 0 })).toBe(
      '/rate-card?limit=100&offset=0',
    );
    expect(rateCardListPath()).not.toContain('name=');
    expect(rateCardListPath({ limit: 25, offset: 50 })).not.toContain('unit=');
  });

  it('sends normalized q for substring filter without name=', () => {
    expect(rateCardListPath({ q: '  Copper   PIPE ' })).toBe('/rate-card?q=copper+pipe');
    expect(
      rateCardListPath({
        limit: RATE_CARD_LIST_PAGE_SIZE,
        offset: 0,
        q: 'pipe',
        unit: 'foot',
      }),
    ).toBe('/rate-card?limit=100&offset=0&q=pipe&unit=foot');
    expect(rateCardListPath({ q: 'pipe' })).not.toContain('name=');
    expect(rateCardListPath({ q: '   ' })).toBe('/rate-card');
  });

  it('sends optional unit alone and maps catalog aliases', () => {
    expect(rateCardListPath({ unit: 'foot' })).toBe('/rate-card?unit=foot');
    expect(rateCardListPath({ unit: 'per foot' })).toBe('/rate-card?unit=foot');
    expect(rateCardListPath({ unit: '  ' })).toBe('/rate-card');
    expect(rateCardListPath({ unit: 'furlong' })).toBe('/rate-card');
    expect(rateCardListPath({ unit: 'furlong' })).not.toContain('unit=');
  });
});

describe('rateCardListSearchParam', () => {
  it('trims and lowercases like the rate-card name key', () => {
    expect(rateCardListSearchParam('  PIPE ')).toBe('pipe');
    expect(rateCardListSearchParam('')).toBeUndefined();
    expect(rateCardListSearchParam('   ')).toBeUndefined();
  });
});

describe('rateCardListUnitParam', () => {
  it('keeps catalog units and drops junk so the list never invents a filter', () => {
    expect(rateCardListUnitParam('hour')).toBe('hour');
    expect(rateCardListUnitParam('per vent')).toBe('each');
    expect(rateCardListUnitParam('')).toBeUndefined();
    expect(rateCardListUnitParam('   ')).toBeUndefined();
    expect(rateCardListUnitParam('ea')).toBeUndefined();
    expect(rateCardListUnitParam(null)).toBeUndefined();
  });
});

describe('rateCardListHasFilter', () => {
  it('is true for search, unit, or both', () => {
    expect(rateCardListHasFilter()).toBe(false);
    expect(rateCardListHasFilter({ q: '  ' })).toBe(false);
    expect(rateCardListHasFilter({ unit: 'nope' })).toBe(false);
    expect(rateCardListHasFilter({ q: 'pipe' })).toBe(true);
    expect(rateCardListHasFilter({ unit: 'foot' })).toBe(true);
    expect(rateCardListHasFilter({ q: 'pipe', unit: 'foot' })).toBe(true);
  });
});

describe('nextRateCardListOffset', () => {
  it('stops when the loaded page covers total', () => {
    expect(nextRateCardListOffset(0, 0)).toBeNull();
    expect(nextRateCardListOffset(100, 100)).toBeNull();
    expect(nextRateCardListOffset(100, 250)).toBe(100);
  });
});

describe('myRatesEmptyKind', () => {
  it('uses no-rates only when the unfiltered list is empty', () => {
    expect(myRatesEmptyKind({ entryCount: 0 })).toBe('no-rates');
    expect(myRatesEmptyKind({ entryCount: 2 })).toBe('none');
    expect(myRatesEmptyKind({ entryCount: 0, loading: true })).toBe('none');
    expect(myRatesEmptyKind({ entryCount: 0, error: true })).toBe('none');
  });

  it('shows a calm no-match for empty search or unit filter and never invents rows', () => {
    expect(myRatesEmptyKind({ entryCount: 0, q: 'pipe' })).toBe('no-matches');
    expect(myRatesEmptyKind({ entryCount: 0, unit: 'hour' })).toBe('no-matches');
    expect(myRatesEmptyKind({ entryCount: 0, q: 'pipe', unit: 'foot' })).toBe('no-matches');
    expect(myRatesEmptyKind({ entryCount: 1, q: 'pipe' })).toBe('none');
    expect(myRatesEmptyKind({ entryCount: 0, q: '   ', unit: 'furlong' })).toBe('no-rates');
  });
});

const PIPE = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Copper Pipe',
  unitPriceCents: 4500,
};
const LABOR = {
  id: '22222222-2222-4222-8222-222222222222',
  displayName: 'Labor',
  unitPriceCents: 12500,
};

describe('removeRateCardListEntry', () => {
  it('drops the row and leaves remaining prices untouched', () => {
    const next = removeRateCardListEntry([PIPE, LABOR], PIPE.id);
    expect(next).toEqual([LABOR]);
    expect(next[0]?.unitPriceCents).toBe(12500);
    expect(removeRateCardListEntry([], PIPE.id)).toEqual([]);
  });
});

describe('rateCardDeleteEnqueuePayload', () => {
  it('deletes by id without inventing a replacement price', () => {
    expect(rateCardDeleteEnqueuePayload(PIPE)).toEqual({
      entityType: 'rate_card',
      entityId: PIPE.id,
      action: 'delete',
      payload: { id: PIPE.id, name: 'Copper Pipe' },
    });
  });
});

describe('mergeRateCardListPage', () => {
  it('hides a pending delete on refresh and does not invent replacement rows', () => {
    const merged = mergeRateCardListPage({
      appending: false,
      current: [PIPE, LABOR],
      pageEntries: [PIPE, LABOR],
      pageTotal: 2,
      hiddenIds: new Set([PIPE.id]),
    });
    expect(merged.entries).toEqual([LABOR]);
    expect(merged.total).toBe(1);
    expect(merged.hiddenIds.has(PIPE.id)).toBe(true);
    expect(merged.entries.map((row) => row.unitPriceCents)).toEqual([12500]);
  });

  it('clears the hidden id once the refreshed page no longer returns it', () => {
    const merged = mergeRateCardListPage({
      appending: false,
      current: [LABOR],
      pageEntries: [LABOR],
      pageTotal: 1,
      hiddenIds: new Set([PIPE.id]),
    });
    expect(merged.entries).toEqual([LABOR]);
    expect(merged.total).toBe(1);
    expect(merged.hiddenIds.size).toBe(0);
  });

  it('keeps an empty filtered page empty — never invents a row or price', () => {
    const merged = mergeRateCardListPage({
      appending: false,
      current: [PIPE],
      pageEntries: [],
      pageTotal: 0,
      hiddenIds: new Set(),
    });
    expect(merged.entries).toEqual([]);
    expect(merged.total).toBe(0);
  });
});

describe('empty filter after delete', () => {
  it('shows no-match when the last filtered row is removed', () => {
    const remaining = removeRateCardListEntry([PIPE], PIPE.id);
    expect(remaining).toEqual([]);
    expect(myRatesEmptyKind({ entryCount: remaining.length, q: 'pipe' })).toBe('no-matches');
    expect(myRatesEmptyKind({ entryCount: remaining.length, unit: 'foot' })).toBe('no-matches');
  });
});
