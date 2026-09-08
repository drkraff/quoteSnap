import type { QuoteLineItemResponse, QuoteResponse } from '../api/quotes';
import {
  lineItemsFromDraftJson,
  loadQuoteDetail,
  QUOTE_DETAIL_NOT_FOUND,
  QUOTE_DETAIL_OFFLINE_ERROR,
  remoteLineItemsToDraftJson,
  resolveQuoteDetailView,
  type LocalQuoteRecord,
} from './load-quote-detail';

const createdAt = new Date('2026-09-02T12:00:00.000Z');

function localQuote(
  overrides: Partial<LocalQuoteRecord> = {},
): LocalQuoteRecord {
  return {
    id: 'local-q1',
    serverId: 'srv-q1',
    status: 'draft_queued',
    customerPhone: '+15555550100',
    totalCents: 3000,
    createdAt,
    sentAt: null,
    voiceJobId: 'job-1',
    ...overrides,
  };
}

function remoteQuote(
  overrides: Partial<QuoteResponse> = {},
): QuoteResponse {
  return {
    id: 'srv-q1',
    status: 'draft_queued',
    customerPhone: '+15555550100',
    totalCents: 3000,
    createdAt: '2026-09-02T12:00:00.000Z',
    updatedAt: '2026-09-02T12:00:00.000Z',
    sentAt: null,
    voiceJobId: 'job-1',
    ...overrides,
  };
}

const hydrateDraftJson = JSON.stringify([
  {
    catalogItemId: 'local-cat-1',
    name: 'Pipe',
    quantity: 2,
    unitPriceCents: 1500,
    confidence: 0.9,
  },
]);

const remoteLineItems: QuoteLineItemResponse[] = [
  {
    id: 'li-1',
    name: 'Pipe',
    quantity: 2,
    unitPriceCents: 1500,
    confidence: 0.9,
    catalogItemId: 'srv-cat-1',
  },
];

describe('lineItemsFromDraftJson', () => {
  it('keeps hydrate-shaped fields (confidence, catalogItemId)', () => {
    expect(lineItemsFromDraftJson(hydrateDraftJson)).toEqual([
      {
        id: '0',
        name: 'Pipe',
        quantity: 2,
        unitPriceCents: 1500,
        confidence: 0.9,
        catalogItemId: 'local-cat-1',
      },
    ]);
  });

  it('returns empty for [] (valid A-02 snapshot, not missing data)', () => {
    expect(lineItemsFromDraftJson('[]')).toEqual([]);
  });
});

describe('remoteLineItemsToDraftJson', () => {
  it('round-trips network line items into hydrate draft JSON', () => {
    const json = remoteLineItemsToDraftJson(remoteLineItems);
    expect(JSON.parse(json)).toEqual([
      {
        catalogItemId: 'srv-cat-1',
        name: 'Pipe',
        quantity: 2,
        unitPriceCents: 1500,
        confidence: 0.9,
      },
    ]);
  });
});

describe('resolveQuoteDetailView', () => {
  it('prefers network line items on a successful refresh', () => {
    const result = resolveQuoteDetailView({
      localQuote: localQuote(),
      localDraftJson: hydrateDraftJson,
      remote: {
        ok: true,
        quote: remoteQuote({ totalCents: 4500 }),
        lineItems: [
          {
            id: 'li-new',
            name: 'Elbow',
            quantity: 1,
            unitPriceCents: 4500,
          },
        ],
      },
    });

    expect(result).toMatchObject({
      found: true,
      source: 'network',
      error: null,
      quote: { totalCents: 4500 },
    });
    expect(result.lineItems).toEqual([
      { id: 'li-new', name: 'Elbow', quantity: 1, unitPriceCents: 4500 },
    ]);
  });

  it('uses the local draft when the network fails (HIST-04)', () => {
    const result = resolveQuoteDetailView({
      localQuote: localQuote(),
      localDraftJson: hydrateDraftJson,
      remote: { ok: false },
    });

    expect(result.source).toBe('local');
    expect(result.error).toBeNull();
    expect(result.lineItems[0]).toMatchObject({
      name: 'Pipe',
      quantity: 2,
      unitPriceCents: 1500,
      confidence: 0.9,
    });
  });

  it('treats empty draft JSON as a local snapshot, not a missing payload', () => {
    const result = resolveQuoteDetailView({
      localQuote: localQuote(),
      localDraftJson: '[]',
      remote: { ok: false },
    });

    expect(result.source).toBe('local');
    expect(result.error).toBeNull();
    expect(result.lineItems).toEqual([]);
  });

  it('asks for a connection only when there is no local draft and fetch failed', () => {
    const result = resolveQuoteDetailView({
      localQuote: localQuote(),
      localDraftJson: null,
      remote: { ok: false },
    });

    expect(result.source).toBe('none');
    expect(result.error).toBe(QUOTE_DETAIL_OFFLINE_ERROR);
    expect(result.lineItems).toEqual([]);
  });

  it('loads a never-synced quote from the local draft without a network result', () => {
    const result = resolveQuoteDetailView({
      localQuote: localQuote({ serverId: null }),
      localDraftJson: hydrateDraftJson,
      remote: { skipped: true },
    });

    expect(result.source).toBe('local');
    expect(result.error).toBeNull();
    expect(result.lineItems).toHaveLength(1);
  });

  it('returns not-found when the local quote row is missing', () => {
    const result = resolveQuoteDetailView({
      localQuote: null,
      localDraftJson: null,
      remote: { skipped: true },
    });

    expect(result.found).toBe(false);
    expect(result.error).toBe(QUOTE_DETAIL_NOT_FOUND);
  });
});

