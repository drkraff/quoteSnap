import { normalizeClientSentence } from '../quotes/client-sentence';
import { normalizePrivateNote } from '../quotes/private-notes';
import { serializeRooms, type QuoteRoom } from '../quotes/rooms';

/**
 * Fields written locally before the sync queue has them.
 * Memory covers the same process (including the gap before SQLite commits).
 * `quotes.local_dirty` is the token map that survives a kill until enqueue
 * or discard clears that token.
 */

export const DIRTY_FIELDS = ['lines', 'phone', 'privateNote', 'clientSentence', 'rooms'] as const;

export type DirtyField = (typeof DIRTY_FIELDS)[number];

const memory = new Map<string, Map<DirtyField, number>>();
let nextToken = 1;

export function resetLocalDirtyForTests(): void {
  memory.clear();
  nextToken = 1;
}

export function markDirtyField(quoteId: string, field: DirtyField): number {
  const id = quoteId.trim();
  if (id === '') return 0;
  const token = nextToken;
  nextToken += 1;
  let fields = memory.get(id);
  if (!fields) {
    fields = new Map();
    memory.set(id, fields);
  }
  fields.set(field, token);
  return token;
}

/** Drop this token only. A newer local write keeps its own token. */
export function clearDirtyField(quoteId: string, field: DirtyField, token: number): boolean {
  const fields = memory.get(quoteId.trim());
  if (!fields) return false;
  if (fields.get(field) !== token) return false;
  fields.delete(field);
  if (fields.size === 0) memory.delete(quoteId.trim());
  return true;
}

export function discardDirtyField(quoteId: string, field: DirtyField): void {
  const fields = memory.get(quoteId.trim());
  if (!fields) return;
  fields.delete(field);
  if (fields.size === 0) memory.delete(quoteId.trim());
}

export function isDirtyField(quoteId: string, field: DirtyField): boolean {
  const fields = memory.get(quoteId);
  return fields?.has(field) === true;
}

export function markPendingLineEdit(quoteId: string): void {
  markDirtyField(quoteId, 'lines');
}

export function clearPendingLineEdit(quoteId: string): void {
  discardDirtyField(quoteId, 'lines');
}

export function hasPendingLineEdit(quoteId: string): boolean {
  return isDirtyField(quoteId, 'lines');
}

export function resetPendingLineEditsForTests(): void {
  resetLocalDirtyForTests();
}

