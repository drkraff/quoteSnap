import {
  activeCatalogItems,
  archiveCatalogSyncPayload,
  catalogArchiveEnqueue,
  catalogEmptyKind,
  catalogUnarchiveEnqueue,
  groupCatalogByCategory,
  isCatalogUnarchiveQueueItem,
  setCatalogItemArchived,
  shouldArchiveLocalCatalogItemOnHydrate,
  unarchiveCatalogSyncPayload,
} from './archive-item';

const PIPE = {
  id: 'local-pipe',
  name: 'Copper pipe',
  unitPriceCents: 1800,
  tradeCategory: 'plumbing',
  isArchived: false,
};
const LABOR = {
  id: 'local-labor',
  name: 'Labor',
  unitPriceCents: 12500,
  tradeCategory: 'plumbing',
  isArchived: false,
};
const ARCHIVED_VENT = {
  id: 'local-vent',
  name: 'Vent',
  unitPriceCents: 4500,
  tradeCategory: 'hvac',
  isArchived: true,
};

describe('archiveCatalogSyncPayload', () => {
  it('enqueues the CAT-03 isArchived flag, not a hard-delete or price write', () => {
    expect(archiveCatalogSyncPayload()).toEqual({ isArchived: true });
    expect(unarchiveCatalogSyncPayload()).toEqual({ isArchived: false });
    expect(catalogArchiveEnqueue(PIPE)).toEqual({
      entityType: 'catalog_item',
      entityId: PIPE.id,
      action: 'update',
      payload: { isArchived: true },
    });
    expect(catalogUnarchiveEnqueue(PIPE)).toEqual({
      entityType: 'catalog_item',
      entityId: PIPE.id,
      action: 'update',
      payload: { isArchived: false },
    });
  });
});

describe('activeCatalogItems / groupCatalogByCategory', () => {
  it('hides archived rows so an archived-only catalog has no phantom actives', () => {
    expect(activeCatalogItems([PIPE, ARCHIVED_VENT])).toEqual([PIPE]);
    expect(activeCatalogItems([ARCHIVED_VENT])).toEqual([]);
    expect(groupCatalogByCategory([ARCHIVED_VENT])).toEqual([]);
  });

  it('groups remaining actives and leaves stored cents untouched', () => {
    const sections = groupCatalogByCategory([PIPE, LABOR, ARCHIVED_VENT]);
    expect(sections).toEqual([
      { title: 'plumbing', data: [PIPE, LABOR] },
    ]);
    expect(sections[0]?.data.map((row) => row.unitPriceCents)).toEqual([1800, 12500]);
  });
});

describe('catalogEmptyKind', () => {
  it('returns empty after the last active is gone — never suggested SKUs', () => {
    expect(catalogEmptyKind({ activeCount: 0 })).toBe('empty');
    expect(catalogEmptyKind({ activeCount: 2 })).toBe('none');
  });

  it('uses no-matches for a name-query miss instead of inventing rows', () => {
    expect(catalogEmptyKind({ activeCount: 0, q: 'pipe' })).toBe('no-matches');
    expect(catalogEmptyKind({ activeCount: 1, q: 'pipe' })).toBe('none');
    expect(catalogEmptyKind({ activeCount: 0, q: '   ' })).toBe('empty');
  });
});

describe('setCatalogItemArchived', () => {
  it('archives the last item in place and does not invent a replacement SKU or price', () => {
    const next = setCatalogItemArchived([PIPE], PIPE.id, true);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: PIPE.id,
      name: 'Copper pipe',
      unitPriceCents: 1800,
      isArchived: true,
    });
    expect(activeCatalogItems(next)).toEqual([]);
    expect(catalogEmptyKind({ activeCount: activeCatalogItems(next).length })).toBe('empty');
    expect(groupCatalogByCategory(next)).toEqual([]);
  });

  it('undo restores the same id and cents — never a new row', () => {
    const archived = setCatalogItemArchived([PIPE], PIPE.id, true);
    const restored = setCatalogItemArchived(archived, PIPE.id, false);
    expect(restored).toEqual([PIPE]);
    expect(restored[0]?.unitPriceCents).toBe(1800);
    expect(activeCatalogItems(restored)).toEqual([PIPE]);
  });

  it('leaves remaining prices untouched when one of several is archived', () => {
    const next = setCatalogItemArchived([PIPE, LABOR], PIPE.id, true);
    expect(activeCatalogItems(next)).toEqual([{ ...LABOR }]);
    expect(next.find((row) => row.id === LABOR.id)?.unitPriceCents).toBe(12500);
  });

  it('does not invent a row when the id is missing', () => {
    expect(setCatalogItemArchived([PIPE], 'missing', true)).toEqual([PIPE]);
    expect(setCatalogItemArchived([], PIPE.id, false)).toEqual([]);
  });
});

describe('isCatalogUnarchiveQueueItem', () => {
  it('matches a catalog undo payload', () => {
    expect(
      isCatalogUnarchiveQueueItem({
        entityType: 'catalog_item',
        action: 'update',
        payloadJson: JSON.stringify({ isArchived: false }),
      }),
    ).toBe(true);
  });

  it('ignores archive, quotes, and malformed payloads', () => {
    expect(
      isCatalogUnarchiveQueueItem({
        entityType: 'catalog_item',
        action: 'update',
        payloadJson: JSON.stringify({ isArchived: true }),
      }),
    ).toBe(false);
    expect(
      isCatalogUnarchiveQueueItem({
        entityType: 'quote',
        action: 'update',
        payloadJson: JSON.stringify({ isArchived: false }),
      }),
    ).toBe(false);
    expect(
      isCatalogUnarchiveQueueItem({
        entityType: 'catalog_item',
        action: 'update',
        payloadJson: '{',
      }),
    ).toBe(false);
  });
});

describe('shouldArchiveLocalCatalogItemOnHydrate', () => {
  it('hides a server-backed active omitted from GET /catalog', () => {
    expect(
      shouldArchiveLocalCatalogItemOnHydrate({
        serverId: 'srv-pipe',
        isArchived: false,
        blocked: false,
        pulledServerIds: new Set(),
      }),
    ).toBe(true);
  });

  it('leaves local-only, already-archived, blocked, and still-active rows alone', () => {
    const pulled = new Set(['srv-keep']);
    expect(
      shouldArchiveLocalCatalogItemOnHydrate({
        serverId: null,
        isArchived: false,
        blocked: false,
        pulledServerIds: pulled,
      }),
    ).toBe(false);
    expect(
      shouldArchiveLocalCatalogItemOnHydrate({
        serverId: 'srv-old',
        isArchived: true,
        blocked: false,
        pulledServerIds: pulled,
      }),
    ).toBe(false);
    expect(
      shouldArchiveLocalCatalogItemOnHydrate({
        serverId: 'srv-undo',
        isArchived: false,
        blocked: true,
        pulledServerIds: new Set(),
      }),
    ).toBe(false);
    expect(
      shouldArchiveLocalCatalogItemOnHydrate({
        serverId: 'srv-keep',
        isArchived: false,
        blocked: false,
        pulledServerIds: pulled,
      }),
    ).toBe(false);
  });
});
