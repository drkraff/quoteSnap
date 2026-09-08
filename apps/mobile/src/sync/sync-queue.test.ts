import {
  archiveCatalogItem,
  createCatalogItem,
  fetchCatalogItems,
  unarchiveCatalogItem,
  updateCatalogItem,
} from '../api/catalog';
import { seedCatalog } from '../api/onboarding';
import { uploadAudio } from '../api/voice';
import { database } from '../db';
import { isOnline } from './network-monitor';
import { processQueue, resetSyncQueueForTests } from './sync-queue';

jest.mock('../db', () => ({
  database: {
    write: jest.fn(async (fn: () => Promise<unknown>) => fn()),
    get: jest.fn(),
  },
}));

jest.mock('./network-monitor', () => ({
  isOnline: jest.fn(() => true),
  onConnectivityChange: jest.fn(() => jest.fn()),
}));

jest.mock('../api/catalog', () => ({
  createCatalogItem: jest.fn(),
  updateCatalogItem: jest.fn(),
  archiveCatalogItem: jest.fn(),
  unarchiveCatalogItem: jest.fn(),
  fetchCatalogItems: jest.fn(),
}));

jest.mock('../api/onboarding', () => ({
  seedCatalog: jest.fn(),
}));

jest.mock('../api/voice', () => ({
  uploadAudio: jest.fn(),
}));

jest.mock('../api/quotes', () => ({
  createQuoteOnServer: jest.fn(),
  updateQuoteOnServer: jest.fn(),
}));

type FakeQueueItem = {
  entityType: string;
  entityId: string;
  action: string;
  payloadJson: string;
  status: string;
  retryCount: number;
  lastError: string | null;
  nextRetryAt: Date | null;
  createdAt: Date;
  update: (fn: (record: FakeQueueItem) => void) => Promise<void>;
  destroyPermanently: () => Promise<void>;
};

type FakeQuote = {
  id: string;
  serverId: string | null;
  status: string;
  voiceJobId: string | null;
  update: (fn: (record: FakeQuote) => void) => Promise<void>;
};

type FakeDraft = {
  id: string;
  quoteId: string;
};

type FakeCatalogItem = {
  id: string;
  serverId: string | null;
  name: string;
  update: (fn: (record: FakeCatalogItem) => void) => Promise<void>;
};

const mockedDatabase = database as unknown as {
  write: jest.Mock;
  get: jest.Mock;
};
const mockedIsOnline = isOnline as unknown as jest.Mock;
const mockedCreateCatalogItem = createCatalogItem as unknown as jest.Mock;
const mockedUpdateCatalogItem = updateCatalogItem as unknown as jest.Mock;
const mockedArchiveCatalogItem = archiveCatalogItem as unknown as jest.Mock;
const mockedUnarchiveCatalogItem = unarchiveCatalogItem as unknown as jest.Mock;
const mockedUploadAudio = uploadAudio as unknown as jest.Mock;
const mockedSeedCatalog = seedCatalog as unknown as jest.Mock;
const mockedFetchCatalogItems = fetchCatalogItems as unknown as jest.Mock;

function makeQueueItem(overrides: Partial<FakeQueueItem> = {}): FakeQueueItem {
  const item: FakeQueueItem = {
    entityType: 'catalog_item',
    entityId: 'local-cat-1',
    action: 'create',
    payloadJson: JSON.stringify({ name: 'Pipe', unit: 'ea', unitPriceCents: 100 }),
    status: 'pending',
    retryCount: 0,
    lastError: null,
    nextRetryAt: null,
    createdAt: new Date(0),
    async update(fn) {
      fn(item);
    },
    async destroyPermanently() {
      item.status = 'destroyed';
    },
    ...overrides,
  };
  return item;
}

function makeQuote(overrides: Partial<FakeQuote> = {}): FakeQuote {
  const quote: FakeQuote = {
    id: 'local-quote-1',
    serverId: null,
    status: 'ai_processing',
    voiceJobId: null,
    async update(fn) {
      fn(quote);
    },
    ...overrides,
  };
  return quote;
}

