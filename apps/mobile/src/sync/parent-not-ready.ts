/**
 * A queued update/draft/photo/audio whose parent row has no server id yet.
 * This is waiting, not a failed write: do not burn SYNC-03 retries or dead-letter it.
 */

export class ParentNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParentNotReadyError';
  }
}

export function isParentNotReadyError(error: unknown): boolean {
  if (error instanceof ParentNotReadyError) return true;
  if (error instanceof Error && /no server ID/i.test(error.message)) return true;
  return false;
}
