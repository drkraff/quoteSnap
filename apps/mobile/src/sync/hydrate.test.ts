import { fetchCatalogItems } from '../api/catalog';
import { fetchQuotes } from '../api/quotes';
import { database } from '../db';
import {
  hydrateFromServer,
  mergeHydratedTradeCategory,
  resetHydrateForTests,
  toDraftLineItems,
  upsertCatalogItems,
  upsertQuotes,
} from './hydrate';
import { NEEDS_REVIEW_STATUS } from './draft-conflict';
import { resetServerRevisionsForTests } from './server-revision';

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
  isArchived: boolean;
  privateNote?: string | null;
  clientSentence?: string | null;
  roomsJson?: string | null;
  photosJson?: string | null;
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
  id?: string;
  entityType: string;
  entityId: string;
  action?: string;
  status: string;
  payloadJson?: string;
  retryCount?: number;
  nextRetryAt?: Date | null;
  destroyPermanently?: () => Promise<void>;
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

describe('mergeHydratedTradeCategory', () => {
  it('keeps a local tradeCategory when the server stored null (A-15)', () => {
    expect(mergeHydratedTradeCategory('plumbing', null)).toBe('plumbing');
  });

  it('uses the server category when it is present', () => {
    expect(mergeHydratedTradeCategory('plumbing', 'electrical')).toBe('electrical');
    expect(mergeHydratedTradeCategory(null, 'hvac')).toBe('hvac');
  });
});

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
          priceSource: 'catalog',
        },
        {
          id: 'li-2',
          name: 'Manual',
          quantity: 1,
          unitPriceCents: 200,
          catalogItemId: null,
          privateNote: 'moisture from neighbor',
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
        priceSource: 'catalog',
      },
      {
        catalogItemId: '',
        name: 'Manual',
        quantity: 1,
        unitPriceCents: 200,
        privateNote: 'moisture from neighbor',
      },
    ]);
  });

  it('keeps optionGroupId + optionRole on hydrate draft JSON', () => {
    const groupId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const items = toDraftLineItems(
      [
        {
          id: 'li-1',
          name: 'Walk-in shower',
          quantity: 1,
          unitPriceCents: 180000,
          catalogItemId: null,
          optionGroupId: groupId,
          optionRole: 'base',
        },
        {
          id: 'li-2',
          name: 'Keep the tub',
          quantity: 1,
          unitPriceCents: 45000,
          catalogItemId: null,
          optionGroupId: groupId,
          optionRole: 'alt',
        },
      ],
      new Map(),
    );
    expect(items[0]).toMatchObject({
      name: 'Walk-in shower',
      optionGroupId: groupId,
      optionRole: 'base',
    });
    expect(items[1]).toMatchObject({
      name: 'Keep the tub',
      optionGroupId: groupId,
      optionRole: 'alt',
    });
  });

  it('keeps roomId on hydrate draft JSON', () => {
    const kitchenId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const items = toDraftLineItems(
      [
        {
          id: 'li-1',
          name: 'Cabinets',
          quantity: 14,
          unitPriceCents: null,
          catalogItemId: null,
          roomId: kitchenId,
        },
      ],
      new Map(),
    );
    expect(items[0]).toMatchObject({
      name: 'Cabinets',
      roomId: kitchenId,
      unitPriceCents: null,
    });
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
    resetServerRevisionsForTests();
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
            isArchived: false,
            privateNote: null,
            clientSentence: null,
            roomsJson: null,
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
        if (table === 'sync_queue_items') {
          const record: FakeQueueItem = {
            id: `local-queue-${createSeq}`,
            entityType: '',
            entityId: '',
            action: '',
            payloadJson: '',
            status: '',
            retryCount: 0,
            nextRetryAt: null,
            async destroyPermanently() {
              queueItems = queueItems.filter((item) => item !== record);
            },
          };
          writer(record as unknown as Record<string, unknown>);
          queueItems.push(record);
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
        privateNote: 'subcontractor check',
        clientSentence: 'Appliances not included.',
        rooms: [
          {
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            name: 'Kitchen',
            privateNote: 'internal only',
          },
        ],
        photos: [
          {
            id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            mime: 'image/jpeg',
            roomId: null,
            lineClientId: null,
            uploaded: true,
          },
        ],
        lineItems: [
          {
            id: 'li-1',
            name: 'Pipe',
            quantity: 2,
            unitPriceCents: 1500,
            confidence: 0.9,
            catalogItemId: 'srv-cat-1',
            privateNote: 'moisture from neighbor',
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
      privateNote: 'subcontractor check',
      clientSentence: 'Appliances not included.',
    });
    expect(JSON.parse(quotes[0]!.roomsJson ?? '[]')).toEqual([
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        name: 'Kitchen',
        privateNote: 'internal only',
      },
    ]);
    expect(JSON.parse(quotes[0]!.photosJson ?? '[]')).toEqual([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        localUri: '',
        mime: 'image/jpeg',
        status: 'uploaded',
        serverId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        roomId: null,
        lineClientId: null,
      },
    ]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.quoteId).toBe(quotes[0]!.id);
    expect(JSON.parse(drafts[0]!.lineItemsJson)).toEqual([
      {
        catalogItemId: catalogItems[0]!.id,
        name: 'Pipe',
        quantity: 2,
        unitPriceCents: 1500,
        confidence: 0.9,
        privateNote: 'moisture from neighbor',
      },
    ]);
  });

  it('does not resurrect a last-remove empty photo strip on re-hydrate', async () => {
    const serverQuote = {
      id: 'srv-quote-1',
      status: 'draft_local',
      customerPhone: null,
      totalCents: 0,
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
      sentAt: null,
      voiceJobId: null,
      photos: [
        {
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          mime: 'image/jpeg',
          roomId: null,
          lineClientId: null,
          uploaded: true,
        },
      ],
      lineItems: [] as [],
    };

    await upsertQuotes(contractorId, [serverQuote]);
    expect(JSON.parse(quotes[0]!.photosJson ?? '[]')).toHaveLength(1);

    quotes[0]!.photosJson = '[]';
    await upsertQuotes(contractorId, [serverQuote]);

    expect(quotes).toHaveLength(1);
    expect(JSON.parse(quotes[0]!.photosJson ?? '[]')).toEqual([]);
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

  it('does not wipe a local tradeCategory when the server row is null (A-15)', async () => {
    const existing = attachUpdate<FakeCatalogItem>({
      id: 'local-cat-keep',
      serverId: 'srv-cat-1',
      contractorId,
      name: 'Custom Valve',
      unit: 'each',
      unitPriceCents: 12500,
      tradeCategory: 'plumbing',
      isArchived: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    catalogItems = [existing];

    await upsertCatalogItems(contractorId, [
      {
        id: 'srv-cat-1',
        name: 'Custom Valve',
        unit: 'each',
        unitPriceCents: 12500,
        tradeCategory: null,
        isArchived: false,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);

    expect(catalogItems).toHaveLength(1);
    expect(catalogItems[0]!.tradeCategory).toBe('plumbing');
  });

  it('soft-archives a local server-backed SKU omitted from GET /catalog without inventing a replacement', async () => {
    const leftover = attachUpdate<FakeCatalogItem>({
      id: 'local-old-sku',
      serverId: 'srv-old-sku',
      contractorId,
      name: 'Copper pipe',
      unit: 'foot',
      unitPriceCents: 1800,
      tradeCategory: 'plumbing',
      isArchived: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    const keep = attachUpdate<FakeCatalogItem>({
      id: 'local-keep-sku',
      serverId: 'srv-keep-sku',
      contractorId,
      name: 'Labor',
      unit: 'hour',
      unitPriceCents: 12500,
      tradeCategory: 'plumbing',
      isArchived: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    const localOnly = attachUpdate<FakeCatalogItem>({
      id: 'local-only-sku',
      serverId: null,
      contractorId,
      name: 'Custom valve',
      unit: 'each',
      unitPriceCents: 9900,
      tradeCategory: 'plumbing',
      isArchived: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    catalogItems = [leftover, keep, localOnly];

    await upsertCatalogItems(contractorId, [
      {
        id: 'srv-keep-sku',
        name: 'Labor',
        unit: 'hour',
        unitPriceCents: 12500,
        tradeCategory: 'plumbing',
        isArchived: false,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);

    expect(catalogItems).toHaveLength(3);
    expect(leftover.isArchived).toBe(true);
    expect(leftover.unitPriceCents).toBe(1800);
    expect(leftover.name).toBe('Copper pipe');
    expect(keep.isArchived).toBe(false);
    expect(keep.unitPriceCents).toBe(12500);
    expect(localOnly.isArchived).toBe(false);
    expect(localOnly.unitPriceCents).toBe(9900);
  });

  it('does not invent SKUs when GET /catalog is empty and leftover actives are archived', async () => {
    const last = attachUpdate<FakeCatalogItem>({
      id: 'local-last-sku',
      serverId: 'srv-last-sku',
      contractorId,
      name: 'Copper pipe',
      unit: 'foot',
      unitPriceCents: 1800,
      tradeCategory: 'plumbing',
      isArchived: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    catalogItems = [last];

    await upsertCatalogItems(contractorId, []);

    expect(catalogItems).toHaveLength(1);
    expect(catalogItems[0]).toBe(last);
    expect(last.isArchived).toBe(true);
    expect(last.unitPriceCents).toBe(1800);
  });

  it('does not hide a catalog undo still in the dead-letter queue', async () => {
    const restored = attachUpdate<FakeCatalogItem>({
      id: 'local-undo-sku',
      serverId: 'srv-undo-sku',
      contractorId,
      name: 'Copper pipe',
      unit: 'foot',
      unitPriceCents: 1800,
      tradeCategory: 'plumbing',
      isArchived: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    catalogItems = [restored];
    queueItems = [
      {
        entityType: 'catalog_item',
        entityId: 'local-undo-sku',
        action: 'update',
        status: 'dead_letter',
        payloadJson: JSON.stringify({ isArchived: false }),
      },
    ];

    await upsertCatalogItems(contractorId, []);

    expect(restored.isArchived).toBe(false);
    expect(restored.unitPriceCents).toBe(1800);
    expect(catalogItems).toHaveLength(1);
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
      unit: 'foot',
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

  it('applies server line items on a dirty draft fork and parks needs_review (SYNC-05)', async () => {
    const localQuote = attachUpdate<FakeQuote>({
      id: 'local-quote-1',
      serverId: 'srv-quote-1',
      contractorId,
      status: 'draft_local',
      customerPhone: null,
      totalCents: 3400,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      sentAt: null,
      voiceJobId: null,
      isArchived: false,
    });
    const localDraft = attachUpdate<FakeDraft>({
      id: 'local-draft-1',
      quoteId: 'local-quote-1',
      lineItemsJson: JSON.stringify([
        { name: 'Pipe', quantity: 2, unitPriceCents: 1500 },
        { name: 'Elbow', quantity: 1, unitPriceCents: 400 },
      ]),
      notes: null,
      updatedAt: new Date(0),
    });
    quotes = [localQuote];
    drafts = [localDraft];
    const pending: FakeQueueItem = {
      entityType: 'draft',
      entityId: 'local-draft-1',
      action: 'update',
      status: 'pending',
      async destroyPermanently() {
        pending.status = 'destroyed';
      },
    };
    queueItems = [pending];

    await upsertQuotes(contractorId, [
      {
        id: 'srv-quote-1',
        status: 'draft_local',
        customerPhone: '+15550001111',
        totalCents: 1500,
        createdAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T01:00:00.000Z',
        sentAt: null,
        voiceJobId: null,
        lineItems: [
          {
            id: 'li-1',
            name: 'Pipe',
            quantity: 1,
            unitPriceCents: 1500,
          },
        ],
      },
    ]);

    expect(JSON.parse(localDraft.lineItemsJson)).toEqual([
      { catalogItemId: '', name: 'Pipe', quantity: 1, unitPriceCents: 1500 },
    ]);
    expect(localQuote.customerPhone).toBe('+15550001111');
    expect(pending.status).toBe('destroyed');
    const review = queueItems.find((item) => item.status === NEEDS_REVIEW_STATUS);
    expect(review).toMatchObject({
      entityType: 'draft',
      entityId: 'local-draft-1',
      status: NEEDS_REVIEW_STATUS,
    });
  });

  it('applies server line items on a sent quote even when a draft PUT is queued (SYNC-06)', async () => {
    const localQuote = attachUpdate<FakeQuote>({
      id: 'local-quote-1',
      serverId: 'srv-quote-1',
      contractorId,
      status: 'draft_queued',
      customerPhone: null,
      totalCents: 3400,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      sentAt: null,
      voiceJobId: null,
      isArchived: false,
    });
    const localDraft = attachUpdate<FakeDraft>({
      id: 'local-draft-1',
      quoteId: 'local-quote-1',
      lineItemsJson: JSON.stringify([
        { name: 'Pipe', quantity: 2, unitPriceCents: 1500 },
        { name: 'Elbow', quantity: 1, unitPriceCents: 400 },
      ]),
      notes: null,
      updatedAt: new Date(0),
    });
    quotes = [localQuote];
    drafts = [localDraft];
    queueItems = [
      {
        entityType: 'draft',
        entityId: 'local-draft-1',
        action: 'update',
        status: 'pending',
      },
    ];

    await upsertQuotes(contractorId, [
      {
        id: 'srv-quote-1',
        status: 'sent',
        customerPhone: '+15550001111',
        totalCents: 1500,
        createdAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T01:00:00.000Z',
        sentAt: '2026-09-02T01:00:00.000Z',
        voiceJobId: null,
        lineItems: [
          {
            id: 'li-1',
            name: 'Pipe',
            quantity: 1,
            unitPriceCents: 1500,
          },
        ],
      },
    ]);

    expect(localQuote.status).toBe('sent');
    expect(localQuote.totalCents).toBe(1500);
    expect(JSON.parse(localDraft.lineItemsJson)).toEqual([
      { catalogItemId: '', name: 'Pipe', quantity: 1, unitPriceCents: 1500 },
    ]);
    expect(queueItems[0]!.status).toBe('pending');
    expect(queueItems.some((item) => item.status === NEEDS_REVIEW_STATUS)).toBe(false);
  });

  it('does not park needs_review when a dirty draft already matches the server', async () => {
    const localQuote = attachUpdate<FakeQuote>({
      id: 'local-quote-1',
      serverId: 'srv-quote-1',
      contractorId,
      status: 'draft_local',
      customerPhone: null,
      totalCents: 1500,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      sentAt: null,
      voiceJobId: null,
      isArchived: false,
    });
    const localDraft = attachUpdate<FakeDraft>({
      id: 'local-draft-1',
      quoteId: 'local-quote-1',
      lineItemsJson: JSON.stringify([
        { catalogItemId: '', name: 'Pipe', quantity: 1, unitPriceCents: 1500 },
      ]),
      notes: null,
      updatedAt: new Date(0),
    });
    quotes = [localQuote];
    drafts = [localDraft];
    queueItems = [{ entityType: 'draft', entityId: 'local-draft-1', action: 'update', status: 'pending' }];

    await upsertQuotes(contractorId, [
      {
        id: 'srv-quote-1',
        status: 'draft_local',
        customerPhone: null,
        totalCents: 1500,
        createdAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T01:00:00.000Z',
        sentAt: null,
        voiceJobId: null,
        lineItems: [
          {
            id: 'li-1',
            name: 'Pipe',
            quantity: 1,
            unitPriceCents: 1500,
          },
        ],
      },
    ]);

    expect(localDraft.lineItemsJson).toContain('Pipe');
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0]!.status).toBe('pending');
    expect(queueItems.some((item) => item.status === NEEDS_REVIEW_STATUS)).toBe(false);
  });

  it('soft-archives a local server-backed quote omitted from the active list', async () => {
    const leftover = attachUpdate<FakeQuote>({
      id: 'local-old-test',
      serverId: 'srv-old-test',
      contractorId,
      status: 'draft_local',
      customerPhone: null,
      totalCents: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      sentAt: null,
      voiceJobId: null,
      isArchived: false,
    });
    const keep = attachUpdate<FakeQuote>({
      id: 'local-keep',
      serverId: 'srv-keep',
      contractorId,
      status: 'draft_local',
      customerPhone: null,
      totalCents: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      sentAt: null,
      voiceJobId: null,
      isArchived: false,
    });
    const localOnly = attachUpdate<FakeQuote>({
      id: 'local-only',
      serverId: null,
      contractorId,
      status: 'draft_local',
      customerPhone: null,
      totalCents: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      sentAt: null,
      voiceJobId: null,
      isArchived: false,
    });
    quotes = [leftover, keep, localOnly];

    await upsertQuotes(contractorId, [
      {
        id: 'srv-keep',
        status: 'draft_local',
        customerPhone: null,
        totalCents: 0,
        createdAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z',
        sentAt: null,
        voiceJobId: null,
        lineItems: [],
      },
    ]);

    expect(leftover.isArchived).toBe(true);
    expect(keep.isArchived).toBe(false);
    expect(localOnly.isArchived).toBe(false);
  });

  it('hydrates archived quotes from the archived pull onto a fresh device', async () => {
    await upsertQuotes(contractorId, [
      {
        id: 'srv-archived',
        status: 'draft_local',
        customerPhone: '+15550001111',
        totalCents: 1500,
        createdAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z',
        sentAt: null,
        voiceJobId: null,
        isArchived: true,
        lineItems: [],
      },
    ]);

    expect(quotes[0]).toMatchObject({
      serverId: 'srv-archived',
      isArchived: true,
      customerPhone: '+15550001111',
    });
  });

  it('does not re-archive a newer local unarchive when the archived GET is stale', async () => {
    const local = attachUpdate<FakeQuote>({
      id: 'local-restored',
      serverId: 'srv-restored',
      contractorId,
      status: 'draft_local',
      customerPhone: null,
      totalCents: 0,
      createdAt: new Date(0),
      updatedAt: new Date('2026-09-14T12:00:00.000Z'),
      sentAt: null,
      voiceJobId: null,
      isArchived: false,
    });
    quotes = [local];

    await upsertQuotes(contractorId, [
      {
        id: 'srv-restored',
        status: 'draft_local',
        customerPhone: null,
        totalCents: 0,
        createdAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-14T11:00:00.000Z',
        sentAt: null,
        voiceJobId: null,
        isArchived: true,
        lineItems: [],
      },
    ]);

    expect(local.isArchived).toBe(false);
    expect(local.updatedAt).toEqual(new Date('2026-09-14T12:00:00.000Z'));
  });

  it('does not hide a quote with a dead-letter unarchive still in the queue', async () => {
    const leftover = attachUpdate<FakeQuote>({
      id: 'local-unarchive',
      serverId: 'srv-unarchive',
      contractorId,
      status: 'draft_local',
      customerPhone: null,
      totalCents: 0,
      createdAt: new Date(0),
      updatedAt: new Date('2026-09-14T12:00:00.000Z'),
      sentAt: null,
      voiceJobId: null,
      isArchived: false,
    });
    quotes = [leftover];
    queueItems = [
      {
        entityType: 'quote',
        entityId: 'local-unarchive',
        action: 'update',
        status: 'dead_letter',
        payloadJson: JSON.stringify({ isArchived: false }),
      },
    ];

    await upsertQuotes(contractorId, []);

    expect(leftover.isArchived).toBe(false);
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
    expect(mockedFetchQuotes).toHaveBeenCalledTimes(2);
    expect(mockedFetchQuotes).toHaveBeenNthCalledWith(1);
    expect(mockedFetchQuotes).toHaveBeenNthCalledWith(2, { archived: true });
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
