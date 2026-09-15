/**
 * Thin photo-on-line (design §6.1 / §8): stills as job evidence.
 * Photos attach to the quote, a room, and/or a line. Local URI first;
 * server id stamps after private upload. Never invent a price.
 * Not public — omit from customer PDF/SMS.
 */

import type { LineItem } from '../utils/line-items';

export const ADD_PHOTO_LABEL = 'Add photo';
export const PHOTO_PRIVATE_HINT = 'Job evidence — not on the customer PDF';
export const PHOTO_PENDING_LABEL = 'Waiting to upload';
export const PHOTO_UPLOADED_LABEL = 'Saved';
export const PHOTO_MISSING_LOCAL_LABEL = 'On server';
export const PHOTO_CAMERA_LABEL = 'Camera';
export const PHOTO_LIBRARY_LABEL = 'Photo library';

export const PHOTO_MIME_JPEG = 'image/jpeg';
export const PHOTO_MIME_PNG = 'image/png';
export const PHOTO_MIME_WEBP = 'image/webp';

const ALLOWED_MIMES = new Set([PHOTO_MIME_JPEG, PHOTO_MIME_PNG, PHOTO_MIME_WEBP]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PhotoStatus = 'pending' | 'uploaded' | 'failed';

export type QuotePhoto = {
  id: string;
  localUri: string;
  mime: string;
  status: PhotoStatus;
  serverId?: string | null;
  roomId?: string | null;
  lineClientId?: string | null;
};

export type ServerQuotePhoto = {
  id: string;
  clientId: string;
  mime: string;
  roomId?: string | null;
  lineClientId?: string | null;
  uploaded?: boolean;
};

export function parsePhotoId(value: unknown): string | undefined {
  return typeof value === 'string' && UUID_RE.test(value) ? value : undefined;
}

export function newPhotoId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function normalizePhotoMime(value: unknown): string {
  if (typeof value === 'string' && ALLOWED_MIMES.has(value)) {
    return value;
  }
  return PHOTO_MIME_JPEG;
}

export function extensionForPhotoMime(mime: string): 'jpg' | 'png' | 'webp' {
  if (mime === PHOTO_MIME_PNG) return 'png';
  if (mime === PHOTO_MIME_WEBP) return 'webp';
  return 'jpg';
}

export function localPhotoFileName(photoId: string, mime: string): string {
  return `${photoId}.${extensionForPhotoMime(mime)}`;
}

export function localPhotoPath(
  quoteId: string,
  photoId: string,
  mime: string,
  documentDirectory: string | null | undefined,
): string {
  const root = documentDirectory ?? '';
  return `${root}photos/${quoteId}/${localPhotoFileName(photoId, mime)}`;
}

function coercePhoto(value: unknown): QuotePhoto | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = parsePhotoId(raw.id);
  if (!id) return null;
  const mime = normalizePhotoMime(raw.mime);
  const localUri = typeof raw.localUri === 'string' ? raw.localUri : '';
  const statusRaw = raw.status;
  const status: PhotoStatus =
    statusRaw === 'uploaded' || statusRaw === 'failed' || statusRaw === 'pending'
      ? statusRaw
      : 'pending';
  const photo: QuotePhoto = { id, localUri, mime, status };
  const serverId = parsePhotoId(raw.serverId);
  if (serverId) {
    photo.serverId = serverId;
  }
  const roomId = parsePhotoId(raw.roomId);
  if (roomId) {
    photo.roomId = roomId;
  }
  const lineClientId = parsePhotoId(raw.lineClientId);
  if (lineClientId) {
    photo.lineClientId = lineClientId;
  }
  return photo;
}

export function parsePhotosJson(json: string | null | undefined): QuotePhoto[] {
  if (json == null || json === '') {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const photos: QuotePhoto[] = [];
    const seen = new Set<string>();
    for (const entry of parsed) {
      const photo = coercePhoto(entry);
      if (!photo || seen.has(photo.id)) continue;
      seen.add(photo.id);
      photos.push(photo);
    }
    return photos;
  } catch {
    return [];
  }
}

export function serializePhotos(photos: QuotePhoto[]): string {
  return JSON.stringify(
    photos.map((photo) => ({
      id: photo.id,
      localUri: photo.localUri,
      mime: photo.mime,
      status: photo.status,
      serverId: photo.serverId ?? null,
      roomId: photo.roomId ?? null,
      lineClientId: photo.lineClientId ?? null,
    })),
  );
}

export function addPhoto(
  photos: QuotePhoto[],
  input: {
    id?: string;
    localUri: string;
    mime?: string;
    roomId?: string | null;
    lineClientId?: string | null;
  },
): QuotePhoto[] {
  const id = input.id && UUID_RE.test(input.id) ? input.id : newPhotoId();
  if (photos.some((photo) => photo.id === id)) {
    return photos;
  }
  const photo: QuotePhoto = {
    id,
    localUri: input.localUri,
    mime: normalizePhotoMime(input.mime),
    status: 'pending',
  };
  const roomId = parsePhotoId(input.roomId);
  if (roomId) {
    photo.roomId = roomId;
  }
  const lineClientId = parsePhotoId(input.lineClientId);
  if (lineClientId) {
    photo.lineClientId = lineClientId;
  }
  return [...photos, photo];
}