describe('processQueue', () => {
  let queueItems: FakeQueueItem[];
  let quotes: FakeQuote[];
  let drafts: FakeDraft[];
  let catalogItems: FakeCatalogItem[];

  beforeEach(() => {
    resetSyncQueueForTests();
    queueItems = [];
    quotes = [];
    drafts = [];
    catalogItems = [];
    mockedIsOnline.mockReturnValue(true);
    mockedCreateCatalogItem.mockReset();
    mockedUpdateCatalogItem.mockReset();
    mockedArchiveCatalogItem.mockReset();
    mockedUnarchiveCatalogItem.mockReset();
    mockedUploadAudio.mockReset();
    mockedSeedCatalog.mockReset();
    mockedFetchCatalogItems.mockReset();
    mockedDatabase.get.mockImplementation((table: string) => ({
      query: () => ({
        fetch: async () => {
          if (table === 'sync_queue_items') return queueItems.filter((i) => i.status !== 'destroyed');
          if (table === 'quotes') return quotes;
          if (table === 'drafts') return drafts;
          if (table === 'catalog_items') return catalogItems;
          return [];
        },
        fetchCount: async () => queueItems.filter((i) => i.status === 'pending').length,
      }),
    }));
  });

  afterEach(() => {
    resetSyncQueueForTests();
  });

  it('retries failed items instead of leaving them in failed', async () => {
    const item = makeQueueItem();
    queueItems = [item];
    mockedCreateCatalogItem.mockRejectedValue(new Error('network down'));

    await processQueue();

    expect(item.status).toBe('pending');
    expect(item.retryCount).toBe(1);
    expect(item.lastError).toBe('network down');
    expect(item.nextRetryAt).toBeInstanceOf(Date);
    expect(item.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('does not retry an item still inside its backoff window', async () => {
    const item = makeQueueItem({
      retryCount: 1,
      nextRetryAt: new Date(Date.now() + 60_000),
    });
    queueItems = [item];
    mockedCreateCatalogItem.mockResolvedValue({ id: 'server-1' });

    await processQueue();

    expect(mockedCreateCatalogItem).not.toHaveBeenCalled();
    expect(item.status).toBe('pending');
  });

  it('retries a previously failed item once nextRetryAt has elapsed', async () => {
    const item = makeQueueItem({
      status: 'failed',
      retryCount: 1,
      nextRetryAt: new Date(Date.now() - 1),
    });
    queueItems = [item];
    mockedCreateCatalogItem.mockResolvedValue({ id: 'server-1' });

    await processQueue();

    expect(mockedCreateCatalogItem).toHaveBeenCalledTimes(1);
    expect(item.status).toBe('destroyed');
  });

  it('dead-letters after the 15m backoff attempt fails', async () => {
    const item = makeQueueItem({ retryCount: 5 });
    queueItems = [item];
    mockedCreateCatalogItem.mockRejectedValue(new Error('still down'));

    await processQueue();

    expect(item.status).toBe('dead_letter');
    expect(item.retryCount).toBe(6);
    expect(item.nextRetryAt).toBeNull();
  });

  it('does not run two overlapping passes (no duplicate server writes)', async () => {
    const item = makeQueueItem();
    queueItems = [item];

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockedCreateCatalogItem.mockImplementation(async () => {
      await gate;
      return { id: 'server-1' };
    });

    const first = processQueue();
    const second = processQueue();
    release();
    await Promise.all([first, second]);

    expect(mockedCreateCatalogItem).toHaveBeenCalledTimes(1);
  });

  it('does not upload audio for a non-voice quote with no server id', async () => {
    const quote = makeQuote({ status: 'draft_local', serverId: null });
    quotes = [quote];
    const item = makeQueueItem({
      entityType: 'audio',
      entityId: quote.id,
      payloadJson: JSON.stringify({ filePath: '/tmp/a.m4a', quoteLocalId: quote.id }),
    });
    queueItems = [item];

    await processQueue();

    expect(mockedUploadAudio).not.toHaveBeenCalled();
    expect(item.status).toBe('pending');
    expect(item.lastError).toMatch(/parent quote has no server ID yet/);
  });

  it('does not destroy a draft when the parent quote has not synced yet', async () => {
    const quote = makeQuote({ id: 'q1', status: 'draft_local', serverId: null });
    quotes = [quote];
    drafts = [{ id: 'd1', quoteId: 'q1' }];
    const item = makeQueueItem({
      entityType: 'draft',
      entityId: 'd1',
      payloadJson: JSON.stringify({ lineItemsJson: '[]', totalCents: 0 }),
    });
    queueItems = [item];

    await processQueue();

    expect(item.status).toBe('pending');
    expect(item.status).not.toBe('destroyed');
    expect(item.lastError).toMatch(/parent quote has no server ID yet/);
  });

  it('uploads voice-first audio without passing an empty parent server id', async () => {
    const quote = makeQuote({ status: 'ai_processing', serverId: null });
    quotes = [quote];
    const item = makeQueueItem({
      entityType: 'audio',
      entityId: quote.id,
      payloadJson: JSON.stringify({ filePath: '/tmp/a.m4a', quoteLocalId: quote.id }),
    });
    queueItems = [item];
    mockedUploadAudio.mockResolvedValue({ jobId: 'job-1', quoteId: 'server-q1' });

    await processQueue();

    expect(mockedUploadAudio).toHaveBeenCalledWith('/tmp/a.m4a', undefined);
    expect(quote.serverId).toBe('server-q1');
    expect(quote.voiceJobId).toBe('job-1');
    expect(item.status).toBe('destroyed');
  });

  it('processes an onboarding seed job and stamps local catalog ids', async () => {
    const local = {
      id: 'local-cat-1',
      serverId: null as string | null,
      name: 'Faucet Repair',
      async update(fn: (record: FakeCatalogItem) => void) {
        fn(local);
      },
    };
    catalogItems = [local];
    const item = makeQueueItem({
      entityType: 'onboarding',
      entityId: 'contractor-1',
      action: 'seed',
      payloadJson: JSON.stringify({ trade: 'plumbing' }),
    });
    queueItems = [item];
    mockedSeedCatalog.mockResolvedValue({
      trade: 'plumbing',
      itemCount: 1,
      items: [{ id: 'srv-1', name: 'Faucet Repair' }],
    });

    await processQueue();

    expect(mockedSeedCatalog).toHaveBeenCalledWith('plumbing');
    expect(mockedCreateCatalogItem).not.toHaveBeenCalled();
    expect(local.serverId).toBe('srv-1');
    expect(item.status).toBe('destroyed');
  });

  it('treats a 409 seed as already-seeded and maps GET /catalog instead of creating', async () => {
    const local = {
      id: 'local-cat-1',
      serverId: null as string | null,
      name: 'Faucet Repair',
      async update(fn: (record: FakeCatalogItem) => void) {
        fn(local);
      },
    };
    catalogItems = [local];
    const item = makeQueueItem({
      entityType: 'onboarding',
      entityId: 'contractor-1',
      action: 'seed',
      payloadJson: JSON.stringify({ trade: 'plumbing' }),
    });
    queueItems = [item];
    mockedSeedCatalog.mockRejectedValue({ status: 409, error: 'Catalog already seeded' });
    mockedFetchCatalogItems.mockResolvedValue([{ id: 'srv-existing', name: 'Faucet Repair' }]);

    await processQueue();

    expect(mockedFetchCatalogItems).toHaveBeenCalledTimes(1);
    expect(mockedCreateCatalogItem).not.toHaveBeenCalled();
    expect(local.serverId).toBe('srv-existing');
    expect(item.status).toBe('destroyed');
  });

  it('retries a failed onboarding seed with the same backoff as other queue items', async () => {
    const item = makeQueueItem({
      entityType: 'onboarding',
      entityId: 'contractor-1',
      action: 'seed',
      payloadJson: JSON.stringify({ trade: 'hvac' }),
    });
    queueItems = [item];
    mockedSeedCatalog.mockRejectedValue({ status: 500, error: 'Internal server error' });

    await processQueue();

    expect(item.status).toBe('pending');
    expect(item.retryCount).toBe(1);
    expect(item.nextRetryAt).toBeInstanceOf(Date);
  });

  it('skips POST /catalog when a queued create already has a server id (seed de-dupe)', async () => {
    catalogItems = [
      {
        id: 'local-cat-1',
        serverId: 'srv-already',
        name: 'Faucet Repair',
        async update() {
          // no-op
        },
      },
    ];
    const item = makeQueueItem({
      entityType: 'catalog_item',
      entityId: 'local-cat-1',
      action: 'create',
    });
    queueItems = [item];

    await processQueue();

    expect(mockedCreateCatalogItem).not.toHaveBeenCalled();
    expect(item.status).toBe('destroyed');
  });

  it('maps seeded alias units to canonical units on catalog create (A-04)', async () => {
    const item = makeQueueItem({
      payloadJson: JSON.stringify({
        name: 'Pipe Repair',
        unit: 'per foot',
        unitPriceCents: 4500,
      }),
    });
    queueItems = [item];
    mockedCreateCatalogItem.mockResolvedValue({ id: 'server-1' });

    await processQueue();

    expect(mockedCreateCatalogItem).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Pipe Repair', unit: 'foot', unitPriceCents: 4500 }),
    );
    expect(item.status).toBe('destroyed');
  });

  it('maps seeded alias units to canonical units on catalog update (A-04 CAT-02)', async () => {
    catalogItems = [
      {
        id: 'local-cat-1',
        serverId: 'srv-pipe',
        name: 'Pipe Repair',
        async update() {
          // no-op
        },
      },
    ];
    const item = makeQueueItem({
      action: 'update',
      payloadJson: JSON.stringify({
        name: 'Pipe Repair',
        unit: 'per foot',
        unitPriceCents: 5000,
      }),
    });
    queueItems = [item];
    mockedUpdateCatalogItem.mockResolvedValue({ id: 'srv-pipe' });

    await processQueue();

    expect(mockedUpdateCatalogItem).toHaveBeenCalledWith(
      'srv-pipe',
      expect.objectContaining({ name: 'Pipe Repair', unit: 'foot', unitPriceCents: 5000 }),
    );
    expect(item.status).toBe('destroyed');
  });

  it('archives via PATCH when the payload is isArchived true (CAT-03)', async () => {
    catalogItems = [
      {
        id: 'local-cat-1',
        serverId: 'srv-pipe',
        name: 'Pipe Repair',
        async update() {
          // no-op
        },
      },
    ];
    const item = makeQueueItem({
      action: 'update',
      payloadJson: JSON.stringify({ isArchived: true }),
    });
    queueItems = [item];
    mockedArchiveCatalogItem.mockResolvedValue(undefined);

    await processQueue();

    expect(mockedArchiveCatalogItem).toHaveBeenCalledWith('srv-pipe');
    expect(mockedUnarchiveCatalogItem).not.toHaveBeenCalled();
    expect(mockedUpdateCatalogItem).not.toHaveBeenCalled();
    expect(item.status).toBe('destroyed');
  });

  it('unarchives via PATCH on undo instead of PUT empty fields (A-05)', async () => {
    catalogItems = [
      {
        id: 'local-cat-1',
        serverId: 'srv-pipe',
        name: 'Pipe Repair',
        async update() {
          // no-op
        },
      },
    ];
    const item = makeQueueItem({
      action: 'update',
      payloadJson: JSON.stringify({ isArchived: false }),
    });
    queueItems = [item];
    mockedUnarchiveCatalogItem.mockResolvedValue(undefined);

    await processQueue();

    expect(mockedUnarchiveCatalogItem).toHaveBeenCalledWith('srv-pipe');
    expect(mockedArchiveCatalogItem).not.toHaveBeenCalled();
    expect(mockedUpdateCatalogItem).not.toHaveBeenCalled();
    expect(item.status).toBe('destroyed');
  });
});
