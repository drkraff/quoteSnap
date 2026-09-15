/**
 * CAT-03 catalog soft-archive. Swipe + undo toast; no hard-delete of
 * server-backed SKUs. Prices stay on the same row — never invent a replacement.
 */

export function archiveCatalogSyncPayload(): { isArchived: true } {
  return { isArchived: true };
}

export function unarchiveCatalogSyncPayload(): { isArchived: false } {
  return { isArchived: false };
}

export function catalogArchiveEnqueue(item: { id: string }): {
  entityType: 'catalog_item';
  entityId: string;
  action: 'update';
  payload: { isArchived: true };
} {
  return {
    entityType: 'catalog_item',
    entityId: item.id,
    action: 'update',
    payload: archiveCatalogSyncPayload(),
  };
}

export function catalogUnarchiveEnqueue(item: { id: string }): {
  entityType: 'catalog_item';
  entityId: string;
  action: 'update';
  payload: { isArchived: false };
} {
  return {
    entityType: 'catalog_item',
    entityId: item.id,
    action: 'update',
    payload: unarchiveCatalogSyncPayload(),
  };
}

export type CatalogListItemLike = {
  id: string;
  isArchived?: boolean | null;
  unitPriceCents?: number;
  name?: string;
  tradeCategory?: string | null;
};

/** Active catalog list. Archived rows stay in SQLite; they must not render as actives. */
export function activeCatalogItems<T extends CatalogListItemLike>(items: readonly T[]): T[] {
  return items.filter((item) => item.isArchived !== true);
}

export type CatalogEmptyKind = 'none' | 'empty' | 'no-matches';

/**
 * Empty list UX. Catalog has no search/unit filter today, so a miss is `empty`
 * (calm No items yet). If a name query is ever applied, a miss is `no-matches`
 * — never suggested SKUs or prices. Unfiltered empty after last-item archive
 * is still `empty`.
 */
export function catalogEmptyKind(args: {
  activeCount: number;
  q?: string;
}): CatalogEmptyKind {
  if (args.activeCount > 0) {
    return 'none';
  }
  const q = typeof args.q === 'string' ? args.q.trim() : '';
  return q !== '' ? 'no-matches' : 'empty';
}

export type CatalogSection<T> = { title: string; data: T[] };

/** Group actives only. Archived-only catalogs yield [] — no phantom sections. */
export function groupCatalogByCategory<T extends CatalogListItemLike>(
  items: readonly T[],
): CatalogSection<T>[] {
  const map = new Map<string, T[]>();

  for (const item of activeCatalogItems(items)) {
    const key = item.tradeCategory?.trim() ? item.tradeCategory : 'Other';
    const existing = map.get(key);
    if (existing) {
      existing.push(item);
    } else {
      map.set(key, [item]);
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([title, data]) => ({ title, data }));
}

/**
 * Flip `isArchived` on the matching id only. Unknown ids are a no-op — never
 * insert a row or invent cents. Remaining prices stay as stored.
 */
export function setCatalogItemArchived<T extends CatalogListItemLike>(
  items: readonly T[],
  id: string,
  isArchived: boolean,
): T[] {
  let found = false;
  const next = items.map((item) => {
    if (item.id !== id) {
      return item;
    }
    found = true;
    return { ...item, isArchived };
  });
  return found ? next : [...items];
}

export function isCatalogUnarchiveQueueItem(item: {
  entityType: string;
  action?: string | null;
  payloadJson?: string | null;
}): boolean {
  if (item.entityType !== 'catalog_item' || item.action !== 'update') return false;
  if (typeof item.payloadJson !== 'string' || item.payloadJson.trim() === '') {
    return false;
  }
  try {
    const payload = JSON.parse(item.payloadJson) as { isArchived?: unknown };
    return payload.isArchived === false;
  } catch {
    return false;
  }
}

/**
 * GET /catalog is the active list only (no Archived catalog screen).
 * A local SKU with a serverId missing from that pull was archived on the
 * server and must be hidden. Local-only rows and in-flight queue items
 * (including a dead-letter undo) are left alone.
 */
export function shouldArchiveLocalCatalogItemOnHydrate(input: {
  serverId: string | null | undefined;
  isArchived: boolean;
  blocked: boolean;
  pulledServerIds: ReadonlySet<string>;
}): boolean {
  const serverId = input.serverId?.trim() ?? '';
  if (!serverId) return false;
  if (input.blocked) return false;
  if (input.isArchived) return false;
  return !input.pulledServerIds.has(serverId);
}