describe('loadQuoteDetail', () => {
  it('does not fetch when the quote has no serverId', async () => {
    const fetchRemote = jest.fn();
    const result = await loadQuoteDetail({
      findQuote: async () => localQuote({ serverId: null }),
      findDrafts: async () => [{ lineItemsJson: hydrateDraftJson }],
      fetchRemote,
    });

    expect(fetchRemote).not.toHaveBeenCalled();
    expect(result.source).toBe('local');
    expect(result.lineItems[0]?.name).toBe('Pipe');
  });

  it('skips network when offline if a local draft already exists', async () => {
    const fetchRemote = jest.fn();
    const result = await loadQuoteDetail({
      findQuote: async () => localQuote(),
      findDrafts: async () => [{ lineItemsJson: hydrateDraftJson }],
      fetchRemote,
      isOnline: () => false,
    });

    expect(fetchRemote).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      source: 'local',
      error: null,
    });
    expect(result.lineItems).toHaveLength(1);
  });

  it('surfaces local items immediately, then keeps them if refresh fails', async () => {
    const onLocalSnapshot = jest.fn();
    const result = await loadQuoteDetail({
      findQuote: async () => localQuote(),
      findDrafts: async () => [{ lineItemsJson: hydrateDraftJson }],
      fetchRemote: async () => {
        throw new Error('network down');
      },
      isOnline: () => true,
      onLocalSnapshot,
    });

    expect(onLocalSnapshot).toHaveBeenCalledTimes(1);
    expect(onLocalSnapshot.mock.calls[0]![0]).toMatchObject({
      source: 'local',
      error: null,
    });
    expect(result.source).toBe('local');
    expect(result.error).toBeNull();
    expect(result.lineItems[0]?.name).toBe('Pipe');
  });

  it('refreshes from the network when online (happy path)', async () => {
    const persistRemoteLineItems = jest.fn(async () => undefined);
    const result = await loadQuoteDetail({
      findQuote: async () => localQuote(),
      findDrafts: async () => [{ lineItemsJson: hydrateDraftJson }],
      fetchRemote: async (serverId) => {
        expect(serverId).toBe('srv-q1');
        return {
          quote: remoteQuote({ totalCents: 4500 }),
          lineItems: [
            {
              id: 'li-new',
              name: 'Elbow',
              quantity: 1,
              unitPriceCents: 4500,
            },
          ],
        };
      },
      isOnline: () => true,
      persistRemoteLineItems,
    });

    expect(result.source).toBe('network');
    expect(result.quote?.totalCents).toBe(4500);
    expect(result.lineItems[0]?.name).toBe('Elbow');
    expect(persistRemoteLineItems).toHaveBeenCalledTimes(1);
  });

  it('fetches when local draft is missing even if marked offline', async () => {
    const result = await loadQuoteDetail({
      findQuote: async () => localQuote(),
      findDrafts: async () => [],
      fetchRemote: async () => ({
        quote: remoteQuote(),
        lineItems: remoteLineItems,
      }),
      isOnline: () => false,
    });

    expect(result.source).toBe('network');
    expect(result.lineItems).toEqual(remoteLineItems);
  });

  it('errors only when there is no local draft and the fetch fails', async () => {
    const result = await loadQuoteDetail({
      findQuote: async () => localQuote(),
      findDrafts: async () => [],
      fetchRemote: async () => {
        throw new Error('unreachable');
      },
    });

    expect(result.error).toBe(QUOTE_DETAIL_OFFLINE_ERROR);
    expect(result.source).toBe('none');
  });

  it('returns not-found when Watermelon find() rejects', async () => {
    const fetchRemote = jest.fn();
    const result = await loadQuoteDetail({
      findQuote: async () => {
        throw new Error('not found');
      },
      findDrafts: async () => [],
      fetchRemote,
    });

    expect(fetchRemote).not.toHaveBeenCalled();
    expect(result.found).toBe(false);
    expect(result.error).toBe(QUOTE_DETAIL_NOT_FOUND);
  });

  it('still returns the network view if persisting the refresh fails', async () => {
    const result = await loadQuoteDetail({
      findQuote: async () => localQuote(),
      findDrafts: async () => [{ lineItemsJson: hydrateDraftJson }],
      fetchRemote: async () => ({
        quote: remoteQuote(),
        lineItems: remoteLineItems,
      }),
      isOnline: () => true,
      persistRemoteLineItems: async () => {
        throw new Error('write failed');
      },
    });

    expect(result.source).toBe('network');
    expect(result.lineItems).toEqual(remoteLineItems);
  });
});
