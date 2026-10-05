/**
 * Last server `updatedAt` observed for a quote (hydrate, GET, PUT, AI poll).
 * The map is the fast path for this process. `quotes.server_revision` is the
 * copy that survives process death. Seed the map from that column before a
 * decision, and write the column when accepting a new observation.
 * A missing column value matches an empty map: unpushed local edits are not
 * a fork until a revision has been observed.
 */

const lastServerUpdatedAt = new Map<string, string>();

export function rememberServerRevision(serverId: string, updatedAt: string): void {
  if (typeof serverId !== 'string' || typeof updatedAt !== 'string') return;
  if (serverId.trim() === '' || updatedAt.trim() === '') return;
  lastServerUpdatedAt.set(serverId, updatedAt);
}

/** Fill the map from a stored row only when this process has not observed one yet. */
export function rememberServerRevisionIfAbsent(
  serverId: string | null | undefined,
  updatedAt: string | null | undefined,
): void {
  if (typeof serverId !== 'string' || serverId.trim() === '') return;
  if (getServerRevision(serverId) != null) return;
  if (typeof updatedAt !== 'string') return;
  rememberServerRevision(serverId, updatedAt);
}

export function assignServerRevision(
  record: { serverRevision?: string | null },
  serverId: string,
  updatedAt: string,
): void {
  rememberServerRevision(serverId, updatedAt);
  if (typeof updatedAt !== 'string' || updatedAt.trim() === '') return;
  record.serverRevision = updatedAt;
}

export function getServerRevision(serverId: string): string | null {
  return lastServerUpdatedAt.get(serverId) ?? null;
}

export function resetServerRevisionsForTests(): void {
  lastServerUpdatedAt.clear();
}