export function parseLocalDirty(
  raw: string | null | undefined,
): Partial<Record<DirtyField, number>> {
  if (raw == null || raw.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Partial<Record<DirtyField, number>> = {};
    for (const field of DIRTY_FIELDS) {
      const value = (parsed as Record<string, unknown>)[field];
      if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        out[field] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeLocalDirty(
  fields: Partial<Record<DirtyField, number>>,
): string | null {
  const out: Partial<Record<DirtyField, number>> = {};
  for (const field of DIRTY_FIELDS) {
    const value = fields[field];
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      out[field] = value;
    }
  }
  return Object.keys(out).length === 0 ? null : JSON.stringify(out);
}

export function localDirtyWith(
  raw: string | null | undefined,
  field: DirtyField,
  token: number,
): string | null {
  if (!Number.isInteger(token) || token <= 0) return serializeLocalDirty(parseLocalDirty(raw));
  return serializeLocalDirty({ ...parseLocalDirty(raw), [field]: token });
}

export function localDirtyWithout(
  raw: string | null | undefined,
  field: DirtyField,
  token: number,
): string | null {
  const fields = parseLocalDirty(raw);
  if (fields[field] !== token) return serializeLocalDirty(fields);
  delete fields[field];
  return serializeLocalDirty(fields);
}

export function localDirtyHas(raw: string | null | undefined, field: DirtyField): boolean {
  return parseLocalDirty(raw)[field] != null;
}

/** In-memory flag or the durable column. Either one is enough to hold the field. */
export function fieldHeld(
  quoteId: string,
  localDirty: string | null | undefined,
  field: DirtyField,
): boolean {
  return isDirtyField(quoteId, field) || localDirtyHas(localDirty, field);
}

export type QueueHoldItem = {
  entityType: string;
  entityId: string;
  status: string;
};

const LINE_HOLD_QUEUE_STATUSES = new Set([
  'pending',
  'failed',
  'in_progress',
  'dead_letter',
]);

/**
 * Unsynced lines/total: a not-yet-enqueued edit, or a draft update still
 * in the queue. A dead-letter draft update counts — discard or a successful
 * retry is what releases the lines. Other dead-letter rows do not.
 */
export function unsyncedLinesProtected(input: {
  quoteId: string;
  localDirty?: string | null;
  draftIds?: string[];
  queue?: QueueHoldItem[];
}): boolean {
  if (fieldHeld(input.quoteId, input.localDirty, 'lines')) return true;
  const draftIds = new Set(input.draftIds ?? []);
  return (input.queue ?? []).some(
    (item) =>
      LINE_HOLD_QUEUE_STATUSES.has(item.status)
      && item.entityType === 'draft'
      && draftIds.has(item.entityId),
  );
}

export type QuoteDetailPreserve = {
  phone: boolean;
  privateNote: boolean;
  clientSentence: boolean;
  rooms: boolean;
  lines: boolean;
};

export function quoteDetailPreserve(input: {
  quoteId: string;
  localDirty?: string | null;
  draftIds?: string[];
  queue?: QueueHoldItem[];
}): QuoteDetailPreserve {
  return {
    phone: fieldHeld(input.quoteId, input.localDirty, 'phone'),
    privateNote: fieldHeld(input.quoteId, input.localDirty, 'privateNote'),
    clientSentence: fieldHeld(input.quoteId, input.localDirty, 'clientSentence'),
    rooms: fieldHeld(input.quoteId, input.localDirty, 'rooms'),
    lines: unsyncedLinesProtected(input),
  };
}

/** Frozen money still takes the server snapshot. A pre-enqueue edit does not. */
export function draftForkShouldHoldLocalLines(input: {
  frozen: boolean;
  linesHeld: boolean;
}): boolean {
  return input.linesHeld && !input.frozen;
}

export type PulledTextRecord = {
  id: string;
  localDirty?: string | null;
  customerPhone: string | null;
  privateNote?: string | null;
  clientSentence?: string | null;
  roomsJson?: string | null;
};

export type PulledTextServer = {
  customerPhone: string | null;
  privateNote?: string | null;
  clientSentence?: string | null;
  rooms?: QuoteRoom[] | null;
};

/** Skip dirty phone, note, sentence, and rooms. Other columns stay the caller's job. */
export function assignPulledQuoteTextFields(
  record: PulledTextRecord,
  server: PulledTextServer,
): void {
  if (!fieldHeld(record.id, record.localDirty, 'phone')) {
    record.customerPhone = server.customerPhone;
  }
  if (!fieldHeld(record.id, record.localDirty, 'privateNote')) {
    record.privateNote = normalizePrivateNote(server.privateNote);
  }
  if (!fieldHeld(record.id, record.localDirty, 'clientSentence')) {
    record.clientSentence = server.clientSentence ?? null;
  }
  if (!fieldHeld(record.id, record.localDirty, 'rooms')) {
    record.roomsJson = serializeRooms((server.rooms ?? []) as QuoteRoom[]);
  }
}

export type DurableResumeAction =
  | { field: 'phone'; token: number; payload: { customerPhone: string } }
  | { field: 'privateNote'; token: number; payload: { privateNote: string | null } }
  | { field: 'clientSentence'; token: number; payload: { clientSentence: string | null } }
  | { field: 'rooms'; token: number; payload: { rooms: QuoteRoom[] } }
  | {
      field: 'lines';
      token: number;
      draftId: string;
      payload: { lineItemsJson: string; totalCents: number };
    };

/**
 * After a kill, the column still names unsynced fields. Re-queue the stored
 * values once. A live in-memory edit owns the field and is not resumed.
 * Frozen quotes are not resumed: PUT would 409 and then drop the marker.
 */
export function durableDirtyResumePlan(input: {
  quoteId: string;
  localDirty: string | null | undefined;
  customerPhone: string | null;
  privateNote: string | null;
  clientSentence: string | null;
  roomsJson: string | null;
  draftId: string | null;
  lineItemsJson: string | null;
  totalCents: number;
  frozen: boolean;
}): DurableResumeAction[] {
  if (input.frozen) return [];
  const dirty = parseLocalDirty(input.localDirty);
  const actions: DurableResumeAction[] = [];
  if (dirty.phone != null && !isDirtyField(input.quoteId, 'phone')) {
    actions.push({
      field: 'phone',
      token: dirty.phone,
      payload: { customerPhone: input.customerPhone ?? '' },
    });
  }
  if (dirty.privateNote != null && !isDirtyField(input.quoteId, 'privateNote')) {
    actions.push({
      field: 'privateNote',
      token: dirty.privateNote,
      payload: { privateNote: input.privateNote },
    });
  }
  if (dirty.clientSentence != null && !isDirtyField(input.quoteId, 'clientSentence')) {
    actions.push({
      field: 'clientSentence',
      token: dirty.clientSentence,
      payload: { clientSentence: input.clientSentence },
    });
  }
  if (dirty.rooms != null && !isDirtyField(input.quoteId, 'rooms')) {
    actions.push({
      field: 'rooms',
      token: dirty.rooms,
      payload: { rooms: parseRoomsForResume(input.roomsJson) },
    });
  }
  if (
    dirty.lines != null
    && input.draftId
    && input.lineItemsJson != null
    && !isDirtyField(input.quoteId, 'lines')
  ) {
    actions.push({
      field: 'lines',
      token: dirty.lines,
      draftId: input.draftId,
      payload: { lineItemsJson: input.lineItemsJson, totalCents: input.totalCents },
    });
  }
  return actions;
}

function parseRoomsForResume(json: string | null): QuoteRoom[] {
  if (json == null || json.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed as QuoteRoom[];
  } catch {
    return [];
  }
}

export type DirtyClear = { field: DirtyField; token: number };

/**
 * After a successful push, clear a dirty token only when the stored value
 * still matches what was sent. A newer local write keeps its token.
 */
export function durableClearsForSuccessfulPush(input: {
  localDirty: string | null | undefined;
  customerPhone: string | null;
  privateNote: string | null;
  clientSentence: string | null;
  roomsJson: string | null;
  lineItemsJson: string | null;
  payload: Record<string, unknown>;
}): DirtyClear[] {
  const dirty = parseLocalDirty(input.localDirty);
  const clears: DirtyClear[] = [];
  const payload = input.payload;
  if (
    dirty.phone != null
    && Object.prototype.hasOwnProperty.call(payload, 'customerPhone')
    && payload.customerPhone === input.customerPhone
  ) {
    clears.push({ field: 'phone', token: dirty.phone });
  }
  if (
    dirty.privateNote != null
    && Object.prototype.hasOwnProperty.call(payload, 'privateNote')
    && normalizePrivateNote(payload.privateNote as string | null) === input.privateNote
  ) {
    clears.push({ field: 'privateNote', token: dirty.privateNote });
  }
  if (
    dirty.clientSentence != null
    && Object.prototype.hasOwnProperty.call(payload, 'clientSentence')
    && normalizeClientSentence(payload.clientSentence as string | null) === input.clientSentence
  ) {
    clears.push({ field: 'clientSentence', token: dirty.clientSentence });
  }
  if (dirty.rooms != null && Array.isArray(payload.rooms)) {
    const sent = serializeRooms(payload.rooms as QuoteRoom[]);
    if (sent === (input.roomsJson ?? serializeRooms([]))) {
      clears.push({ field: 'rooms', token: dirty.rooms });
    }
  }
  if (
    dirty.lines != null
    && typeof payload.lineItemsJson === 'string'
    && payload.lineItemsJson === input.lineItemsJson
  ) {
    clears.push({ field: 'lines', token: dirty.lines });
  }
  return clears;
}
