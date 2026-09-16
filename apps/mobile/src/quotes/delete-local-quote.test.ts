import {
  canHardDeleteLocalQuote,
  DELETE_LOCAL_QUOTE_CONFIRM_MESSAGE,
  DELETE_LOCAL_QUOTE_CONFIRM_TITLE,
  draftLineItemsJsonByQuoteId,
  hardDeleteEmptyLocalQuote,
  hasMeaningfulLineItems,
  lineItemsJsonForQuoteListSwipe,
  quoteListHardDeleteGateKey,
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

  it('treats named blank-price lines as content even when totalCents is 0', () => {
    expect(
      hasMeaningfulLineItems(
        JSON.stringify([{ name: 'Copper pipe', quantity: 1, unitPriceCents: 0 }]),
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
    expect(canHardDeleteLocalQuote({ ...emptyLocal, serverId: undefined })).toBe(true);
    expect(canHardDeleteLocalQuote({ ...emptyLocal, serverId: '' })).toBe(true);
    expect(canHardDeleteLocalQuote({ ...emptyLocal, lineItemsJson: null })).toBe(true);
  });

  it('does not treat omitted draft JSON as empty (list swipe must load it)', () => {
    expect(canHardDeleteLocalQuote({ ...emptyLocal, lineItemsJson: undefined })).toBe(false);
    expect(
      canHardDeleteLocalQuote({
        serverId: null,
        status: 'draft_local',
        totalCents: 0,
      }),
    ).toBe(false);
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

  it('does not delete a $0 draft with named blank-price lines', () => {
    expect(
      canHardDeleteLocalQuote({
        ...emptyLocal,
        totalCents: 0,
        lineItemsJson: JSON.stringify([{ name: 'Pipe', quantity: 1, unitPriceCents: 0 }]),
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

  it('shows Archive for a $0 never-synced draft with named blank-price lines', () => {
    const canDelete = canHardDeleteLocalQuote({
      serverId: null,
      status: 'draft_local',
      totalCents: 0,
      lineItemsJson: JSON.stringify([{ name: 'Pipe', quantity: 1, unitPriceCents: 0 }]),
    });
    expect(canDelete).toBe(false);
    expect(quoteRowSwipeAction('active', canDelete)).toBe('archive');
  });

  it('keeps Archive when serverId is present even if draft JSON is empty', () => {
    const canDelete = canHardDeleteLocalQuote({
      serverId: 'srv-q1',
      status: 'draft_local',
      totalCents: 0,
      lineItemsJson: '[]',
    });
    expect(canDelete).toBe(false);
    expect(quoteRowSwipeAction('active', canDelete)).toBe('archive');
  });
});

describe('draft JSON for the Quotes list Delete gate', () => {
  const blankNamed = JSON.stringify([{ name: 'Pipe', quantity: 1, unitPriceCents: 0 }]);

  it('maps the first draft JSON per quote and treats missing JSON as empty', () => {
    expect(
      draftLineItemsJsonByQuoteId([
        { quoteId: 'q1', lineItemsJson: '[]' },
        { quoteId: 'q2', lineItemsJson: blankNamed },
        { quoteId: 'q1', lineItemsJson: blankNamed },
        { quoteId: 'q3', lineItemsJson: null },
      ]),
    ).toEqual({
      q1: '[]',
      q2: blankNamed,
      q3: '[]',
    });
  });

  it('does not assume empty lines until drafts have loaded', () => {
    expect(lineItemsJsonForQuoteListSwipe(null, 'q1')).toBeUndefined();
    expect(
      canHardDeleteLocalQuote({
        serverId: null,
        status: 'draft_local',
        totalCents: 0,
        lineItemsJson: lineItemsJsonForQuoteListSwipe(null, 'q1'),
      }),
    ).toBe(false);
    expect(quoteRowSwipeAction('active', false)).toBe('archive');
  });

  it('matches destroy after load: missing draft is empty; named blank-price is not', () => {
    const loaded = draftLineItemsJsonByQuoteId([
      { quoteId: 'empty', lineItemsJson: '[]' },
      { quoteId: 'named', lineItemsJson: blankNamed },
    ]);
    expect(lineItemsJsonForQuoteListSwipe(loaded, 'empty')).toBe('[]');
    expect(lineItemsJsonForQuoteListSwipe(loaded, 'missing-draft')).toBe('[]');
    expect(lineItemsJsonForQuoteListSwipe(loaded, 'named')).toBe(blankNamed);

    expect(
      canHardDeleteLocalQuote({
        serverId: null,
        status: 'draft_local',
        totalCents: 0,
        lineItemsJson: lineItemsJsonForQuoteListSwipe(loaded, 'empty'),
      }),
    ).toBe(true);
    expect(
      canHardDeleteLocalQuote({
        serverId: null,
        status: 'draft_local',
        totalCents: 0,
        lineItemsJson: lineItemsJsonForQuoteListSwipe(loaded, 'named'),
      }),
    ).toBe(false);
  });

  it('changes the list extraData bit when $0 named lines appear (Delete → Archive)', () => {
    const quotes = [{ id: 'q1', serverId: null, status: 'draft_local', totalCents: 0 }];
    expect(quoteListHardDeleteGateKey(quotes, null)).toBe('pending');
    expect(quoteListHardDeleteGateKey(quotes, { q1: '[]' })).toBe('d');
    expect(quoteListHardDeleteGateKey(quotes, { q1: blankNamed })).toBe('a');
    expect(quoteListHardDeleteGateKey(quotes, { q1: '[]' })).not.toBe(
      quoteListHardDeleteGateKey(quotes, { q1: blankNamed }),
    );
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

  it('refuses a $0 never-synced draft whose JSON has named blank-price lines', async () => {
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
        lineItemsJson: JSON.stringify([{ name: 'Pipe', quantity: 1, unitPriceCents: 0 }]),
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
