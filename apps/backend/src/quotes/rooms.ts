/**
 * Thin rooms/zones (design §6.1 / §8): named groups on a quote.
 * Lines may belong to a room (nullable = ungrouped / default single-memo).
 * No rooms table. Never invent a price.
 */

import { parseOptionalPrivateNote } from "./private-note.js";

export const ROOM_NAME_MAX_LENGTH = 80;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROOM_ID_ERROR = "roomId must be a UUID or null";
const ROOMS_ERROR =
  "rooms must be an array of { id (uuid), name } objects (optional privateNote)";
const ROOM_NAME_ERROR = `room name must be a non-empty string (max ${ROOM_NAME_MAX_LENGTH} characters)`;

export type QuoteRoom = {
  id: string;
  name: string;
  privateNote: string | null;
};

export function isRoomId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function normalizeRoomName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.length > ROOM_NAME_MAX_LENGTH
    ? trimmed.slice(0, ROOM_NAME_MAX_LENGTH)
    : trimmed;
}

/**
 * Omitted → preserve (undefined). Explicit null/empty clears.
 * Invalid UUID → 400.
 */
export function parseOptionalRoomId(
  value: unknown,
): { ok: true; roomId: string | null | undefined } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, roomId: undefined };
  }
  if (value === null || value === "") {
    return { ok: true, roomId: null };
  }
  if (!isRoomId(value)) {
    return { ok: false, error: ROOM_ID_ERROR };
  }
  return { ok: true, roomId: value };
}

function parseOneRoom(
  value: unknown,
): { ok: true; room: QuoteRoom } | { ok: false; error: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: ROOMS_ERROR };
  }
  const raw = value as Record<string, unknown>;
  if (!isRoomId(raw.id)) {
    return { ok: false, error: ROOMS_ERROR };
  }
  if (typeof raw.name !== "string") {
    return { ok: false, error: ROOM_NAME_ERROR };
  }
  const name = raw.name.trim();
  if (name.length === 0 || name.length > ROOM_NAME_MAX_LENGTH) {
    return { ok: false, error: ROOM_NAME_ERROR };
  }
  let privateNote: string | null = null;
  if (Object.prototype.hasOwnProperty.call(raw, "privateNote")) {
    const parsed = parseOptionalPrivateNote(raw.privateNote);
    if (!parsed.ok) {
      return parsed;
    }
    privateNote = parsed.note;
  }
  return { ok: true, room: { id: raw.id, name, privateNote } };
}

/**
 * Omitted → preserve (undefined). Null or [] clears.
 * Invalid shape → 400.
 */
export function parseOptionalRooms(
  value: unknown,
): { ok: true; rooms: QuoteRoom[] | undefined } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, rooms: undefined };
  }
  if (value === null) {
    return { ok: true, rooms: [] };
  }
  if (!Array.isArray(value)) {
    return { ok: false, error: ROOMS_ERROR };
  }
  const rooms: QuoteRoom[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const parsed = parseOneRoom(entry);
    if (!parsed.ok) {
      return parsed;
    }
    if (seen.has(parsed.room.id)) {
      return { ok: false, error: ROOMS_ERROR };
    }
    seen.add(parsed.room.id);
    rooms.push(parsed.room);
  }
  return { ok: true, rooms };
}

/** pg jsonb may already be an array; tolerate a JSON string. */
export function roomsFromDb(value: unknown): QuoteRoom[] {
  const parsed = parseOptionalRooms(value);
  if (!parsed.ok || parsed.rooms === undefined) {
    return [];
  }
  return parsed.rooms;
}

export function roomNameForId(
  rooms: QuoteRoom[],
  roomId: string | null | undefined,
): string | null {
  if (!roomId) {
    return null;
  }
  return rooms.find((room) => room.id === roomId)?.name ?? null;
}

/**
 * Build quote rooms + line roomIds from optional spoken room names.
 * Duplicate names (case-insensitive) share one room. Never invents a room
 * or a price when the extract omitted the name.
 */
export function attachVoiceRooms<T extends { roomName?: string | null }>(
  lines: T[],
  newId: () => string,
): { rooms: QuoteRoom[]; lines: Array<T & { roomId: string | null }> } {
  const rooms: QuoteRoom[] = [];
  const byKey = new Map<string, QuoteRoom>();
  const next = lines.map((line) => {
    const name = normalizeRoomName(line.roomName);
    if (!name) {
      return { ...line, roomId: null };
    }
    const key = name.toLowerCase();
    let room = byKey.get(key);
    if (!room) {
      room = { id: newId(), name, privateNote: null };
      byKey.set(key, room);
      rooms.push(room);
    }
    return { ...line, roomId: room.id };
  });
  return { rooms, lines: next };
}
