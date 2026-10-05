/** Bookkeeping key stored on queue payloads. Never sent as an API field. */

export const SYNC_OWNER_KEY = '_syncOwnerId';

export function syncOwnerIdFromPayload(payloadJson: string): string | null {
  try {
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    const owner = payload[SYNC_OWNER_KEY];
    if (typeof owner !== 'string') return null;
    const trimmed = owner.trim();
    return trimmed === '' ? null : trimmed;
  } catch {
    return null;
  }
}

export function payloadWithoutSyncOwner(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (!Object.prototype.hasOwnProperty.call(payload, SYNC_OWNER_KEY)) {
    return payload;
  }
  const next = { ...payload };
  delete next[SYNC_OWNER_KEY];
  return next;
}

export function stampSyncOwner(
  payload: Record<string, unknown>,
  contractorId: string | null,
): Record<string, unknown> {
  const id = contractorId?.trim() ?? '';
  if (id === '') return payload;
  return { ...payload, [SYNC_OWNER_KEY]: id };
}

/**
 * Owned by someone else, or owned and nobody is signed in.
 * Legacy rows with no owner still sync for the signed-in contractor.
 */
export function queueItemBlockedForContractor(
  ownerContractorId: string | null,
  currentContractorId: string | null,
): boolean {
  if (!ownerContractorId) return false;
  if (!currentContractorId) return true;
  return ownerContractorId !== currentContractorId;
}
