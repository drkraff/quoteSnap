/**
 * Start a new local draft from an existing quote.
 * Copies customer-facing lines, rooms, option groups, the client sentence,
 * and private notes. Does not copy status, send/approval timestamps,
 * follow-up columns, server ids, snapshots, tokens, or the archived flag.
 * Photos are omitted: stills live under photos/{sourceQuoteId}/ and may
 * carry that quote's server attachment id. Sharing the file or the id
 * would tie the copy to the original. A duplicate starts with no photos.
 * Blank prices stay blank. New ids so editing the copy cannot change the source.
 * The source quote is never written — a sent quote stays frozen (SYNC-06).
 */

import { database } from '../db';
import { Draft } from '../db/models/draft';
import { Quote } from '../db/models/quote';
import { enqueue, type SyncEnqueueParams } from '../sync/sync-queue';
import { Q } from '@nozbe/watermelondb';
import { normalizeClientSentence } from './client-sentence';
import { normalizePrivateNote } from './private-notes';
import { newRoomId, parseRoomsJson, sanitizeLineRooms, serializeRooms, type QuoteRoom } from './rooms';
import { sanitizeOptionGroups } from './option-groups';
import {
  parseLineItems,
  recalculateTotal,
  serializeLineItems,
  type LineItem,
} from '../utils/line-items';
import type { PriceSource } from '../utils/price-source';

export const DUPLICATE_QUOTE_LABEL = 'Duplicate';

export const DUPLICATE_QUOTE_HINT =
  'Makes a new draft from this quote. This one stays as it is.';

export const DUPLICATE_QUOTE_A11Y = 'Duplicate quote';

export const DUPLICATE_QUOTE_FAILED_TITLE = 'Could not duplicate';

export const DUPLICATE_QUOTE_FAILED_MESSAGE = 'Try again in a moment.';

export const DUPLICATE_QUOTE_MISSING_MESSAGE = 'This quote is not on this device.';

export type DuplicateIdFactory = () => string;

export type DuplicateQuoteSource = {
  status?: string;
  customerPhone?: string | null;
  totalCents?: number;
  sentAt?: Date | string | number | null;
  approvedAt?: Date | string | number | null;
  declinedAt?: Date | string | number | null;
  followedUpAt?: Date | string | number | null;
  followUpDismissed?: boolean | null;
  serverId?: string | null;
  voiceJobId?: string | null;
  aiFailureStage?: string | null;
  isArchived?: boolean | null;
  privateNote?: string | null;
  clientSentence?: string | null;
  rooms?: QuoteRoom[] | null;
  roomsJson?: string | null;
  photos?: unknown;
  photosJson?: string | null;
  lineItems?: unknown;
  lineItemsJson?: string | null;
  snapshot?: unknown;
  snapshotId?: string | null;
  approvalToken?: string | null;
  tokenHash?: string | null;
};

export type DuplicateDraft = {
  status: 'draft_local';
  customerPhone: string | null;
  totalCents: number;
  isArchived: false;
  serverId: null;
  sentAt: null;
  approvedAt: null;
  declinedAt: null;
  followedUpAt: null;
  followUpDismissed: null;
  voiceJobId: null;
  aiFailureStage: null;
  privateNote: string | null;
  clientSentence: string | null;
  rooms: QuoteRoom[];
  roomsJson: string;
  lineItems: LineItem[];
  lineItemsJson: string;
  photos: [];
  photosJson: '[]';
};

export type DuplicateTapGuard = {
  tryBegin: () => boolean;
  end: () => void;
};

/** One in-flight duplicate. A second tap while the first is running is ignored. */
export function createDuplicateTapGuard(): DuplicateTapGuard {
  let busy = false;
  return {
    tryBegin(): boolean {
      if (busy) return false;
      busy = true;
      return true;
    },
    end(): void {
      busy = false;
    },
  };
}

