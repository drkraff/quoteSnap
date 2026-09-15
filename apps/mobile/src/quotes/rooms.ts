/**
 * Thin rooms/zones (design §6.1 / §8): named groups on a quote.
 * Lines may belong to a room (nullable = ungrouped / default single-memo).
 * No rooms table — JSON on the quote + roomId on draft lines.
 */

import type { LineItem } from '../utils/line-items';

export const ROOM_NAME_MAX_LENGTH = 80;

export const ADD_ROOM_LABEL = 'Add room';
export const ADD_ROOM_PLACEHOLDER = 'Room or zone name';
export const UNGROUPED_ROOM_LABEL = 'Job';
export const ROOM_MOVE_LABEL = 'Move to';
export const ROOM_UNGROUPED_CHOICE = 'Ungrouped';
export const ROOM_ADD_ITEM_LABEL = 'Add item';
export const ROOM_NOTE_ADD = 'Add room note';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type QuoteRoom = {
  id: string;
  name: string;
  privateNote?: string | null;
};

export type DraftListRow =
  | { kind: 'room'; room: QuoteRoom }
  | { kind: 'ungrouped' }
  | { kind: 'line'; index: number; item: LineItem };

export function parseRoomId(value: unknown): string | undefined {
  return typeof value === 'string' && UUID_RE.test(value) ? value : undefined;
}

export function normalizeRoomName(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.length > ROOM_NAME_MAX_LENGTH
    ? trimmed.slice(0, ROOM_NAME_MAX_LENGTH)
    : trimmed;
}

export function newRoomId(): string {
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

export function parseRoomsJson(json: string | null | undefined): QuoteRoom[] {
  if (json == null || json === '') {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const rooms: QuoteRoom[] = [];
    for (const entry of parsed) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        continue;
      }
      const raw = entry as Record<string, unknown>;
      const id = parseRoomId(raw.id);
      const name = normalizeRoomName(typeof raw.name === 'string' ? raw.name : null);
      if (!id || !name) {
        continue;
      }
      const room: QuoteRoom = { id, name };
      if (typeof raw.privateNote === 'string' && raw.privateNote.trim() !== '') {
        room.privateNote = raw.privateNote.trim();
      }
      rooms.push(room);
    }
    return rooms;
  } catch {
    return [];
  }
}

export function serializeRooms(rooms: QuoteRoom[]): string {
  return JSON.stringify(
    rooms.map((room) => ({
      id: room.id,
      name: room.name,
      privateNote: room.privateNote ?? null,
    })),
  );
}

export function addRoom(
  rooms: QuoteRoom[],
  name: string,
  id: string = newRoomId(),
): QuoteRoom[] {
  const normalized = normalizeRoomName(name);
  if (!normalized) {
    return rooms;
  }
  if (rooms.some((room) => room.id === id)) {
    return rooms;
  }
  return [...rooms, { id, name: normalized }];
}

export function updateRoomPrivateNote(
  rooms: QuoteRoom[],
  roomId: string,
  privateNote: string | null,
): QuoteRoom[] {
  return rooms.map((room) => {
    if (room.id !== roomId) return room;
    const next = { ...room };
    if (privateNote == null || privateNote.trim() === '') {
      delete next.privateNote;
    } else {
      next.privateNote = privateNote.trim();
    }
    return next;
  });
}

export function assignLineRoom(
  items: LineItem[],
  index: number,
  roomId: string | null,
): LineItem[] {
  return items.map((item, i) => {
    if (i !== index) return item;
    const next = { ...item };
    if (roomId == null || roomId === '') {
      delete next.roomId;
    } else {
      next.roomId = roomId;
    }
    return next;
  });
}

export function roomNameForLine(
  rooms: QuoteRoom[],
  roomId: string | null | undefined,
): string | null {
  if (!roomId) return null;
  return rooms.find((room) => room.id === roomId)?.name ?? null;
}

/**
 * Single-memo (no rooms): lines only.
 * With rooms: each room header (including empty), then Job for ungrouped lines.
 */
export function draftListRows(rooms: QuoteRoom[], items: LineItem[]): DraftListRow[] {
  if (rooms.length === 0) {
    return items.map((item, index) => ({ kind: 'line' as const, index, item }));
  }

  const rows: DraftListRow[] = [];
  const claimed = new Set<number>();
  for (const room of rooms) {
    rows.push({ kind: 'room', room });
    items.forEach((item, index) => {
      if (item.roomId === room.id) {
        claimed.add(index);
        rows.push({ kind: 'line', index, item });
      }
    });
  }
  const ungrouped = items
    .map((item, index) => ({ item, index }))
    .filter(({ index, item }) => !claimed.has(index) && !rooms.some((room) => room.id === item.roomId));
  const unknownRoom = items
    .map((item, index) => ({ item, index }))
    .filter(({ index, item }) => !claimed.has(index) && Boolean(item.roomId));
  const leftover = [...ungrouped, ...unknownRoom];
  if (leftover.length > 0) {
    rows.push({ kind: 'ungrouped' });
    for (const row of leftover) {
      rows.push({ kind: 'line', index: row.index, item: row.item });
    }
  }
  return rows;
}

export function rowIndexForLineIndex(rows: DraftListRow[], lineIndex: number): number {
  return rows.findIndex((row) => row.kind === 'line' && row.index === lineIndex);
}
