/** SYNC-04: contractor-facing copy and retry patch for `dead_letter` queue items. */

import { isApiError } from '../api/client';
import {
  FROZEN_QUOTE_WRITE_MESSAGE,
  isFrozenQuoteWriteMessage,
  payloadMutatesQuoteMoney,
} from './frozen-quote';

export const DEAD_LETTER_EMPTY_HEADING = 'All caught up';

export const DEAD_LETTER_EMPTY_BODY =
  'Nothing is stuck. Your changes sync in the background when you have a signal.';

export const DEAD_LETTER_LIST_INTRO =
  "These changes didn't go through after several tries. Retry when you have a signal.";

export const DEAD_LETTER_RETRY_LABEL = 'Retry';

export const SYNC_ISSUES_TITLE = 'Sync issues';

export const DEAD_LETTER_GENERIC_REASON = "Couldn't sync this change. Try again.";

export const QUOTE_STATUS_LOCK_REASON = "This quote can't be changed in its current status.";

export type DeadLetterRetryPatch = {
  status: 'pending';
  retryCount: 0;
  nextRetryAt: null;
};

export type DeadLetterListItem = {
  id: string;
  title: string;
  summary: string;
  error: string;
};

export type DeadLetterSource = {
  id: string;
  entityType: string;
  action: string;
  payloadJson: string;
  lastError: string | null;
};

const TITLE_BY_KIND: Record<string, string> = {
  'quote:create': 'New quote',
  'quote:update': 'Quote update',
  'quote:archive': 'Quote archive',
  'quote:unarchive': 'Quote restore',
  'quote:mark_sent': 'Mark quote sent',
  'quote:money': 'Quote prices',
  'catalog_item:create': 'New catalog item',
  'catalog_item:update': 'Catalog change',
  'catalog_item:archive': 'Catalog item archive',
  'catalog_item:unarchive': 'Catalog item restore',
  'catalog_item:delete': 'Catalog item removal',
  'draft:create': 'Quote draft',
  'draft:update': 'Quote draft',
  'draft:money': 'Quote draft',
  'audio:create': 'Voice recording',
  'audio:update': 'Voice recording',
  'photo:create': 'Job photo',
  'photo:update': 'Job photo',
  'onboarding:seed': 'Catalog setup',
  'onboarding:profile': 'Hourly rate',
  'rate_card:update': 'Saved price',
  'rate_card:create': 'Saved price',
  'rate_card:delete': 'Removed rate',
};

const SUMMARY_BY_KIND: Record<string, string> = {
  'quote:create': "Couldn't save a new quote",
  'quote:update': "Couldn't update this quote",
  'quote:archive': "Couldn't archive this quote",
  'quote:unarchive': "Couldn't restore this quote",
  'quote:mark_sent': "Couldn't mark this quote as sent",
  'quote:money': "Couldn't update line items or prices",
  'catalog_item:create': "Couldn't save a catalog item",
  'catalog_item:update': "Couldn't update this catalog item",
  'catalog_item:archive': "Couldn't archive this catalog item",
  'catalog_item:unarchive': "Couldn't restore this catalog item",
  'catalog_item:delete': "Couldn't remove this catalog item",
  'draft:create': "Couldn't save quote details",
  'draft:update': "Couldn't save quote details",
  'draft:money': "Couldn't save quote details",
  'audio:create': "Couldn't upload this recording",
  'audio:update': "Couldn't upload this recording",
  'photo:create': "Couldn't upload this photo",
  'photo:update': "Couldn't upload this photo",
  'onboarding:seed': "Couldn't finish catalog setup",
  'onboarding:profile': "Couldn't save your hourly rate",
  'rate_card:update': "Couldn't save this learned price",
  'rate_card:create': "Couldn't save this learned price",
  'rate_card:delete': "Couldn't remove this learned price",
};

export function canRetryDeadLetter(status: string): boolean {
  return status === 'dead_letter';
}

/**
 * Reset so SYNC-03 backoff starts over and `processQueue` will pick the item up.
 * Payload (line items / totals) is intentionally omitted — retry must not invent money.
 */
export function deadLetterRetryPatch(): DeadLetterRetryPatch {
  return { status: 'pending', retryCount: 0, nextRetryAt: null };
}

export function deadLetterTitle(
  entityType: string,
  action: string,
  payloadJson: string,
): string {
  const base = TITLE_BY_KIND[queueItemKind(entityType, action, payloadJson)] ?? 'Saved change';
  const name = payloadDisplayName(entityType, payloadJson);
  return name ? `${base}: ${name}` : base;
}

export function deadLetterSummary(
  entityType: string,
  action: string,
  payloadJson = '{}',
): string {
  return SUMMARY_BY_KIND[queueItemKind(entityType, action, payloadJson)] ?? "Couldn't sync this change";
}

