import { fetchCatalogItems } from '../api/catalog';
import { seedCatalog } from '../api/onboarding';
import { database } from '../db';
import { OFFLINE_TRADE_TEMPLATES } from '../data/trade-templates';
import {
  adoptServerIdsByName,
  onboardingSeedEnqueueParams,
  persistOfflineCatalog,
  persistOnlineSeed,
  syncQueuedOnboardingSeed,
} from './offline-onboarding-seed';

jest.mock('../db', () => ({
  database: {
    write: jest.fn(async (fn: () => Promise<unknown>) => fn()),
    get: jest.fn(),
  },
}));

jest.mock('../api/onboarding', () => ({
  seedCatalog: jest.fn(),
}));

jest.mock('../api/catalog', () => ({
  fetchCatalogItems: jest.fn(),
}));

jest.mock('@nozbe/watermelondb', () => ({
  Q: {
    where: jest.fn(),
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
  update: (fn: (record: FakeCatalogItem) => void) => Promise<void>;
};

const mockedDatabase = database as unknown as {
  write: jest.Mock;
  get: jest.Mock;
};
const mockedSeedCatalog = seedCatalog as unknown as jest.Mock;
const mockedFetchCatalog = fetchCatalogItems as unknown as jest.Mock;

const contractorId = 'contractor-1';

function attachUpdate(record: Omit<FakeCatalogItem, 'update'>): FakeCatalogItem {
  const row = record as FakeCatalogItem;
  row.update = async (fn) => {
    fn(row);
  };
  return row;
}

describe('onboardingSeedEnqueueParams', () => {
  it('queues a single /onboarding/seed job keyed by contractor, not per-item creates', () => {
    expect(onboardingSeedEnqueueParams(contractorId, 'plumbing')).toEqual({
      entityType: 'onboarding',
      entityId: contractorId,
      action: 'seed',
      payload: { trade: 'plumbing' },
    });
  });
});

describe('persistOfflineCatalog / persistOnlineSeed / adoptServerIdsByName', () => {
  let catalogItems: FakeCatalogItem[];
  let createSeq: number;

  beforeEach(() => {
    catalogItems = [];
    createSeq = 0;
    mockedDatabase.get.mockImplementation(() => ({
      query: () => ({
        fetch: async () => catalogItems,
      }),
      create: async (writer: (record: FakeCatalogItem) => void) => {
        createSeq += 1;
        const record = attachUpdate({
          id: `local-cat-${createSeq}`,
          serverId: 'sentinel',
          contractorId: '',
          name: '',
          unit: '',
          unitPriceCents: 0,
          tradeCategory: null,
          isArchived: true,
        });
        writer(record);
        catalogItems.push(record);
        return record;
      },
    }));
  });

  it('writes bundled templates with serverId null', async () => {
    const count = await persistOfflineCatalog(contractorId, 'plumbing');
    const expected = OFFLINE_TRADE_TEMPLATES.plumbing;

    expect(count).toBe(expected.length);
    expect(catalogItems).toHaveLength(expected.length);
    expect(catalogItems.every((row) => row.serverId === null)).toBe(true);
    expect(catalogItems.map((row) => row.name)).toEqual(expected.map((item) => item.name));
    expect(catalogItems[0]).toMatchObject({
      contractorId,
      unit: expected[0]!.unit,
      unitPriceCents: expected[0]!.unitPriceCents,
      tradeCategory: 'plumbing',
      isArchived: false,
    });
  });

  it('online seed writes server ids and does not leave local-only rows', async () => {
    await persistOnlineSeed(contractorId, [
      {
        id: 'srv-1',
        name: 'Faucet Repair',
        unit: 'each',
        unitPriceCents: 8500,
        tradeCategory: 'plumbing',
      },
    ]);

    expect(catalogItems).toHaveLength(1);
    expect(catalogItems[0]).toMatchObject({
      serverId: 'srv-1',
      name: 'Faucet Repair',
      contractorId,
    });
  });

  it('maps server ids onto local-only rows by name and does not create extras', async () => {
    catalogItems = [
      attachUpdate({
        id: 'local-faucet',
        serverId: null,
        contractorId,
        name: 'Faucet Repair',
        unit: 'each',
        unitPriceCents: 8500,
        tradeCategory: 'plumbing',
        isArchived: false,
      }),
      attachUpdate({
        id: 'local-custom',
        serverId: null,
        contractorId,
        name: 'Custom Valve',
        unit: 'each',
        unitPriceCents: 100,
        tradeCategory: 'plumbing',
        isArchived: false,
      }),
    ];

    await adoptServerIdsByName(contractorId, [
      { id: 'srv-faucet', name: 'Faucet Repair' },
      { id: 'srv-toilet', name: 'Toilet Install' },
    ]);

    expect(catalogItems).toHaveLength(2);
    expect(catalogItems[0]).toMatchObject({ id: 'local-faucet', serverId: 'srv-faucet' });
    expect(catalogItems[1]).toMatchObject({ id: 'local-custom', serverId: null });
  });

  it('does not overwrite an already-mapped local row when the same name appears again', async () => {
    catalogItems = [
      attachUpdate({
        id: 'already-mapped',
        serverId: 'srv-existing',
        contractorId,
        name: 'Faucet Repair',
        unit: 'each',
        unitPriceCents: 8500,
        tradeCategory: 'plumbing',
        isArchived: false,
      }),
      attachUpdate({
        id: 'second-faucet',
        serverId: null,
        contractorId,
        name: 'Faucet Repair',
        unit: 'each',
        unitPriceCents: 8500,
        tradeCategory: 'plumbing',
        isArchived: false,
      }),
    ];

    await adoptServerIdsByName(contractorId, [{ id: 'srv-existing', name: 'Faucet Repair' }]);

    expect(catalogItems[0]!.serverId).toBe('srv-existing');
    expect(catalogItems[1]!.serverId).toBeNull();
  });
});

describe('syncQueuedOnboardingSeed', () => {
  let catalogItems: FakeCatalogItem[];

  beforeEach(() => {
    catalogItems = [
      attachUpdate({
        id: 'local-faucet',
        serverId: null,
        contractorId,
        name: 'Faucet Repair',
        unit: 'each',
        unitPriceCents: 8500,
        tradeCategory: 'plumbing',
        isArchived: false,
      }),
    ];
    mockedSeedCatalog.mockReset();
    mockedFetchCatalog.mockReset();
    mockedDatabase.get.mockImplementation(() => ({
      query: () => ({
        fetch: async () => catalogItems,
      }),
    }));
  });

  it('on 201 stamps server ids from the seed response', async () => {
    mockedSeedCatalog.mockResolvedValue({
      trade: 'plumbing',
      itemCount: 1,
      items: [
        {
          id: 'srv-faucet',
          name: 'Faucet Repair',
          unit: 'each',
          unitPriceCents: 8500,
          tradeCategory: 'plumbing',
        },
      ],
    });

    await syncQueuedOnboardingSeed(contractorId, 'plumbing');

    expect(mockedSeedCatalog).toHaveBeenCalledWith('plumbing');
    expect(mockedFetchCatalog).not.toHaveBeenCalled();
    expect(catalogItems[0]!.serverId).toBe('srv-faucet');
  });

  it('on 409 pulls GET /catalog and maps by name instead of POSTing catalog creates', async () => {
    mockedSeedCatalog.mockRejectedValue({ status: 409, error: 'Catalog already seeded' });
    mockedFetchCatalog.mockResolvedValue([
      {
        id: 'srv-from-get',
        name: 'Faucet Repair',
        unit: 'each',
        unitPriceCents: 8500,
        tradeCategory: 'plumbing',
        isArchived: false,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);

    await syncQueuedOnboardingSeed(contractorId, 'plumbing');

    expect(mockedSeedCatalog).toHaveBeenCalledWith('plumbing');
    expect(mockedFetchCatalog).toHaveBeenCalledTimes(1);
    expect(catalogItems[0]!.serverId).toBe('srv-from-get');
  });

  it('rethrows non-409 failures so the queue can retry', async () => {
    mockedSeedCatalog.mockRejectedValue({ status: 500, error: 'Internal server error' });

    await expect(syncQueuedOnboardingSeed(contractorId, 'plumbing')).rejects.toMatchObject({
      status: 500,
    });
    expect(mockedFetchCatalog).not.toHaveBeenCalled();
    expect(catalogItems[0]!.serverId).toBeNull();
  });
});
