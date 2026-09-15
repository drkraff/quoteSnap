/**
 * Copy a picked still into documentDirectory (same reason as VOICE-02:
 * Android cache eviction). No binary fixtures — tests pass file:// URIs.
 */

import { extensionForPhotoMime, localPhotoPath, normalizePhotoMime, newPhotoId } from './photos';

export type PickedStill = {
  uri: string;
  mimeType?: string | null;
};

export type PersistedStill = {
  photoId: string;
  sourceUri: string;
  destUri: string;
  mime: string;
  destDir: string;
};

export function persistStillPlan(
  asset: PickedStill,
  quoteId: string,
  documentDirectory: string | null | undefined,
  photoId: string = newPhotoId(),
): PersistedStill {
  const mime = normalizePhotoMime(asset.mimeType);
  const destUri = localPhotoPath(quoteId, photoId, mime, documentDirectory);
  const destDir = destUri.slice(0, destUri.length - localPhotoFileNameLength(photoId, mime));
  return {
    photoId,
    sourceUri: asset.uri,
    destUri,
    mime,
    destDir,
  };
}

function localPhotoFileNameLength(photoId: string, mime: string): number {
  return `${photoId}.${extensionForPhotoMime(mime)}`.length;
}

export function photoQueuePayload(input: {
  quoteLocalId: string;
  photoId: string;
  filePath: string;
  mime: string;
}): {
  entityType: 'photo';
  entityId: string;
  action: 'create';
  payload: {
    quoteLocalId: string;
    photoId: string;
    filePath: string;
    mime: string;
  };
} {
  return {
    entityType: 'photo',
    entityId: input.quoteLocalId,
    action: 'create',
    payload: {
      quoteLocalId: input.quoteLocalId,
      photoId: input.photoId,
      filePath: input.filePath,
      mime: input.mime,
    },
  };
}

/**
 * Drop a pending photo upload after the still was removed from the strip.
 * Leave in-progress items; processQueue already skips if photos_json is empty.
 */
export function shouldDropPhotoQueueItem(
  item: {
    entityType: string;
    status?: string | null;
    payloadJson?: string | null;
    payload?: { photoId?: unknown };
  },
  photoId: string,
): boolean {
  if (item.entityType !== 'photo') return false;
  if (item.status === 'in_progress') return false;
  if (typeof item.payload?.photoId === 'string') {
    return item.payload.photoId === photoId;
  }
  if (typeof item.payloadJson !== 'string' || item.payloadJson === '') {
    return false;
  }
  try {
    const parsed: unknown = JSON.parse(item.payloadJson);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return false;
    }
    return (parsed as { photoId?: unknown }).photoId === photoId;
  } catch {
    return false;
  }
}
