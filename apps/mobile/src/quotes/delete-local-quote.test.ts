import fs from 'fs';
import path from 'path';
import {
  canHardDeleteLocalQuote,
  canHardDeleteLocalQuoteWithDrafts,
  DELETE_LOCAL_QUOTE_CONFIRM_MESSAGE,
  DELETE_LOCAL_QUOTE_CONFIRM_TITLE,
  firstDraftLineItemsJson,
  hardDeleteEmptyLocalQuote,
  hasMeaningfulLineItems,
  indexFirstDraftLineItemsJson,
  quoteRowSwipeAction,
  removeQuoteListEntry,
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
    expect(
      hasMeaningfulLineItems(JSON.stringify([{ name: 'Pipe', quantity: 0, unitPriceCents: 0 }])),
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

  it('does not delete a $0 local draft with named blank-price lines', () => {
    expect(
      canHardDeleteLocalQuote({
        ...emptyLocal,
        lineItemsJson: JSON.stringify([{ name: 'Copper 90', quantity: 1, unitPriceCents: 0 }]),
      }),
    ).toBe(false);
  });
});

describe('canHardDeleteLocalQuoteWithDrafts (list swipe = destroy gate)', () => {
  const localZero = {
    serverId: null as string | null,
    status: 'draft_local',
    totalCents: 0,
  };
  const namedBlankJson = JSON.stringify([
    { name: 'Copper 90', quantity: 1, unitPriceCents: 0 },
  ]);

  it('never-synced $0 draft with named blank-price lines is Archive, not Delete', () => {
    const drafts = [{ lineItemsJson: namedBlankJson }];
    const canDelete = canHardDeleteLocalQuoteWithDrafts(localZero, drafts);
    expect(canDelete).toBe(false);
    expect(quoteRowSwipeAction('active', canDelete)).toBe('archive');
    expect(quoteRowSwipeAction('archived', canDelete)).toBe('unarchive');
  });

  it('omitting lineItemsJson would wrongly show Delete — swipe must pass draft JSON', () => {
    expect(canHardDeleteLocalQuote(localZero)).toBe(true);
    expect(quoteRowSwipeAction('active', canHardDeleteLocalQuote(localZero))).toBe('delete');
    expect(
      canHardDeleteLocalQuoteWithDrafts(localZero, [{ lineItemsJson: namedBlankJson }]),
    ).toBe(false);
  });

  it('still offers Delete for a never-synced empty draft', () => {
    expect(canHardDeleteLocalQuoteWithDrafts(localZero, [{ lineItemsJson: '[]' }])).toBe(true);
    expect(canHardDeleteLocalQuoteWithDrafts(localZero, [])).toBe(true);
    expect(
      quoteRowSwipeAction('active', canHardDeleteLocalQuoteWithDrafts(localZero, [])),
    ).toBe('delete');
  });

  it('serverId stays Archive even when drafts are empty', () => {
    expect(
      canHardDeleteLocalQuoteWithDrafts(
        { ...localZero, serverId: 'srv-q1' },
        [{ lineItemsJson: '[]' }],
      ),
    ).toBe(false);
    expect(
      quoteRowSwipeAction(
        'active',
        canHardDeleteLocalQuoteWithDrafts(
          { ...localZero, serverId: 'srv-q1' },
          [{ lineItemsJson: '[]' }],
        ),
      ),
    ).toBe('archive');
  });
});

