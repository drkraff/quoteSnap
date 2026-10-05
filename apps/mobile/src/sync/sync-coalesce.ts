/**
 * Last queued snapshot wins. Partial quote field patches merge; archive,
 * mark-sent, and deletes stay their own rows so one edit cannot erase the other.
 */

export type CoalesceItem = {
  entityType: string;
  entityId: string;
  action: string;
  payloadJson: string;
  status: string;
  createdAt: Date;
};

const OPEN_STATUSES = new Set(['pending', 'failed', 'dead_letter', 'in_progress']);

export function coalesceKind(item: {
  entityType: string;
  action: string;
  payloadJson: string;
}): string | null {
  let payload: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(item.payloadJson);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  if (item.entityType === 'draft' && item.action === 'update') {
    return 'draft-snapshot';
  }
  if (item.entityType === 'rate_card' && item.action === 'update') {
    return 'rate-card-upsert';
  }
  if (item.entityType === 'rate_card' && item.action === 'delete') {
    return 'rate-card-delete';
  }
  if (item.entityType === 'catalog_item' && item.action === 'update') {
    if (payload.isArchived === true) return 'catalog-archive';
    if (payload.isArchived === false) return 'catalog-unarchive';
    return 'catalog-fields';
  }
  if (item.entityType === 'quote' && item.action === 'update') {
    if (payload.isArchived === true) return 'quote-archive';
    if (payload.isArchived === false) return 'quote-unarchive';
    if (payload.status === 'sent') return 'quote-mark-sent';
    return 'quote-fields';
  }
  if (item.entityType === 'photo' && item.action === 'create') {
    const photoId = typeof payload.photoId === 'string' ? payload.photoId : '';
    if (photoId === '') return null;
    return `photo:${photoId}`;
  }
  return null;
}

function ownerId(payloadJson: string): string | null {
  try {
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    const owner = payload._syncOwnerId;
    return typeof owner === 'string' && owner.trim() !== '' ? owner : null;
  } catch {
    return null;
  }
}

export function canCoalesce(a: CoalesceItem, b: CoalesceItem): boolean {
  const kind = coalesceKind(a);
  if (!kind || kind !== coalesceKind(b)) return false;
  if (a.entityType !== b.entityType || a.entityId !== b.entityId) return false;
  if (a.action !== b.action) return false;
  const ownerA = ownerId(a.payloadJson);
  const ownerB = ownerId(b.payloadJson);
  if (ownerA && ownerB && ownerA !== ownerB) return false;
  return true;
}

export function isCoalesceOpenStatus(status: string): boolean {
  return OPEN_STATUSES.has(status);
}

/** Newest keys win. Snapshot kinds replace. Quote field patches merge. */
export function mergedPayloadJson(existingJson: string, incomingJson: string, kind: string): string {
  if (kind !== 'quote-fields') return incomingJson;
  let existing: Record<string, unknown> = {};
  let incoming: Record<string, unknown> = {};
  try {
    existing = JSON.parse(existingJson) as Record<string, unknown>;
  } catch {
    existing = {};
  }
  try {
    incoming = JSON.parse(incomingJson) as Record<string, unknown>;
  } catch {
    return incomingJson;
  }
  return JSON.stringify({ ...existing, ...incoming });
}

export function isSupersededByLaterItem(item: CoalesceItem, others: CoalesceItem[]): boolean {
  if (!coalesceKind(item) || !isCoalesceOpenStatus(item.status)) return false;
  const itemMs = item.createdAt.getTime();
  return others.some((other) => {
    if (other === item) return false;
    if (!isCoalesceOpenStatus(other.status)) return false;
    if (!canCoalesce(item, other)) return false;
    return other.createdAt.getTime() > itemMs;
  });
}
