import { fetchCatalogItems } from '../api/catalog';
import { fetchQuotes } from '../api/quotes';
import { database } from '../db';
import {
  hydrateFromServer,
  resetHydrateForTests,
  toDraftLineItems,
  upsertCatalogItems,
  upsertQuotes,
} from './hydrate';

jest.mock('../db', () => ({
  database: {
    write: jest.fn(async (fn: () => Promise<unknown>) => fn()),
    get: jest.fn(),
  },
}));

jest.mock('../api/catalog', () => ({
  fetchCatalogItems: jest.fn(),
}));

jest.mock('../api/quotes', () => ({
  fetchQuotes: jest.fn(),
}));

jest.mock('@nozbe/watermelondb', () => ({
  Q: {
    where: jest.fn(),
    or: jest.fn(),
  },
}));

type FakeCatalogItem = {
  id: string;
  serverId: string | null;
  contractorId: string;
  name: string;
  unit: string;
  unitPriceCents: number;
  tradeCategory: string | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  update: (fn: (record: FakeCatalogItem) => void) => Promise<void>;
};

type FakeQuote = {
  id: string;
  serverId: string | null;
  contractorId: string;
  status: string;
  customerPhone: string | null;
  totalCents: number;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
  voiceJobId: string | null;
  update: (fn: (record: FakeQuote) => void) => Promise<void>;
};

type FakeDraft = {
  id: string;
  quoteId: string;
  lineItemsJson: string;
  notes: string | null;
  updatedAt: Date;
  update: (fn: (record: FakeDraft) => void) => Promise<void>;
};

type FakeQueueItem = {
  entityType: string;
  entityId: string;
  status: string;
};

const mockedDatabase = database as unknown as {
  write: jest.Mock;
  get: jest.Mock;
};
const mockedFetchCatalog = fetchCatalogItems as unknown as jest.Mock;
const mockedFetchQuotes = fetchQuotes as unknown as jest.Mock;

const contractorId = 'contractor-1';

function attachUpdate<T extends { update: (fn: (record: T) => void) => Promise<void> }>(
  record: Omit<T, 'update'>,
): T {
  const row = record as T;
  row.update = async (fn) => {
    fn(row);
  };
  return row;
}

describe('toDraftLineItems', () => {
  it('remaps server catalog ids to local watermelon ids and keeps confidence', () => {
    const localIds = new Map([['server-cat-1', 'local-cat-1']]);
    const items = toDraftLineItems(
      [
        {
          id: 'li-1',
          name: 'Pipe',
          quantity: 2,
          unitPriceCents: 1500,
          confidence: 0.7,
          catalogItemId: 'server-cat-1',
        },
        {
          id: 'li-2',
          name: 'Manual',
          quantity: 1,
          unitPriceCents: 200,
          catalogItemId: null,
        },
      ],
      localIds,
    );

    expect(items).toEqual([
      {
        catalogItemId: 'local-cat-1',
        name: 'Pipe',
        quantity: 2,
        unitPriceCents: 1500,
        confidence: 0.7,
      },
      {
        catalogItemId: '',
        name: 'Manual',
        quantity: 1,
        unitPriceCents: 200,
      },
    ]);
  });
});