export function stampPhotoUploaded(
  photos: QuotePhoto[],
  photoId: string,
  serverId: string,
): QuotePhoto[] {
  return photos.map((photo) => {
    if (photo.id !== photoId) return photo;
    return { ...photo, serverId, status: 'uploaded' as const };
  });
}

export function stampPhotoFailed(photos: QuotePhoto[], photoId: string): QuotePhoto[] {
  return photos.map((photo) => {
    if (photo.id !== photoId) return photo;
    return { ...photo, status: 'failed' as const };
  });
}

export function photosForQuote(photos: QuotePhoto[]): QuotePhoto[] {
  return photos.filter((photo) => !photo.roomId && !photo.lineClientId);
}

export function photosForRoom(photos: QuotePhoto[], roomId: string): QuotePhoto[] {
  return photos.filter((photo) => photo.roomId === roomId && !photo.lineClientId);
}

export function photosForLine(photos: QuotePhoto[], lineClientId: string): QuotePhoto[] {
  return photos.filter((photo) => photo.lineClientId === lineClientId);
}

export function photoDisplayUri(photo: QuotePhoto): string | null {
  const uri = photo.localUri?.trim() ?? '';
  return uri === '' ? null : uri;
}

export function photoStatusLabel(photo: QuotePhoto): string {
  if (photoDisplayUri(photo) == null && photo.serverId) {
    return PHOTO_MISSING_LOCAL_LABEL;
  }
  if (photo.status === 'uploaded') {
    return PHOTO_UPLOADED_LABEL;
  }
  if (photo.status === 'failed') {
    return PHOTO_PENDING_LABEL;
  }
  return PHOTO_PENDING_LABEL;
}

export function ensureLineClientId(
  items: LineItem[],
  index: number,
  id: string = newPhotoId(),
): LineItem[] {
  const item = items[index];
  if (!item) return items;
  if (item.clientId) return items;
  return items.map((entry, i) => (i === index ? { ...entry, clientId: id } : entry));
}

/**
 * After extract: room stills attach to the first line in that room.
 * Does not invent prices or rooms.
 */
export function assignRoomPhotosToNearestLine(
  photos: QuotePhoto[],
  items: LineItem[],
): { photos: QuotePhoto[]; items: LineItem[] } {
  let nextItems = items;
  const nextPhotos = photos.map((photo) => {
    if (!photo.roomId || photo.lineClientId) {
      return photo;
    }
    const index = nextItems.findIndex((item) => item.roomId === photo.roomId);
    if (index < 0) {
      return photo;
    }
    nextItems = ensureLineClientId(nextItems, index);
    const lineClientId = nextItems[index]?.clientId;
    if (!lineClientId) {
      return photo;
    }
    return { ...photo, lineClientId };
  });
  return { photos: nextPhotos, items: nextItems };
}

export function photosFromServer(server: ServerQuotePhoto[]): QuotePhoto[] {
  const photos: QuotePhoto[] = [];
  const seen = new Set<string>();
  for (const entry of server) {
    const clientId = parsePhotoId(entry.clientId);
    const serverId = parsePhotoId(entry.id);
    if (!clientId || !serverId || seen.has(clientId)) continue;
    seen.add(clientId);
    const photo: QuotePhoto = {
      id: clientId,
      localUri: '',
      mime: normalizePhotoMime(entry.mime),
      status: 'uploaded',
      serverId,
    };
    const roomId = parsePhotoId(entry.roomId);
    if (roomId) photo.roomId = roomId;
    const lineClientId = parsePhotoId(entry.lineClientId);
    if (lineClientId) photo.lineClientId = lineClientId;
    photos.push(photo);
  }
  return photos;
}

/**
 * Keep local pending stills (not on the server yet) and local URIs.
 * Stamp uploaded when the server knows the client id.
 */
export function mergePhotosOnHydrate(
  local: QuotePhoto[],
  server: ServerQuotePhoto[],
): QuotePhoto[] {
  const serverByClient = new Map<string, ServerQuotePhoto>();
  for (const entry of server) {
    const clientId = parsePhotoId(entry.clientId);
    if (clientId) {
      serverByClient.set(clientId, entry);
    }
  }
  const merged: QuotePhoto[] = [];
  const seen = new Set<string>();
  for (const photo of local) {
    seen.add(photo.id);
    const remote = serverByClient.get(photo.id);
    if (!remote) {
      merged.push(photo);
      continue;
    }
    const serverId = parsePhotoId(remote.id);
    const next: QuotePhoto = {
      ...photo,
      mime: normalizePhotoMime(remote.mime || photo.mime),
      status: 'uploaded',
    };
    if (serverId) next.serverId = serverId;
    const roomId = parsePhotoId(remote.roomId) ?? parsePhotoId(photo.roomId);
    if (roomId) next.roomId = roomId;
    else delete next.roomId;
    const lineClientId =
      parsePhotoId(remote.lineClientId) ?? parsePhotoId(photo.lineClientId);
    if (lineClientId) next.lineClientId = lineClientId;
    else delete next.lineClientId;
    merged.push(next);
  }
  for (const remote of photosFromServer(server)) {
    if (seen.has(remote.id)) continue;
    merged.push(remote);
  }
  return merged;
}
