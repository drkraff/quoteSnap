import {
  canHardDeleteLocalQuote,
  DELETE_LOCAL_QUOTE_CONFIRM_MESSAGE,
  DELETE_LOCAL_QUOTE_CONFIRM_TITLE,
  hasMeaningfulLineItems,
  quoteRowSwipeAction,
  shouldDropQueueItemForDeletedLocalQuote,
} from './delete-local-quote';

describe('hasMeaningfulLineItems', () => {
  it('treats empty, missing, and invalid JSON as empty', () => {
    expect(hasMeaningfulLineItems(null)).toBe(false);
    expect(hasMeaningfulLineItems(undefined)).toBe(false);
    expect(hasMeaningfulLineItems('')).toBe(false);
    expect(hasMeaningfulLineItems('[]')).toBe(false);
    expect(hasMeaningfulLineItems('{')).toBe(false);
  });

  it('counts a named or priced catalog line as meaningful', () => {
    expect(
      hasMeaningfulLineItems(
        JSON.stringify([{ catalogItemId: 'p', name: 'Pipe', quantity: 1, unitPriceCents: 100 }]),
      ),
    ).toBe(true);
  });
});

describe('canHardDeleteLocalQuote', () => {
  const emptyLocal = {
    serverId: null as string | null,
    status: 'draft_local',
    totalCents: 0,
    lineItemsJson: '[]',
  };

  it('allows a never-synced empty Manual Quote draft', () => {
    expect(canHardDeleteLocalQuote(emptyLocal)).toBe(true);
    expect(canHardDeleteLocalQuote({ ...emptyLocal, serverId: undefined, lineItemsJson: undefined })).toBe(
      true,
    );
    expect(canHardDeleteLocalQuote({ ...emptyLocal, serverId: '' })).toBe(true);
  });

  it('never allows a row that has a serverId (hydrate would resurrect it)', () => {
    expect(canHardDeleteLocalQuote({ ...emptyLocal, serverId: 'srv-q1' })).toBe(false);
    expect(canHardDeleteLocalQuote({ ...emptyLocal, serverId: '  srv-q1  ' })).toBe(false);
  });

  it('does not delete voice, queued, or sent quotes', () => {
    expect(canHardDeleteLocalQuote({ ...emptyLocal, status: 'ai_processing' })).toBe(false);
    expect(canHardDeleteLocalQuote({ ...emptyLocal, status: 'draft_queued' })).toBe(false);
    expect(canHardDeleteLocalQuote({ ...emptyLocal, status: 'ai_failed' })).toBe(false);
  });

  it('does not delete a local draft that already has a total or lines', () => {
    expect(canHardDeleteLocalQuote({ ...emptyLocal, totalCents: 1500 })).toBe(false);
    expect(
      canHardDeleteLocalQuote({
        ...emptyLocal,
        lineItemsJson: JSON.stringify([
          { catalogItemId: 'p', name: 'Pipe', quantity: 1, unitPriceCents: 100 },
        ]),
      }),
    ).toBe(false);
  });
});

describe('quoteRowSwipeAction', () => {
  it('shows Delete instead of Archive/Unarchive when the row is local-only junk', () => {
    expect(quoteRowSwipeAction('active', true)).toBe('delete');
    expect(quoteRowSwipeAction('archived', true)).toBe('delete');
  });

  it('keeps Archive on the active list and Unarchive on Archived', () => {
    expect(quoteRowSwipeAction('active', false)).toBe('archive');
    expect(quoteRowSwipeAction('archived', false)).toBe('unarchive');
  });
});

describe('shouldDropQueueItemForDeletedLocalQuote', () => {
  const quoteId = 'local-q1';
  const draftIds = ['draft-1'];

  it('drops pending quote create/update and matching draft/audio rows', () => {
    expect(
      shouldDropQueueItemForDeletedLocalQuote(
        { entityType: 'quote', entityId: quoteId, status: 'pending' },
        quoteId,
        draftIds,
      ),
    ).toBe(true);
    expect(
      shouldDropQueueItemForDeletedLocalQuote(
        { entityType: 'draft', entityId: 'draft-1', status: 'dead_letter' },
        quoteId,
        draftIds,
      ),
    ).toBe(true);
    expect(
      shouldDropQueueItemForDeletedLocalQuote(
        { entityType: 'audio', entityId: quoteId, status: 'failed' },
        quoteId,
        draftIds,
      ),
    ).toBe(true);
  });

  it('leaves in-progress items and unrelated entities alone', () => {
    expect(
      shouldDropQueueItemForDeletedLocalQuote(
        { entityType: 'quote', entityId: quoteId, status: 'in_progress' },
        quoteId,
        draftIds,
      ),
    ).toBe(false);
    expect(
      shouldDropQueueItemForDeletedLocalQuote(
        { entityType: 'catalog_item', entityId: quoteId, status: 'pending' },
        quoteId,
        draftIds,
      ),
    ).toBe(false);
    expect(
      shouldDropQueueItemForDeletedLocalQuote(
        { entityType: 'quote', entityId: 'other', status: 'pending' },
        quoteId,
        draftIds,
      ),
    ).toBe(false);
  });
});

describe('delete copy', () => {
  it('confirms a device-only delete and does not talk about archive or the server', () => {
    expect(DELETE_LOCAL_QUOTE_CONFIRM_TITLE).toBe('Delete this draft?');
    expect(DELETE_LOCAL_QUOTE_CONFIRM_MESSAGE.toLowerCase()).toContain('never synced');
    expect(DELETE_LOCAL_QUOTE_CONFIRM_MESSAGE.toLowerCase()).toContain('this device');
    expect(DELETE_LOCAL_QUOTE_CONFIRM_MESSAGE.toLowerCase()).not.toContain('archive');
    expect(DELETE_LOCAL_QUOTE_CONFIRM_MESSAGE.toLowerCase()).not.toContain('server');
  });
});
