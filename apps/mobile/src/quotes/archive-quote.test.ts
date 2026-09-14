import {
  ARCHIVE_QUOTE_CONFIRM_MESSAGE,
  ARCHIVE_QUOTE_CONFIRM_TITLE,
  UNARCHIVE_QUOTE_CONFIRM_MESSAGE,
  UNARCHIVE_QUOTE_CONFIRM_TITLE,
  archiveQuoteSyncPayload,
  hydrateArchivedFlag,
  isQuoteUnarchiveQueueItem,
  mergeQuoteHydrateLists,
  shouldArchiveLocalQuoteOnHydrate,
  unarchiveQuoteSyncPayload,
} from './archive-quote';

describe('archiveQuoteSyncPayload', () => {
  it('enqueues the catalog-style isArchived flag, not a status write', () => {
    expect(archiveQuoteSyncPayload()).toEqual({ isArchived: true });
  });
});

describe('unarchiveQuoteSyncPayload', () => {
  it('enqueues isArchived false for PATCH /quotes/:id/archive', () => {
    expect(unarchiveQuoteSyncPayload()).toEqual({ isArchived: false });
  });
});

describe('archive copy', () => {
  it('asks to archive and points at the Archived screen', () => {
    expect(ARCHIVE_QUOTE_CONFIRM_TITLE).toBe('Archive this quote?');
    expect(ARCHIVE_QUOTE_CONFIRM_MESSAGE.toLowerCase()).toContain('leave your quotes list');
    expect(ARCHIVE_QUOTE_CONFIRM_MESSAGE.toLowerCase()).toContain('archived');
    expect(ARCHIVE_QUOTE_CONFIRM_MESSAGE.toLowerCase()).not.toContain('delete forever');
  });
});

describe('unarchive copy', () => {
  it('asks to restore to the Quotes list', () => {
    expect(UNARCHIVE_QUOTE_CONFIRM_TITLE).toBe('Unarchive this quote?');
    expect(UNARCHIVE_QUOTE_CONFIRM_MESSAGE.toLowerCase()).toContain('quotes list');
    expect(UNARCHIVE_QUOTE_CONFIRM_MESSAGE.toLowerCase()).not.toContain('delete');
  });
});

describe('mergeQuoteHydrateLists', () => {
  it('keeps archived rows and lets the active list win on id collision', () => {
    const merged = mergeQuoteHydrateLists(
      [{ id: 'keep', isArchived: false }],
      [
        { id: 'keep', isArchived: true },
        { id: 'old', isArchived: true },
      ],
    );
    expect(merged).toHaveLength(2);
    expect(merged.find((quote) => quote.id === 'keep')?.isArchived).toBe(false);
    expect(merged.find((quote) => quote.id === 'old')?.isArchived).toBe(true);
  });
});

describe('isQuoteUnarchiveQueueItem', () => {
  it('matches a quote update with isArchived false', () => {
    expect(
      isQuoteUnarchiveQueueItem({
        entityType: 'quote',
        action: 'update',
        payloadJson: JSON.stringify({ isArchived: false }),
      }),
    ).toBe(true);
  });

  it('ignores archive, catalog, and malformed payloads', () => {
    expect(
      isQuoteUnarchiveQueueItem({
        entityType: 'quote',
        action: 'update',
        payloadJson: JSON.stringify({ isArchived: true }),
      }),
    ).toBe(false);
    expect(
      isQuoteUnarchiveQueueItem({
        entityType: 'catalog_item',
        action: 'update',
        payloadJson: JSON.stringify({ isArchived: false }),
      }),
    ).toBe(false);
    expect(
      isQuoteUnarchiveQueueItem({
        entityType: 'quote',
        action: 'update',
        payloadJson: '{',
      }),
    ).toBe(false);
  });
});

describe('hydrateArchivedFlag', () => {
  it('keeps a newer local unarchive instead of a stale archived GET', () => {
    expect(
      hydrateArchivedFlag({
        localIsArchived: false,
        serverIsArchived: true,
        localUpdatedAt: '2026-09-14T12:00:00.000Z',
        serverUpdatedAt: '2026-09-14T11:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('applies a newer server archive (other device)', () => {
    expect(
      hydrateArchivedFlag({
        localIsArchived: false,
        serverIsArchived: true,
        localUpdatedAt: '2026-09-14T11:00:00.000Z',
        serverUpdatedAt: '2026-09-14T12:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('applies a server unarchive', () => {
    expect(
      hydrateArchivedFlag({
        localIsArchived: true,
        serverIsArchived: false,
        localUpdatedAt: '2026-09-14T11:00:00.000Z',
        serverUpdatedAt: '2026-09-14T12:00:00.000Z',
      }),
    ).toBe(false);
  });
});

describe('shouldArchiveLocalQuoteOnHydrate', () => {
  const pulled = new Set(['srv-keep']);

  it('hides a server-backed quote omitted from the active list', () => {
    expect(
      shouldArchiveLocalQuoteOnHydrate({
        serverId: 'srv-old-test',
        isArchived: false,
        blocked: false,
        pulledServerIds: pulled,
      }),
    ).toBe(true);
  });

  it('leaves local-only quotes alone (no serverId to orphan)', () => {
    expect(
      shouldArchiveLocalQuoteOnHydrate({
        serverId: null,
        isArchived: false,
        blocked: false,
        pulledServerIds: pulled,
      }),
    ).toBe(false);
  });

  it('does not hide a quote still in the active pull', () => {
    expect(
      shouldArchiveLocalQuoteOnHydrate({
        serverId: 'srv-keep',
        isArchived: false,
        blocked: false,
        pulledServerIds: pulled,
      }),
    ).toBe(false);
  });

  it('skips a blocked queue item so SYNC-05 pending writes stay in charge', () => {
    expect(
      shouldArchiveLocalQuoteOnHydrate({
        serverId: 'srv-old-test',
        isArchived: false,
        blocked: true,
        pulledServerIds: pulled,
      }),
    ).toBe(false);
  });

  it('is a no-op when the local row is already archived', () => {
    expect(
      shouldArchiveLocalQuoteOnHydrate({
        serverId: 'srv-old-test',
        isArchived: true,
        blocked: false,
        pulledServerIds: pulled,
      }),
    ).toBe(false);
  });
});