export async function runDuplication(
  guard: DuplicateTapGuard,
  work: () => Promise<void>,
): Promise<'started' | 'ignored'> {
  if (!guard.tryBegin()) return 'ignored';
  try {
    await work();
    return 'started';
  } finally {
    guard.end();
  }
}

function freshId(newId: DuplicateIdFactory, used: Set<string>): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = newId();
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
  const id = newId();
  used.add(id);
  return id;
}

function copyPhone(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function sourceRooms(source: DuplicateQuoteSource): QuoteRoom[] {
  if (typeof source.roomsJson === 'string') {
    return parseRoomsJson(source.roomsJson);
  }
  if (Array.isArray(source.rooms)) {
    return parseRoomsJson(JSON.stringify(source.rooms));
  }
  return [];
}

function sourceLines(source: DuplicateQuoteSource): LineItem[] {
  if (typeof source.lineItemsJson === 'string') {
    return parseLineItems(source.lineItemsJson);
  }
  if (Array.isArray(source.lineItems)) {
    return parseLineItems(JSON.stringify(source.lineItems));
  }
  return [];
}

/**
 * Blank cents stay blank. A stored flag that would claim a spoken or
 * catalog price is not kept on a blank — the draft treats blanks as unknown.
 * A filled price keeps its stored flag. Missing flags are not invented.
 */
function priceSourceForCopy(item: LineItem): PriceSource | undefined {
  const blank = item.unitPriceCents == null || item.unitPriceCents === 0;
  if (blank) {
    return item.priceSource ? 'unknown' : undefined;
  }
  return item.priceSource;
}

function copyRooms(
  rooms: readonly QuoteRoom[],
  newId: DuplicateIdFactory,
  used: Set<string>,
): { rooms: QuoteRoom[]; roomIds: Map<string, string> } {
  const roomIds = new Map<string, string>();
  const next: QuoteRoom[] = [];
  for (const room of rooms) {
    const id = freshId(newId, used);
    roomIds.set(room.id, id);
    const copy: QuoteRoom = { id, name: room.name };
    const note = normalizePrivateNote(room.privateNote);
    if (note) copy.privateNote = note;
    next.push(copy);
  }
  return { rooms: next, roomIds };
}

function copyLines(
  items: readonly LineItem[],
  roomIds: ReadonlyMap<string, string>,
  newId: DuplicateIdFactory,
  used: Set<string>,
): LineItem[] {
  const groupIds = new Map<string, string>();
  const copied = items.map((item) => {
    const next: LineItem = {
      catalogItemId: typeof item.catalogItemId === 'string' ? item.catalogItemId : '',
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    };
    if (item.unit) next.unit = item.unit;
    if (item.privateNote !== undefined) {
      next.privateNote = normalizePrivateNote(item.privateNote);
    }
    const priceSource = priceSourceForCopy(item);
    if (priceSource) next.priceSource = priceSource;
    if (item.materialCostCents != null && item.materialCostCents > 0) {
      next.materialCostCents = item.materialCostCents;
    }
    if (item.optionGroupId && item.optionRole) {
      let groupId = groupIds.get(item.optionGroupId);
      if (!groupId) {
        groupId = freshId(newId, used);
        groupIds.set(item.optionGroupId, groupId);
      }
      next.optionGroupId = groupId;
      next.optionRole = item.optionRole;
    }
    const mappedRoom = item.roomId ? roomIds.get(item.roomId) : undefined;
    if (mappedRoom) next.roomId = mappedRoom;
    if (item.clientId) next.clientId = freshId(newId, used);
    return next;
  });
  return sanitizeOptionGroups(copied);
}

/**
 * Pure copy. Does not read the database and does not mutate `source`.
 * `newId` supplies room, option-group, and line client ids.
 */
function rememberSourceIds(
  rooms: readonly QuoteRoom[],
  lines: readonly LineItem[],
  used: Set<string>,
): void {
  for (const room of rooms) used.add(room.id);
  for (const line of lines) {
    if (line.roomId) used.add(line.roomId);
    if (line.optionGroupId) used.add(line.optionGroupId);
    if (line.clientId) used.add(line.clientId);
  }
}

export function buildDuplicateDraft(
  source: DuplicateQuoteSource,
  newId: DuplicateIdFactory = newRoomId,
): DuplicateDraft {
  const roomsIn = sourceRooms(source);
  const linesIn = sourceLines(source);
  const used = new Set<string>();
  rememberSourceIds(roomsIn, linesIn, used);
  const { rooms, roomIds } = copyRooms(roomsIn, newId, used);
  const lineItems = sanitizeLineRooms(
    rooms,
    copyLines(linesIn, roomIds, newId, used),
  );
  const roomsJson = serializeRooms(rooms);
  const lineItemsJson = serializeLineItems(lineItems);
  return {
    status: 'draft_local',
    customerPhone: copyPhone(source.customerPhone),
    totalCents: recalculateTotal(lineItems),
    isArchived: false,
    serverId: null,
    sentAt: null,
    approvedAt: null,
    declinedAt: null,
    followedUpAt: null,
    followUpDismissed: null,
    voiceJobId: null,
    aiFailureStage: null,
    privateNote: normalizePrivateNote(source.privateNote),
    clientSentence: normalizeClientSentence(source.clientSentence),
    rooms,
    roomsJson,
    lineItems,
    lineItemsJson,
    photos: [],
    photosJson: '[]',
  };
}

export type DuplicateLocalQuoteFields = {
  contractorId: string;
  status: string;
  totalCents: number;
  isArchived: boolean | null;
  customerPhone: string | null;
  privateNote: string | null;
  clientSentence: string | null;
  roomsJson: string | null;
  photosJson: string | null;
  serverId: string | null;
  sentAt: Date | null;
  voiceJobId: string | null;
  aiFailureStage: string | null;
  followedUpAt: Date | null;
  followUpDismissed: boolean | null;
};

/** Fields for the new Watermelon row. Never call this on the source quote. */
export function assignDuplicateQuoteRecord(
  record: DuplicateLocalQuoteFields,
  contractorId: string,
  draft: DuplicateDraft,
): void {
  record.contractorId = contractorId;
  record.status = 'draft_local';
  record.totalCents = draft.totalCents;
  record.isArchived = false;
  record.customerPhone = draft.customerPhone;
  record.privateNote = draft.privateNote;
  record.clientSentence = draft.clientSentence;
  record.roomsJson = draft.roomsJson;
  record.photosJson = '[]';
  record.serverId = null;
  record.sentAt = null;
  record.voiceJobId = null;
  record.aiFailureStage = null;
  record.followedUpAt = null;
  record.followUpDismissed = null;
}

export function duplicateQuoteEnqueuePlan(input: {
  quoteId: string;
  draftId: string;
  sourceQuoteId: string;
  draft: DuplicateDraft;
}): {
  quoteCreate: SyncEnqueueParams;
  draftUpdate: SyncEnqueueParams | null;
} {
  if (input.quoteId === input.sourceQuoteId || input.draftId === input.sourceQuoteId) {
    throw new Error('Duplicate ids must not be the source quote');
  }
  const payload: Record<string, unknown> = {
    status: 'draft_local',
    totalCents: input.draft.totalCents,
    privateNote: input.draft.privateNote,
    clientSentence: input.draft.clientSentence,
  };
  if (input.draft.customerPhone) {
    payload.customerPhone = input.draft.customerPhone;
  }
  const needsLines = input.draft.lineItems.length > 0 || input.draft.rooms.length > 0;
  return {
    quoteCreate: {
      entityType: 'quote',
      entityId: input.quoteId,
      action: 'create',
      payload,
    },
    draftUpdate: needsLines
      ? {
          entityType: 'draft',
          entityId: input.draftId,
          action: 'update',
          payload: {
            lineItemsJson: input.draft.lineItemsJson,
            totalCents: input.draft.totalCents,
          },
        }
      : null,
  };
}

export type DuplicateSourceRecord = DuplicateQuoteSource & {
  id: string;
};

export type DuplicateQuoteDeps = {
  findQuote: (quoteId: string) => Promise<DuplicateSourceRecord | null>;
  findDraftJson: (quoteId: string) => Promise<string | null>;
  write: (work: () => Promise<void>) => Promise<void>;
  createQuote: (assign: (record: DuplicateLocalQuoteFields) => void) => Promise<{ id: string }>;
  createDraft: (
    assign: (record: { quoteId: string; lineItemsJson: string }) => void,
  ) => Promise<{ id: string }>;
  enqueue: (params: SyncEnqueueParams) => Promise<void>;
  newId?: DuplicateIdFactory;
};

export type DuplicateQuoteResult =
  | { ok: true; quoteId: string }
  | { ok: false; reason: 'not_found' };

function quoteToSource(quote: Quote, lineItemsJson: string | null): DuplicateSourceRecord {
  return {
    id: quote.id,
    status: quote.status,
    customerPhone: quote.customerPhone,
    totalCents: quote.totalCents,
    sentAt: quote.sentAt,
    serverId: quote.serverId,
    voiceJobId: quote.voiceJobId,
    aiFailureStage: quote.aiFailureStage,
    isArchived: quote.isArchived,
    privateNote: quote.privateNote,
    clientSentence: quote.clientSentence,
    roomsJson: quote.roomsJson,
    photosJson: quote.photosJson,
    followedUpAt: quote.followedUpAt,
    followUpDismissed: quote.followUpDismissed,
    lineItemsJson,
  };
}

async function defaultFindQuote(quoteId: string): Promise<DuplicateSourceRecord | null> {
  try {
    const quote = await database.get<Quote>('quotes').find(quoteId);
    const drafts = await database.get<Draft>('drafts').query(Q.where('quote_id', quoteId)).fetch();
    return quoteToSource(quote, drafts[0]?.lineItemsJson ?? null);
  } catch {
    return null;
  }
}

/**
 * Create the copy locally and queue it the same way a Manual Quote is created:
 * quote `create`, then a draft `update` for lines and rooms. Offline is fine.
 * Does not update the source quote.
 */
export async function duplicateQuoteOnDevice(
  input: { sourceQuoteId: string; contractorId: string },
  deps?: DuplicateQuoteDeps,
): Promise<DuplicateQuoteResult> {
  const resolved: DuplicateQuoteDeps = deps ?? {
    findQuote: async (quoteId) => defaultFindQuote(quoteId),
    findDraftJson: async () => null,
    write: (work) => database.write(work),
    createQuote: (assign) => database.get<Quote>('quotes').create((record) => {
      assign(record);
    }),
    createDraft: (assign) => database.get<Draft>('drafts').create((record) => {
      assign(record);
    }),
    enqueue,
  };

  const source = await resolved.findQuote(input.sourceQuoteId);
  if (!source) return { ok: false, reason: 'not_found' };
  const lineItemsJson = typeof source.lineItemsJson === 'string' || Array.isArray(source.lineItems)
    ? source.lineItemsJson
    : await resolved.findDraftJson(source.id);
  const draft = buildDuplicateDraft(
    typeof lineItemsJson === 'string' ? { ...source, lineItemsJson } : source,
    resolved.newId,
  );
  let quoteId = '';
  let draftId = '';
  await resolved.write(async () => {
    const created = await resolved.createQuote((record) => {
      assignDuplicateQuoteRecord(record, input.contractorId, draft);
    });
    quoteId = created.id;
    const createdDraft = await resolved.createDraft((record) => {
      record.quoteId = created.id;
      record.lineItemsJson = draft.lineItemsJson;
    });
    draftId = createdDraft.id;
  });
  const plan = duplicateQuoteEnqueuePlan({
    quoteId,
    draftId,
    sourceQuoteId: source.id,
    draft,
  });
  await resolved.enqueue(plan.quoteCreate);
  if (plan.draftUpdate) {
    await resolved.enqueue(plan.draftUpdate);
  }
  return { ok: true, quoteId };
}