/**
 * Map stored `lastError` to plumber-facing language — never dump stack traces
 * or invent a reason. Known freeze / status-lock copy is preferred when present.
 */
export function deadLetterErrorMessage(lastError: string | null): string {
  if (!lastError) {
    return DEAD_LETTER_GENERIC_REASON;
  }
  const trimmed = lastError.trim();
  if (trimmed === '') {
    return DEAD_LETTER_GENERIC_REASON;
  }
  if (isFrozenQuoteWriteMessage(trimmed)) {
    return FROZEN_QUOTE_WRITE_MESSAGE;
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes('cannot be updated in its current status')) {
    return QUOTE_STATUS_LOCK_REASON;
  }
  if (
    lower.includes('network') ||
    lower.includes('timeout') ||
    lower.includes('failed to fetch') ||
    lower.includes('econnrefused') ||
    lower.includes('still down')
  ) {
    return "Couldn't reach the server. Check your signal and try again.";
  }
  if (lower.includes('no server id')) {
    return "This isn't on the server yet. Try again in a moment.";
  }
  if (lower.includes('quote not found')) {
    return 'The quote for this recording is missing on this device.';
  }
  if (
    lower.includes('session expired') ||
    lower.includes('unauthorized') ||
    lower.includes(' 401') ||
    lower.includes('status":401')
  ) {
    return "You're signed out. Log in and try again.";
  }
  if (lower.includes('409') || lower.includes('already seeded') || lower.includes('already exists')) {
    return 'This change may already be on the server. Retry to confirm.';
  }
  if (lower === 'unknown error') {
    return DEAD_LETTER_GENERIC_REASON;
  }
  if (isPlainEnglishReason(trimmed)) {
    return trimmed;
  }
  return DEAD_LETTER_GENERIC_REASON;
}

/** Persist the real failure string when the queue catch only has an `ApiError` object. */
export function queueFailureMessage(error: unknown): string {
  if (isApiError(error)) {
    const message = error.error.trim();
    if (message !== '') return message;
  }
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message !== '') return message;
  }
  return 'Unknown error';
}

export function toDeadLetterListItem(item: DeadLetterSource): DeadLetterListItem {
  return {
    id: item.id,
    title: deadLetterTitle(item.entityType, item.action, item.payloadJson),
    summary: deadLetterSummary(item.entityType, item.action, item.payloadJson),
    error: deadLetterErrorMessage(item.lastError),
  };
}

export function listDeadLetterViews(items: DeadLetterSource[]): DeadLetterListItem[] {
  return items.map(toDeadLetterListItem);
}

export function deadLetterBannerMessage(count: number): string | null {
  if (count <= 0) return null;
  if (count === 1) return "1 change didn't sync. Tap to review.";
  return `${count} changes didn't sync. Tap to review.`;
}

export function syncIssuesHeaderLabel(count: number): string {
  if (count === 1) return 'Sync issues, 1 change could not sync';
  return `Sync issues, ${count} changes could not sync`;
}

function queueItemKind(entityType: string, action: string, payloadJson: string): string {
  const payload = parsePayload(payloadJson);
  if (action === 'update' && payload) {
    if (payload.isArchived === true) return `${entityType}:archive`;
    if (payload.isArchived === false) return `${entityType}:unarchive`;
    if (
      entityType === 'quote' &&
      payload.status === 'sent' &&
      !payloadMutatesQuoteMoney(payload)
    ) {
      return 'quote:mark_sent';
    }
    if (entityType === 'quote' && payloadMutatesQuoteMoney(payload)) {
      return 'quote:money';
    }
    if (entityType === 'draft' && payloadMutatesQuoteMoney(payload)) {
      return 'draft:money';
    }
  }
  return `${entityType}:${action}`;
}

function parsePayload(payloadJson: string): Record<string, unknown> | null {
  try {
    return JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function payloadDisplayName(entityType: string, payloadJson: string): string | null {
  const payload = parsePayload(payloadJson);
  if (!payload) return null;
  if (
    (entityType === 'catalog_item' || entityType === 'rate_card') &&
    typeof payload.name === 'string'
  ) {
    const name = payload.name.trim();
    return name === '' ? null : name;
  }
  if (entityType === 'quote' && typeof payload.customerPhone === 'string') {
    const phone = payload.customerPhone.trim();
    return phone === '' ? null : phone;
  }
  return null;
}

/** Short contractor-facing sentences only — never stack traces, paths, or JSON blobs. */
function isPlainEnglishReason(message: string): boolean {
  if (message.length > 160) return false;
  if (/[\n\r]/.test(message)) return false;
  if (/[{}[\]\\]/.test(message)) return false;
  if (/[/\\][\w.-]+[/\\]/.test(message)) return false;
  if (/\b(enoent|eacces|errno|at \w+\s*\()/i.test(message)) return false;
  return /[a-z]/i.test(message);
}
