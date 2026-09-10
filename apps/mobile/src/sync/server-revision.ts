/**
 * Last server `updatedAt` we observed for a quote (hydrate, GET, PUT, AI poll).
 * Used to tell a true fork (server moved under us) from unpushed local edits.
 * In-memory only — login/restore hydrate fills it again after a process restart.
 */

const lastServerUpdatedAt = new Map<string, string>();

export function rememberServerRevision(serverId: string, updatedAt: string): void {
  if (serverId.trim() === '' || updatedAt.trim() === '') return;
  lastServerUpdatedAt.set(serverId, updatedAt);
}

export function getServerRevision(serverId: string): string | null {
  return lastServerUpdatedAt.get(serverId) ?? null;
}

export function resetServerRevisionsForTests(): void {
  lastServerUpdatedAt.clear();
}
