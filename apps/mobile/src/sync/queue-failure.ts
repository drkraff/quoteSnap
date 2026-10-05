import { isApiError, isUnauthorizedError } from '../api/client';
import { isFrozenQuoteWriteError } from './frozen-quote';
import { isParentNotReadyError } from './parent-not-ready';

/**
 * How processQueue should treat a push failure.
 * - defer: parent create has not finished; leave pending and do not count a retry
 * - unauthorized: refresh the session and resume this item
 * - permanent: 4xx that will not succeed on retry (not 401, 408, or 429)
 * - retry: network, 5xx, 408, 429 — SYNC-03 backoff
 */
export type QueueFailureClass = 'defer' | 'unauthorized' | 'permanent' | 'retry';

export function isPermanentClientStatus(status: number): boolean {
  if (status === 401 || status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}

export function classifyQueueFailure(error: unknown): QueueFailureClass {
  if (isParentNotReadyError(error) || isFrozenQuoteWriteError(error)) {
    return isParentNotReadyError(error) ? 'defer' : 'permanent';
  }
  if (isUnauthorizedError(error)) return 'unauthorized';
  if (isApiError(error) && isPermanentClientStatus(error.status)) return 'permanent';
  return 'retry';
}
