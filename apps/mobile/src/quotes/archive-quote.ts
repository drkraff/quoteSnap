export const ARCHIVE_QUOTE_CONFIRM_TITLE = 'Archive this quote?';

export const ARCHIVE_QUOTE_CONFIRM_MESSAGE =
  'It will leave your Quotes list. The quote stays saved so it does not come back after sync.';

export function archiveQuoteSyncPayload(): { isArchived: true } {
  return { isArchived: true };
}

/**
 * GET /quotes returns active rows only (catalog list pattern). A local quote
 * with a serverId that is missing from that pull was archived on the server
 * and must be hidden — otherwise hydrate would keep showing test drafts.
 * Local-only rows (no serverId) and in-flight queue items are left alone.
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
