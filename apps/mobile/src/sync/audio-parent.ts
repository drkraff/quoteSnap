/**
 * Voice-first quotes are created locally as `ai_processing` and only receive a
 * server id when POST /voice/upload creates the server row.
 *
 * Any other quote without a server id still has a create in the sync queue —
 * uploading now would insert a second server quote (orphaned audio / duplicate).
 *
 * Once a server id is known (202 body, or 500 after the quote row exists),
 * retries must pass it so the backend reuses that row.
 */
const VOICE_FIRST_STATUS = 'ai_processing';

export function resolveAudioQuoteServerId(quote: {
  serverId?: string | null;
  status: string;
}): string | undefined {
  const serverId = quote.serverId?.trim() ? quote.serverId.trim() : undefined;
  if (serverId) return serverId;
  if (quote.status === VOICE_FIRST_STATUS) return undefined;
  throw new Error('Cannot sync audio: parent quote has no server ID yet');
}

/** Pull quoteId off a failed POST /voice/upload so the next retry can reuse it. */
export function quoteServerIdFromUploadError(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('quoteId' in error)) {
    return undefined;
  }
  const value = (error as { quoteId: unknown }).quoteId;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
