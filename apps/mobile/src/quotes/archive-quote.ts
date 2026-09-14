export const ARCHIVE_QUOTE_CONFIRM_TITLE = 'Archive this quote?';

export const ARCHIVE_QUOTE_CONFIRM_MESSAGE =
  'It will leave your Quotes list. You can restore it later from Archived.';

export const UNARCHIVE_QUOTE_CONFIRM_TITLE = 'Unarchive this quote?';

export const UNARCHIVE_QUOTE_CONFIRM_MESSAGE =
  'It will return to your Quotes list.';

export function archiveQuoteSyncPayload(): { isArchived: true } {
  return { isArchived: true };
}

export function unarchiveQuoteSyncPayload(): { isArchived: false } {
  return { isArchived: false };
}

export type QuoteListItemLike = { id: string; isArchived?: boolean };

/**
 * Active GET wins if a row is somehow in both pulls (should not happen).
 * Archived rows still hydrate so login/restore can show the Archived screen.
 */
export function mergeQuoteHydrateLists<T extends QuoteListItemLike>(
  active: readonly T[],
  archived: readonly T[],
): T[] {
  const byId = new Map<string, T>();
  for (const quote of archived) {
    byId.set(quote.id, quote);
  }
  for (const quote of active) {
    byId.set(quote.id, quote);
  }
  return Array.from(byId.values());
}

export function isQuoteUnarchiveQueueItem(item: {
  entityType: string;
  action?: string | null;
  payloadJson?: string | null;
}): boolean {
  if (item.entityType !== 'quote' || item.action !== 'update') return false;
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

function toMs(value: Date | string | number): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const ms = typeof value === 'string' ? Date.parse(value) : value.getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Last-write-wins on the archive flag. A local Unarchive (or Archive) that is
 * newer than this GET snapshot must not be overwritten — hydrate must not fight
 * Unarchive when GET /quotes still reflects the pre-PATCH row.
 */
export function hydrateArchivedFlag(input: {
  localIsArchived: boolean;
  serverIsArchived: boolean;
  localUpdatedAt: Date | string | number;
  serverUpdatedAt: Date | string | number;
}): boolean {
  if (input.localIsArchived === input.serverIsArchived) {
    return input.serverIsArchived;
  }
  if (toMs(input.localUpdatedAt) > toMs(input.serverUpdatedAt)) {
    return input.localIsArchived;
  }
  return input.serverIsArchived;
}

/**
 * GET /quotes is the active list; GET /quotes?archived=true is archived.
 * A local quote with a serverId that is missing from *both* pulls was archived
 * (or removed) on the server and must be hidden. Local-only rows (no serverId)
 * and in-flight queue items are left alone.
 */
export function shouldArchiveLocalQuoteOnHydrate(input: {
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
