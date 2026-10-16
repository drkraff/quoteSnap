import { FEEDBACK_QUEUE_LIMIT } from './copy';
import { buildFeedbackRequest, type FeedbackDraft, type FeedbackRequestBody } from './payload';

export type FeedbackQueueItem = FeedbackDraft & {
  id: string;
  createdAt: string;
};

export function createFeedbackId(): string {
  const bytes = new Uint8Array(16);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isQueueItem(value: unknown): value is FeedbackQueueItem {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (typeof row['id'] !== 'string' || row['id'].length === 0) return false;
  if (typeof row['message'] !== 'string' || row['message'].trim().length === 0) return false;
  if (
    row['rating'] !== null &&
    (typeof row['rating'] !== 'number' || !Number.isInteger(row['rating']) || row['rating'] < 1 || row['rating'] > 5)
  ) {
    return false;
  }
  if (row['screen'] !== null && typeof row['screen'] !== 'string') return false;
  if (row['quoteId'] !== null && typeof row['quoteId'] !== 'string') return false;
  if (typeof row['appVersion'] !== 'string') return false;
  if (typeof row['platform'] !== 'string') return false;
  if (row['screenshotBase64'] !== null && typeof row['screenshotBase64'] !== 'string') return false;
  if (typeof row['createdAt'] !== 'string') return false;
  return true;
}

export function parseFeedbackQueue(raw: string | null): FeedbackQueueItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueueItem);
  } catch {
    return [];
  }
}

/** Keeps the newest notes when the phone has been offline for a while. */
export function enqueueFeedbackItem(queue: FeedbackQueueItem[], item: FeedbackQueueItem): FeedbackQueueItem[] {
  const next = [...queue, item];
  if (next.length <= FEEDBACK_QUEUE_LIMIT) return next;
  return next.slice(next.length - FEEDBACK_QUEUE_LIMIT);
}

export function feedbackBodyForItem(item: FeedbackQueueItem): FeedbackRequestBody | null {
  return buildFeedbackRequest(item);
}
