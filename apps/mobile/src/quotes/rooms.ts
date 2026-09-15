/**
 * Thin rooms/zones (design §6.1 / §8): named groups on a quote.
 * Lines may belong to a room (nullable = ungrouped / default single-memo).
 * No rooms table — JSON on the quote + roomId on draft lines.
 */

import type { LineItem } from '../utils/line-items';
import { normalizePrivateNote } from './private-notes';

export const ROOM_NAME_MAX_LENGTH = 80;

export const ADD_ROOM_LABEL = 'Add room';
export const ADD_ROOM_PLACEHOLDER = 'Room or zone name';
export const UNGROUPED_ROOM_LABEL = 'Job';
export const ROOM_MOVE_LABEL = 'Move to';
export const ROOM_UNGROUPED_CHOICE = 'Ungrouped';
export const ROOM_ADD_ITEM_LABEL = 'Add item';
export const ROOM_NOTE_ADD = 'Add room note';
export const ROOM_RENAME_LABEL = 'Rename';
export const ROOM_DELETE_LABEL = 'Remove';
export const ROOM_DELETE_CONFIRM_TITLE = 'Remove this room?';
export const ROOM_DELETE_CONFIRM_MESSAGE =
  'Items stay on the quote as ungrouped. Totals do not change.';
export const ROOM_DELETE_CONFIRM_ACTION = 'Remove';

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
      if (typeof raw.privateNote === 'string' || raw.privateNote === null) {
        const note = normalizePrivateNote(raw.privateNote);
        if (note) room.privateNote = note;
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
  const note = normalizePrivateNote(privateNote);
  const current = rooms.find((room) => room.id === roomId);
  if (!current) return rooms;
  if (normalizePrivateNote(current.privateNote) === note) {
    if (note !== null || current.privateNote == null) return rooms;
  }
  return rooms.map((room) => {
    if (room.id !== roomId) return room;
    return { ...room, privateNote: note };
  });
}

export function assignLineRoom(
  items: LineItem[],
  index: number,
  roomId: string | null,
): LineItem[] {
  if (!Array.isArray(items) || index < 0 || index >= items.length) {
    return items;
  }
  const current = items[index];
  if (!current) {
    return items;
  }
  const nextId = roomId == null || roomId === '' ? undefined : roomId;
  if (current.roomId === nextId) {
    return items;
  }
  return items.map((item, i) => {
    if (i !== index) return item;
    const next = { ...item };
    if (nextId == null) {
      delete next.roomId;
    } else {
      next.roomId = nextId;
    }
    return next;
  });
}

/**
 * Drop roomIds that no longer match a room. Empty rooms → every line
 * ungrouped (single-memo). Does not rewrite prices.
 */
export function sanitizeLineRooms<T extends { roomId?: string | null }>(
  rooms: QuoteRoom[],
  items: readonly T[] | null | undefined,
): T[] {
  if (!Array.isArray(items)) {
    return [];
  }
  if (items.length === 0) {
    return items as T[];
  }
  const known = new Set(rooms.map((room) => room.id));
  let changed = false;
  const next = items.map((item) => {
    if (!item.roomId || known.has(item.roomId)) {
      return item;
    }
    changed = true;
    const copy = { ...item };
    delete copy.roomId;
    return copy;
  });
  return changed ? next : (items as T[]);
}

/**
 * Change a room's display name. Keeps the id so lines stay grouped.
 * Does not stamp a spoken room name onto lines — voice extract only
 * groups names the contractor actually said.
 */
export function renameRoom(
  rooms: QuoteRoom[],
  roomId: string,
  name: string,
): QuoteRoom[] {
  const normalized = normalizeRoomName(name);
  if (!normalized || rooms.length === 0) {
    return rooms;
  }
  let changed = false;
  const next = rooms.map((room) => {
    if (room.id !== roomId || room.name === normalized) {
      return room;
    }
    changed = true;
    return { ...room, name: normalized };
  });
  return changed ? next : rooms;
}

/**
 * Remove a room and ungroup its lines (null roomId). Missing room / empty
 * list is a no-op. Totals are unchanged because prices are not rewritten.
 */
export function removeRoom(
  rooms: QuoteRoom[],
  items: LineItem[],
  roomId: string,
): { rooms: QuoteRoom[]; items: LineItem[] } {
  if (!Array.isArray(rooms) || rooms.length === 0) {
    return { rooms, items: sanitizeLineRooms([], items) };
  }
  const nextRooms = rooms.filter((room) => room.id !== roomId);
  if (nextRooms.length === rooms.length) {
    return { rooms, items };
  }
  return { rooms: nextRooms, items: sanitizeLineRooms(nextRooms, items) };
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
