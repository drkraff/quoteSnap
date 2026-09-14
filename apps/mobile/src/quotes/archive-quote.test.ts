import {
  ARCHIVE_QUOTE_CONFIRM_MESSAGE,
  ARCHIVE_QUOTE_CONFIRM_TITLE,
  archiveQuoteSyncPayload,
  shouldArchiveLocalQuoteOnHydrate,
} from './archive-quote';

describe('archiveQuoteSyncPayload', () => {
  it('enqueues the catalog-style isArchived flag, not a status write', () => {
    expect(archiveQuoteSyncPayload()).toEqual({ isArchived: true });
  });
});

describe('archive copy', () => {
  it('asks to archive and does not promise a restore screen', () => {
    expect(ARCHIVE_QUOTE_CONFIRM_TITLE).toBe('Archive this quote?');
    expect(ARCHIVE_QUOTE_CONFIRM_MESSAGE.toLowerCase()).toContain('leave your quotes list');
    expect(ARCHIVE_QUOTE_CONFIRM_MESSAGE.toLowerCase()).not.toContain('delete forever');
    expect(ARCHIVE_QUOTE_CONFIRM_MESSAGE.toLowerCase()).not.toContain('show archived');
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
