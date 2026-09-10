/** SYNC-04: contractor-facing copy and retry patch for `dead_letter` queue items. */

export const DEAD_LETTER_EMPTY_HEADING = 'All caught up';

export const DEAD_LETTER_EMPTY_BODY =
  'Nothing is stuck. Your changes sync in the background when you have a signal.';

export const DEAD_LETTER_LIST_INTRO =
  "These changes didn't go through after several tries. Retry when you have a signal.";

export const DEAD_LETTER_RETRY_LABEL = 'Retry';

export const SYNC_ISSUES_TITLE = 'Sync issues';

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

const TITLE_BY_ENTITY_ACTION: Record<string, string> = {
  'quote:create': 'New quote',
  'quote:update': 'Quote update',
  'catalog_item:create': 'New catalog item',
  'catalog_item:update': 'Catalog change',
  'catalog_item:delete': 'Catalog item removal',
  'draft:create': 'Quote draft',
  'draft:update': 'Quote draft',
  'audio:create': 'Voice recording',
  'audio:update': 'Voice recording',
  'onboarding:seed': 'Catalog setup',
};

const SUMMARY_BY_ENTITY_ACTION: Record<string, string> = {
  'quote:create': "Couldn't save a new quote",
  'quote:update': "Couldn't update this quote",
  'catalog_item:create': "Couldn't save a catalog item",
  'catalog_item:update': "Couldn't update this catalog item",
  'catalog_item:delete': "Couldn't remove this catalog item",
  'draft:create': "Couldn't save quote details",
  'draft:update': "Couldn't save quote details",
  'audio:create': "Couldn't upload this recording",
  'audio:update': "Couldn't upload this recording",
  'onboarding:seed': "Couldn't finish catalog setup",
};

export function canRetryDeadLetter(status: string): boolean {
  return status === 'dead_letter';
}

/** Reset so SYNC-03 backoff starts over and `processQueue` will pick the item up. */
export function deadLetterRetryPatch(): DeadLetterRetryPatch {
  return { status: 'pending', retryCount: 0, nextRetryAt: null };
}

export function deadLetterTitle(
  entityType: string,
  action: string,
  payloadJson: string,
): string {
  const base = TITLE_BY_ENTITY_ACTION[`${entityType}:${action}`] ?? 'Saved change';
  const name = payloadDisplayName(entityType, payloadJson);
  return name ? `${base}: ${name}` : base;
}

export function deadLetterSummary(entityType: string, action: string): string {
  return SUMMARY_BY_ENTITY_ACTION[`${entityType}:${action}`] ?? "Couldn't sync this change";
}

/** Map queue `lastError` to plumber-facing language — never dump stack traces. */
export function deadLetterErrorMessage(lastError: string | null): string {
  if (!lastError) {
    return "Couldn't sync this change. Try again.";
  }
  const lower = lastError.toLowerCase();
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
  return "Couldn't sync this change. Try again.";
}

export function toDeadLetterListItem(item: DeadLetterSource): DeadLetterListItem {
  return {
    id: item.id,
    title: deadLetterTitle(item.entityType, item.action, item.payloadJson),
    summary: deadLetterSummary(item.entityType, item.action),
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

function payloadDisplayName(entityType: string, payloadJson: string): string | null {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (entityType === 'catalog_item' && typeof payload.name === 'string') {
    const name = payload.name.trim();
    return name === '' ? null : name;
  }
  if (entityType === 'quote' && typeof payload.customerPhone === 'string') {
    const phone = payload.customerPhone.trim();
    return phone === '' ? null : phone;
  }
  return null;
}