describe('firstDraftLineItemsJson / indexFirstDraftLineItemsJson', () => {
  it('matches destroy: first draft JSON, else empty list', () => {
    expect(firstDraftLineItemsJson(undefined)).toBe('[]');
    expect(firstDraftLineItemsJson([])).toBe('[]');
    expect(firstDraftLineItemsJson([{ lineItemsJson: undefined }])).toBe('[]');
    expect(
      firstDraftLineItemsJson([
        { lineItemsJson: JSON.stringify([{ name: 'Copper 90', quantity: 1, unitPriceCents: 0 }]) },
      ]),
    ).toBe(JSON.stringify([{ name: 'Copper 90', quantity: 1, unitPriceCents: 0 }]));
  });

  it('indexes the first draft per quote (destroy drafts[0])', () => {
    const namedBlank = JSON.stringify([{ name: 'Copper 90', quantity: 1, unitPriceCents: 0 }]);
    expect(
      indexFirstDraftLineItemsJson([
        { quoteId: 'q-named', lineItemsJson: namedBlank },
        { quoteId: 'q-empty', lineItemsJson: '[]' },
        { quoteId: 'q-named', lineItemsJson: '[]' },
      ]),
    ).toEqual({
      'q-named': namedBlank,
      'q-empty': '[]',
    });
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
    expect(
      shouldDropQueueItemForDeletedLocalQuote(
        { entityType: 'photo', entityId: quoteId, status: 'pending' },
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

type StoreQuote = {
  id: string;
  serverId: string | null;
  status: string;
  totalCents: number;
  customerPhone: string | null;
  destroyed?: boolean;
  destroyPermanently: () => Promise<void>;
};

type StoreDraft = {
  id: string;
  lineItemsJson: string;
  destroyed?: boolean;
  destroyPermanently: () => Promise<void>;
};

type StoreQueue = {
  entityType: string;
  entityId: string;
  status: string;
  destroyed?: boolean;
  destroyPermanently: () => Promise<void>;
};

function attachDestroy<T extends object>(
  row: T,
  onDestroy: () => void,
): T & { destroyed?: boolean; destroyPermanently: () => Promise<void> } {
  const wrapped = row as T & { destroyed?: boolean; destroyPermanently: () => Promise<void> };
  wrapped.destroyPermanently = async () => {
    wrapped.destroyed = true;
    onDestroy();
  };
  return wrapped;
}

describe('hardDeleteEmptyLocalQuote', () => {
  async function write(work: () => Promise<void>): Promise<void> {
    await work();
  }

  it('refuses when serverId is present and does not destroy local rows', async () => {
    const quote = attachDestroy(
      {
        id: 'q1',
        serverId: 'srv-q1',
        status: 'draft_local',
        totalCents: 0,
        customerPhone: null,
      },
      () => {
        throw new Error('must not destroy a server-backed quote');
      },
    );
    const draft = attachDestroy(
      { id: 'd1', lineItemsJson: '[]' },
      () => {
        throw new Error('must not destroy draft');
      },
    );

    await expect(
      hardDeleteEmptyLocalQuote({
        quote,
        drafts: [draft],
        queueItems: [],
        write,
      }),
    ).resolves.toBe('refused');
    expect(quote.destroyed).toBeUndefined();
    expect(draft.destroyed).toBeUndefined();
  });

  it('refuses a non-empty local draft (named or priced lines)', async () => {
    const quote = attachDestroy(
      {
        id: 'q1',
        serverId: null,
        status: 'draft_local',
        totalCents: 0,
        customerPhone: null,
      },
      () => {
        throw new Error('must not destroy a non-empty draft');
      },
    );
    const draft = attachDestroy(
      {
        id: 'd1',
        lineItemsJson: JSON.stringify([{ name: 'Pipe', quantity: 1, unitPriceCents: 100 }]),
      },
      () => {
        throw new Error('must not destroy draft');
      },
    );

    await expect(
      hardDeleteEmptyLocalQuote({
        quote,
        drafts: [draft],
        queueItems: [],
        write,
      }),
    ).resolves.toBe('refused');
    expect(quote.destroyed).toBeUndefined();
  });

  it('refuses a never-synced $0 draft with named blank-price lines', async () => {
    const quote = attachDestroy(
      {
        id: 'q1',
        serverId: null,
        status: 'draft_local',
        totalCents: 0,
        customerPhone: null,
      },
      () => {
        throw new Error('must not destroy named blank-price lines');
      },
    );
    const draft = attachDestroy(
      {
        id: 'd1',
        lineItemsJson: JSON.stringify([{ name: 'Copper 90', quantity: 1, unitPriceCents: 0 }]),
      },
      () => {
        throw new Error('must not destroy draft');
      },
    );

    await expect(
      hardDeleteEmptyLocalQuote({
        quote,
        drafts: [draft],
        queueItems: [],
        write,
      }),
    ).resolves.toBe('refused');
    expect(quote.destroyed).toBeUndefined();
    expect(draft.destroyed).toBeUndefined();
    expect(
      quoteRowSwipeAction(
        'active',
        canHardDeleteLocalQuoteWithDrafts(quote, [draft]),
      ),
    ).toBe('archive');
  });

  it('destroys quote, draft, and pending queue rows locally with no server delete', async () => {
    const store = {
      quotes: [] as StoreQuote[],
      drafts: [] as StoreDraft[],
      queue: [] as StoreQueue[],
    };
    const quote = attachDestroy(
      {
        id: 'q1',
        serverId: null,
        status: 'draft_local',
        totalCents: 0,
        customerPhone: null,
      },
      () => {
        store.quotes = store.quotes.filter((row) => row.id !== 'q1');
      },
    );
    const draft = attachDestroy(
      { id: 'd1', lineItemsJson: '[]' },
      () => {
        store.drafts = store.drafts.filter((row) => row.id !== 'd1');
      },
    );
    const pending = attachDestroy(
      { entityType: 'quote', entityId: 'q1', status: 'pending' },
      () => {
        store.queue = store.queue.filter((row) => row.entityId !== 'q1' || row.status === 'in_progress');
      },
    );
    const inProgress = attachDestroy(
      { entityType: 'quote', entityId: 'q1', status: 'in_progress' },
      () => {
        throw new Error('must not drop in_progress queue rows');
      },
    );
    store.quotes = [quote];
    store.drafts = [draft];
    store.queue = [pending, inProgress];

    await expect(
      hardDeleteEmptyLocalQuote({
        quote,
        drafts: store.drafts,
        queueItems: store.queue,
        write,
      }),
    ).resolves.toBe('deleted');

    expect(store.quotes).toEqual([]);
    expect(store.drafts).toEqual([]);
    expect(store.queue).toEqual([inProgress]);
    expect(quote.customerPhone).toBeNull();
    expect(quote.totalCents).toBe(0);
  });

  it('returns an empty list after deleting the last junk draft (no replacement Manual Quote)', async () => {
    const store = {
      quotes: [] as StoreQuote[],
      drafts: [] as StoreDraft[],
    };
    const quote = attachDestroy(
      {
        id: 'junk-1',
        serverId: null,
        status: 'draft_local',
        totalCents: 0,
        customerPhone: null,
      },
      () => {
        store.quotes = store.quotes.filter((row) => row.id !== 'junk-1');
      },
    );
    const draft = attachDestroy(
      { id: 'draft-junk', lineItemsJson: '[]' },
      () => {
        store.drafts = store.drafts.filter((row) => row.id !== 'draft-junk');
      },
    );
    store.quotes = [quote];
    store.drafts = [draft];

    await expect(
      hardDeleteEmptyLocalQuote({
        quote,
        drafts: store.drafts,
        queueItems: [],
        write,
      }),
    ).resolves.toBe('deleted');

    const remaining = removeQuoteListEntry(store.quotes, quote.id);
    expect(remaining).toEqual([]);
    expect(store.quotes).toEqual([]);
    expect(store.drafts).toEqual([]);
  });
});

describe('removeQuoteListEntry', () => {
  it('drops the row and leaves remaining totals and phones untouched', () => {
    const keep = { id: 'keep', totalCents: 69500, customerPhone: '+15555550100' };
    const junk = { id: 'junk', totalCents: 0, customerPhone: null as string | null };
    const next = removeQuoteListEntry([junk, keep], junk.id);
    expect(next).toEqual([keep]);
    expect(next[0]?.totalCents).toBe(69500);
    expect(next[0]?.customerPhone).toBe('+15555550100');
    expect(removeQuoteListEntry([], junk.id)).toEqual([]);
  });
});

describe('Quotes list swipe wiring', () => {
  const quotesScreen = fs.readFileSync(
    path.join(__dirname, '../../app/(app)/quotes.tsx'),
    'utf8',
  );

  it('passes draft JSON into the same helper destroy uses (not the no-lines skip)', () => {
    expect(quotesScreen).toContain('canHardDeleteLocalQuoteWithDrafts');
    expect(quotesScreen).toContain('indexFirstDraftLineItemsJson');
    expect(quotesScreen).toContain('draftLineItemsByQuoteId');
    expect(quotesScreen).not.toMatch(
      /canHardDeleteLocalQuote\(\{[\s\S]*totalCents: item\.totalCents,\s*\}\)/,
    );
  });
});
