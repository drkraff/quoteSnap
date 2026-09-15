import {
  ARCHIVED_QUOTES_EMPTY_BODY,
  ARCHIVED_QUOTES_EMPTY_HEADING,
  ARCHIVED_QUOTES_HEADER_TITLE,
  QUOTES_LIST_MODE_ACTIVE_LABEL,
  QUOTES_LIST_MODE_ARCHIVED_LABEL,
  quotesForListMode,
} from './list-mode';

describe('quotes list mode copy', () => {
  it('labels the Archived toggle without promising hard delete', () => {
    expect(QUOTES_LIST_MODE_ACTIVE_LABEL).toBe('Quotes');
    expect(QUOTES_LIST_MODE_ARCHIVED_LABEL).toBe('Archived');
    expect(ARCHIVED_QUOTES_HEADER_TITLE).toBe('Archived');
    expect(ARCHIVED_QUOTES_EMPTY_HEADING).toBe('No archived quotes');
    expect(ARCHIVED_QUOTES_EMPTY_BODY.toLowerCase()).toContain('unarchive');
    expect(ARCHIVED_QUOTES_EMPTY_BODY.toLowerCase()).not.toContain('delete');
  });
});

describe('quotesForListMode', () => {
  it('stays empty when switching Quotes ↔ Archived with zero rows', () => {
    expect(quotesForListMode([], 'active')).toEqual([]);
    expect(quotesForListMode([], 'archived')).toEqual([]);
  });

  it('does not invent a quote, price, or customer phone for the other list', () => {
    const onlyActive = [
      {
        id: 'q1',
        isArchived: false,
        totalCents: 0,
        customerPhone: null as string | null,
      },
    ];
    expect(quotesForListMode(onlyActive, 'archived')).toEqual([]);
    expect(quotesForListMode(onlyActive, 'active')).toEqual(onlyActive);
    expect(quotesForListMode(onlyActive, 'active')[0]?.customerPhone).toBeNull();
    expect(quotesForListMode(onlyActive, 'active')[0]?.totalCents).toBe(0);

    const onlyArchived = [{ id: 'q2', isArchived: true, totalCents: 1500, customerPhone: '+15555550100' }];
    expect(quotesForListMode(onlyArchived, 'active')).toEqual([]);
    expect(quotesForListMode(onlyArchived, 'archived')).toEqual(onlyArchived);
  });

  it('treats null is_archived as active, matching the Quotes query', () => {
    const local = [{ id: 'q3', isArchived: null as boolean | null, totalCents: 0 }];
    expect(quotesForListMode(local, 'active')).toEqual(local);
    expect(quotesForListMode(local, 'archived')).toEqual([]);
  });
});