describe('upsertCatalogItems / upsertQuotes', () => {
  let catalogItems: FakeCatalogItem[];
  let quotes: FakeQuote[];
  let drafts: FakeDraft[];
  let queueItems: FakeQueueItem[];
  let createSeq: number;

  beforeEach(() => {
    resetHydrateForTests();
    catalogItems = [];
    quotes = [];
    drafts = [];
    queueItems = [];
    createSeq = 0;

    mockedDatabase.get.mockImplementation((table: string) => ({
      query: () => ({
        fetch: async () => {
          if (table === 'catalog_items') return catalogItems;
          if (table === 'quotes') return quotes;
          if (table === 'drafts') return drafts;
          if (table === 'sync_queue_items') return queueItems;
          return [];
        },
      }),
      create: async (writer: (record: Record<string, unknown>) => void) => {
        createSeq += 1;
        if (table === 'catalog_items') {
          const record = attachUpdate<FakeCatalogItem>({
            id: `local-cat-${createSeq}`,
            serverId: null,
            contractorId: '',
            name: '',
            unit: '',
            unitPriceCents: 0,
            tradeCategory: null,
            isArchived: false,
            createdAt: new Date(0),
            updatedAt: new Date(0),
          });
          writer(record);
          catalogItems.push(record);
          return record;
        }
        if (table === 'quotes') {
          const record = attachUpdate<FakeQuote>({
            id: `local-quote-${createSeq}`,
            serverId: null,
            contractorId: '',
            status: '',
            customerPhone: null,
            totalCents: 0,
            createdAt: new Date(0),
            updatedAt: new Date(0),
            sentAt: null,
            voiceJobId: null,
          });
          writer(record);
          quotes.push(record);
          return record;
        }
        if (table === 'drafts') {
          const record = attachUpdate<FakeDraft>({
            id: `local-draft-${createSeq}`,
            quoteId: '',
            lineItemsJson: '[]',
            notes: null,
            updatedAt: new Date(0),
          });
          writer(record);
          drafts.push(record);
          return record;
        }
        throw new Error(`unexpected create on ${table}`);
      },
    }));
  });

  afterEach(() => {
    resetHydrateForTests();
  });

  it('creates catalog, quote, and draft rows keyed by server_id', async () => {
    await upsertCatalogItems(contractorId, [
      {
        id: 'srv-cat-1',
        name: 'Pipe',
        unit: 'foot',
        unitPriceCents: 1500,
        tradeCategory: 'plumbing',
        isArchived: false,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
    await upsertQuotes(contractorId, [
      {
        id: 'srv-quote-1',
        status: 'draft_local',
        customerPhone: '+15551212',
        totalCents: 3000,
        createdAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z',
        sentAt: null,
        voiceJobId: null,
        lineItems: [
          {
            id: 'li-1',
            name: 'Pipe',
            quantity: 2,
            unitPriceCents: 1500,
            confidence: 0.9,
            catalogItemId: 'srv-cat-1',
          },
        ],
      },
    ]);

    expect(catalogItems).toHaveLength(1);
    expect(catalogItems[0]).toMatchObject({
      serverId: 'srv-cat-1',
      contractorId,
      name: 'Pipe',
      unitPriceCents: 1500,
    });
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({
      serverId: 'srv-quote-1',
      status: 'draft_local',
      totalCents: 3000,
      voiceJobId: null,
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.quoteId).toBe(quotes[0]!.id);
    expect(JSON.parse(drafts[0]!.lineItemsJson)).toEqual([
      {
        catalogItemId: catalogItems[0]!.id,
        name: 'Pipe',
        quantity: 2,
        unitPriceCents: 1500,
        confidence: 0.9,
      },
    ]);
  });

  it('re-running upsert updates in place and does not duplicate rows', async () => {
    const serverCatalog = {
      id: 'srv-cat-1',
      name: 'Pipe',
      unit: 'foot',
      unitPriceCents: 1500,
      tradeCategory: 'plumbing',
      isArchived: false,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    const serverQuote = {
      id: 'srv-quote-1',
      status: 'ai_processing',
      customerPhone: null,
      totalCents: 0,
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
      sentAt: null,
      voiceJobId: 'job-1',
      lineItems: [] as [],
    };

    await upsertCatalogItems(contractorId, [serverCatalog]);
    await upsertQuotes(contractorId, [serverQuote]);
    await upsertCatalogItems(contractorId, [{ ...serverCatalog, name: 'Copper pipe', unitPriceCents: 1800 }]);
    await upsertQuotes(contractorId, [
      {
        ...serverQuote,
        status: 'draft_local',
        totalCents: 1800,
        voiceJobId: 'job-1',
        lineItems: [
          {
            id: 'li-1',
            name: 'Copper pipe',
            quantity: 1,
            unitPriceCents: 1800,
            catalogItemId: 'srv-cat-1',
          },
        ],
      },
    ]);

    expect(catalogItems).toHaveLength(1);
    expect(catalogItems[0]!.name).toBe('Copper pipe');
    expect(catalogItems[0]!.unitPriceCents).toBe(1800);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]!.status).toBe('draft_local');
    expect(quotes[0]!.voiceJobId).toBe('job-1');
    expect(drafts).toHaveLength(1);
    expect(JSON.parse(drafts[0]!.lineItemsJson)[0]).toMatchObject({
      name: 'Copper pipe',
      catalogItemId: catalogItems[0]!.id,
    });
  });

  it('does not overwrite a local row that still has a pending write-queue item', async () => {
    const existing = attachUpdate<FakeCatalogItem>({
      id: 'local-cat-keep',
      serverId: 'srv-cat-1',
      contractorId,
      name: 'Local edit',
      unit: 'each',
      unitPriceCents: 999,
      tradeCategory: 'plumbing',
      isArchived: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    catalogItems = [existing];
    queueItems = [{ entityType: 'catalog_item', entityId: 'local-cat-keep', status: 'pending' }];

    await upsertCatalogItems(contractorId, [
      {
        id: 'srv-cat-1',
        name: 'Server name',
        unit: 'foot',
        unitPriceCents: 1500,
        tradeCategory: 'plumbing',
        isArchived: false,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);

    expect(catalogItems).toHaveLength(1);
    expect(catalogItems[0]!.name).toBe('Local edit');
    expect(catalogItems[0]!.unitPriceCents).toBe(999);
  });

  it('adopts a local-only row with the same name instead of creating a duplicate', async () => {
    const existing = attachUpdate<FakeCatalogItem>({
      id: 'local-offline-faucet',
      serverId: null,
      contractorId,
      name: 'Faucet Repair',
      unit: 'each',
      unitPriceCents: 8500,
      tradeCategory: 'plumbing',
      isArchived: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    catalogItems = [existing];

    await upsertCatalogItems(contractorId, [
      {
        id: 'srv-faucet',
        name: 'Faucet Repair',
        unit: 'each',
        unitPriceCents: 8500,
        tradeCategory: 'plumbing',
        isArchived: false,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);

    expect(catalogItems).toHaveLength(1);
    expect(catalogItems[0]).toMatchObject({
      id: 'local-offline-faucet',
      serverId: 'srv-faucet',
      name: 'Faucet Repair',
    });
  });

  it('leaves unmatched local-only rows alone when hydrate pulls unrelated server items', async () => {
    const existing = attachUpdate<FakeCatalogItem>({
      id: 'local-custom',
      serverId: null,
      contractorId,
      name: 'Custom Valve',
      unit: 'each',
      unitPriceCents: 100,
      tradeCategory: 'plumbing',
      isArchived: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    catalogItems = [existing];

    await upsertCatalogItems(contractorId, [
      {
        id: 'srv-pipe',
        name: 'Pipe Repair',
        unit: 'per foot',
        unitPriceCents: 4500,
        tradeCategory: 'plumbing',
        isArchived: false,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);

    expect(catalogItems).toHaveLength(2);
    expect(catalogItems[0]).toMatchObject({
      id: 'local-custom',
      serverId: null,
      name: 'Custom Valve',
    });
    expect(catalogItems[1]).toMatchObject({
      serverId: 'srv-pipe',
      name: 'Pipe Repair',
    });
  });

  it('attaches server id to a blocked local-only row without clobbering queued fields', async () => {
    const existing = attachUpdate<FakeCatalogItem>({
      id: 'local-offline-edit',
      serverId: null,
      contractorId,
      name: 'Faucet Repair',
      unit: 'each',
      unitPriceCents: 999,
      tradeCategory: 'plumbing',
      isArchived: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    catalogItems = [existing];
    queueItems = [{ entityType: 'catalog_item', entityId: 'local-offline-edit', status: 'pending' }];

    await upsertCatalogItems(contractorId, [
      {
        id: 'srv-faucet',
        name: 'Faucet Repair',
        unit: 'each',
        unitPriceCents: 8500,
        tradeCategory: 'plumbing',
        isArchived: false,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);

    expect(catalogItems).toHaveLength(1);
    expect(catalogItems[0]).toMatchObject({
      id: 'local-offline-edit',
      serverId: 'srv-faucet',
      unitPriceCents: 999,
    });
  });

  it('stores voiceJobId so ai_processing quotes can be polled after restore', async () => {
    await upsertQuotes(contractorId, [
      {
        id: 'srv-quote-voice',
        status: 'ai_processing',
        customerPhone: null,
        totalCents: 0,
        createdAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z',
        sentAt: null,
        voiceJobId: 'job-xyz',
        lineItems: [],
      },
    ]);

    expect(quotes[0]).toMatchObject({
      serverId: 'srv-quote-voice',
      status: 'ai_processing',
      voiceJobId: 'job-xyz',
    });
  });
});

describe('hydrateFromServer', () => {
  beforeEach(() => {
    resetHydrateForTests();
    mockedFetchCatalog.mockReset();
    mockedFetchQuotes.mockReset();
    mockedDatabase.get.mockImplementation((table: string) => ({
      query: () => ({ fetch: async () => [] }),
      create: async (writer: (record: Record<string, unknown>) => void) => {
        const record: Record<string, unknown> & {
          update: (fn: (row: Record<string, unknown>) => void) => Promise<void>;
        } = {
          id: `id-${table}`,
          async update(fn) {
            fn(record);
          },
        };
        writer(record);
        return record;
      },
    }));
  });

  afterEach(() => {
    resetHydrateForTests();
  });

  it('fetches catalog and quotes then upserts', async () => {
    mockedFetchCatalog.mockResolvedValue([]);
    mockedFetchQuotes.mockResolvedValue([]);

    await hydrateFromServer(contractorId);

    expect(mockedFetchCatalog).toHaveBeenCalledTimes(1);
    expect(mockedFetchQuotes).toHaveBeenCalledTimes(1);
  });

  it('does not run overlapping hydrates concurrently', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockedFetchCatalog.mockImplementation(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await gate;
      concurrent -= 1;
      return [];
    });
    mockedFetchQuotes.mockResolvedValue([]);

    const first = hydrateFromServer(contractorId);
    const second = hydrateFromServer(contractorId);
    release();
    await Promise.all([first, second]);

    expect(maxConcurrent).toBe(1);
  });
});
