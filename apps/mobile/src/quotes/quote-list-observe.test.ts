import {
  draftFailedLocalFields,
  draftReadyLocalFields,
  QUOTE_LIST_OBSERVE_COLUMNS,
  quoteListRenderKey,
} from './quote-list-observe';

describe('QUOTE_LIST_OBSERVE_COLUMNS', () => {
  it('watches displayed fields plus server_id so Delete swipe yields to Archive after sync', () => {
    expect(QUOTE_LIST_OBSERVE_COLUMNS).toEqual([
      'status',
      'total_cents',
      'customer_phone',
      'voice_job_id',
      'server_id',
    ]);
  });

  it('does not rely on created_at (sort-only) to surface status writes', () => {
    expect(QUOTE_LIST_OBSERVE_COLUMNS).not.toContain('created_at');
    expect(QUOTE_LIST_OBSERVE_COLUMNS).not.toContain('contractor_id');
  });

  it('does not watch is_archived; archived rows leave the WHERE is_archived=false set', () => {
    expect(QUOTE_LIST_OBSERVE_COLUMNS).not.toContain('is_archived');
  });
});

describe('draftReadyLocalFields', () => {
  it('sets draft_local and the catalog-sum total in cents', () => {
    const lineItemsJson = JSON.stringify([
      { catalogItemId: 'sw', name: 'Switch Replacement', quantity: 2, unitPriceCents: 8500 },
      { catalogItemId: 'out', name: 'Outlet Install', quantity: 3, unitPriceCents: 17500 },
    ]);

    expect(draftReadyLocalFields(lineItemsJson)).toEqual({
      status: 'draft_local',
      totalCents: 69500,
    });
  });

  it('uses 0 when the draft payload is empty or invalid', () => {
    expect(draftReadyLocalFields('[]')).toEqual({ status: 'draft_local', totalCents: 0 });
    expect(draftReadyLocalFields('{')).toEqual({ status: 'draft_local', totalCents: 0 });
  });
});

describe('draftFailedLocalFields', () => {
  it('keeps ai_failed and sums any partial mapping lines', () => {
    const lineItemsJson = JSON.stringify([
      { name: 'Pipe', quantity: 2, unitPriceCents: 1500, confidence: 0.59 },
    ]);
    expect(draftFailedLocalFields(lineItemsJson)).toEqual({
      status: 'ai_failed',
      totalCents: 3000,
    });
  });

  it('uses 0 cents when the draft is empty or invalid — never invents a SKU price', () => {
    expect(draftFailedLocalFields('[]')).toEqual({ status: 'ai_failed', totalCents: 0 });
    expect(draftFailedLocalFields('{')).toEqual({ status: 'ai_failed', totalCents: 0 });
    expect(draftFailedLocalFields('')).toEqual({ status: 'ai_failed', totalCents: 0 });
  });
});

describe('quoteListRenderKey', () => {
  const row = { id: 'q1', status: 'ai_processing', totalCents: 0 };

  it('changes when status, total, connectivity, serverId, or voiceJobId changes (FlatList extraData)', () => {
    const processingOffline = quoteListRenderKey([row], false);
    expect(processingOffline).not.toBe(
      quoteListRenderKey([{ ...row, status: 'draft_local', totalCents: 69500 }], false),
    );
    expect(processingOffline).not.toBe(quoteListRenderKey([row], true));
    expect(quoteListRenderKey([row], true)).not.toBe(
      quoteListRenderKey([{ ...row, serverId: 'srv-q1' }], true),
    );
    expect(quoteListRenderKey([{ ...row, serverId: 'srv-q1' }], true)).not.toBe(
      quoteListRenderKey([{ ...row, serverId: 'srv-q1', voiceJobId: 'job-1' }], true),
    );
  });

  it('stays stable when nothing visible changed', () => {
    expect(quoteListRenderKey([row], true)).toBe(quoteListRenderKey([row], true));
  });

  it('does not invent a quote row when the list is empty', () => {
    expect(quoteListRenderKey([], true)).toBe('1:');
    expect(quoteListRenderKey([], false)).toBe('0:');
  });
});
