import { parseCatalogUnit } from "../catalog/units.js";
import type { QuoteResponse } from "../types/quotes.js";
import {
  LINE_ITEM_COLUMNS,
  QUOTE_COLUMNS,
  quoteRowToResponse,
  type QuoteLineItemRow,
  type QuoteRow,
} from "../routes/quotes-payload.js";
import {
  CLIENT_QUOTE_STATUSES,
  FROZEN_QUOTE_STATUSES,
  QUOTE_MONEY_FROZEN_ERROR,
  isClientQuoteStatus,
  isFrozenQuoteStatus,
  type ClientQuoteStatus,
} from "./statuses.js";
import { parseOptionalPrivateNote } from "./private-note.js";
import {
  inferSnapshotPriceSource,
  isSnapshotPriceSource,
  parseOptionalPriceSource,
  type SnapshotPriceSource,
} from "./price-source.js";
import {
  isOptionRole,
  lineContributesToTotal,
  parseOptionalOptionGroupId,
  parseOptionalOptionRole,
  parseOptionGroupFields,
  type OptionRole,
} from "./option-groups.js";

export {
  CLIENT_QUOTE_STATUSES,
  FROZEN_QUOTE_STATUSES,
  QUOTE_MONEY_FROZEN_ERROR,
  isClientQuoteStatus,
  isFrozenQuoteStatus,
};
export type { ClientQuoteStatus };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type QuoteWriteQueryFn = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: unknown[] }>;

export type QuoteWriteErrorResult = { ok: false; status: 400 | 409; error: string };

export type ParsedLineItemInput = {
  name: string;
  quantity: number;
  unitPriceCents: number;
  /** undefined = omitted (preserve); null = explicit clear */
  confidence: number | null | undefined;
  /** undefined = omitted (preserve); null = explicit clear */
  catalogItemId?: string | null;
  /** undefined = omitted (preserve); null = explicit clear */
  unit?: string | null;
  /** undefined = omitted (preserve); null = explicit clear. Contractor-only. */
  privateNote?: string | null;
  /** undefined = omitted (preserve). */
  priceSource?: SnapshotPriceSource;
  /** undefined = omitted (preserve); null = explicit clear (with role). */
  optionGroupId?: string | null;
  /** undefined = omitted (preserve); null = explicit clear (with id). */
  optionRole?: OptionRole | null;
};

export type ResolvedLineItem = {
  name: string;
  quantity: number;
  unitPriceCents: number;
  confidence: number | null;
  catalogItemId: string | null;
  unit: string | null;
  privateNote: string | null;
  priceSource: SnapshotPriceSource;
  optionGroupId: string | null;
  optionRole: OptionRole | null;
};

export type ParsedQuotePutBody =
  | { ok: false; error: string }
  | {
      ok: true;
      status?: ClientQuoteStatus;
      customerPhone?: string | null;
      totalCents?: number;
      privateNote?: string | null;
      lineItems?: ParsedLineItemInput[];
    };

export type ParsedQuoteCreateBody =
  | { ok: false; error: string }
  | {
      ok: true;
      status: ClientQuoteStatus;
      customerPhone: string | null;
      totalCents: number;
      privateNote: string | null;
    };

export type QuotePutOutcome =
  | { status: 400 | 409 | 404; json: { error: string } }
  | { status: 200; json: { quote: QuoteResponse } };

export function isQuoteEditable(status: string): boolean {
  return isClientQuoteStatus(status) || status === "ai_failed";
}

/** SYNC-06: lineItems or totalCents on a frozen post-send quote. */
function putMutatesQuoteMoney(
  parsed: Extract<ParsedQuotePutBody, { ok: true }>,
): boolean {
  return parsed.lineItems !== undefined || parsed.totalCents !== undefined;
}

/**
 * Client PUT/POST may only write draft_local / draft_queued.
 * Phase 6 statuses and ai_processing are rejected so a client cannot self-approve or spoof the voice pipeline.
 * ai_failed is writable so the contractor can recover into a manual draft (A-10).
 */
export function parseClientQuoteStatus(value: unknown): { ok: true; status: ClientQuoteStatus } | { ok: false; error: string } {
  if (typeof value !== "string" || !isClientQuoteStatus(value)) {
    return {
      ok: false,
      error: "status must be draft_local or draft_queued",
    };
  }
  return { ok: true, status: value };
}

export function assertStatusTransition(
  from: string,
  to: ClientQuoteStatus,
): { ok: true } | QuoteWriteErrorResult {
  if (!isQuoteEditable(from)) {
    return {
      ok: false,
      status: 409,
      error: "Quote cannot be updated in its current status",
    };
  }
  if (!isClientQuoteStatus(to)) {
    return {
      ok: false,
      status: 400,
      error: "status must be draft_local or draft_queued",
    };
  }
  return { ok: true };
}

/** Integer cents, including 0 (empty quote / free line). Rejects floats and negatives. */
export function parseNonNegativeCents(
  value: unknown,
  fieldName: string,
): { ok: true; cents: number } | { ok: false; error: string } {
  if (!Number.isInteger(value) || (value as number) < 0) {
    return { ok: false, error: `${fieldName} must be an integer >= 0` };
  }
  return { ok: true, cents: value as number };
}

export function parseQuantity(
  value: unknown,
): { ok: true; quantity: number } | { ok: false; error: string } {
  if (!Number.isInteger(value) || (value as number) < 1) {
    return { ok: false, error: "quantity must be an integer >= 1" };
  }
  return { ok: true, quantity: value as number };
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function parseConfidence(
  value: unknown,
): { ok: true; confidence: number | null } | { ok: false; error: string } {
  if (value === null) {
    return { ok: true, confidence: null };
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    return { ok: false, error: "confidence must be a number between 0 and 1, or null" };
  }
  return { ok: true, confidence: value };
}

function parseOptionalCatalogItemId(
  value: unknown,
): { ok: true; catalogItemId: string | null } | { ok: false; error: string } {
  if (value === null) {
    return { ok: true, catalogItemId: null };
  }
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    return { ok: false, error: "catalogItemId must be a UUID or null" };
  }
  return { ok: true, catalogItemId: value };
}

export function parseLineItemInput(
  value: unknown,
): { ok: true; item: ParsedLineItemInput } | { ok: false; error: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "each line item must be an object" };
  }
  const raw = value as Record<string, unknown>;

  if (typeof raw.name !== "string" || raw.name.trim() === "") {
    return { ok: false, error: "name is required and must be a non-empty string" };
  }
  const name = raw.name.trim();
  if (name.length > 200) {
    return { ok: false, error: "name must be at most 200 characters" };
  }

  const quantity = parseQuantity(raw.quantity);
  if (!quantity.ok) {
    return quantity;
  }

  const unitPrice =
    raw.unitPriceCents === null
      ? ({ ok: true as const, cents: 0 })
      : parseNonNegativeCents(raw.unitPriceCents, "unitPriceCents");
  if (!unitPrice.ok) {
    return unitPrice;
  }

  let confidence: number | null | undefined;
  if (hasOwn(raw, "confidence")) {
    const parsed = parseConfidence(raw.confidence);
    if (!parsed.ok) {
      return parsed;
    }
    confidence = parsed.confidence;
  }

  let catalogItemId: string | null | undefined;
  if (hasOwn(raw, "catalogItemId")) {
    const parsed = parseOptionalCatalogItemId(raw.catalogItemId);
    if (!parsed.ok) {
      return parsed;
    }
    catalogItemId = parsed.catalogItemId;
  }

  let unit: string | null | undefined;
  if (hasOwn(raw, "unit")) {
    if (raw.unit === null || raw.unit === "") {
      unit = null;
    } else {
      unit = parseCatalogUnit(raw.unit);
    }
  }

  let privateNote: string | null | undefined;
  if (hasOwn(raw, "privateNote")) {
    const parsed = parseOptionalPrivateNote(raw.privateNote);
    if (!parsed.ok) {
      return parsed;
    }
    privateNote = parsed.note;
  }

  let priceSource: SnapshotPriceSource | undefined;
  if (hasOwn(raw, "priceSource")) {
    const parsed = parseOptionalPriceSource(raw.priceSource);
    if (!parsed.ok) {
      return parsed;
    }
    priceSource = parsed.source;
  }

  const idKeyPresent = hasOwn(raw, "optionGroupId");
  const roleKeyPresent = hasOwn(raw, "optionRole");
  let optionGroupId: string | null | undefined;
  let optionRole: OptionRole | null | undefined;
  if (idKeyPresent) {
    const parsed = parseOptionalOptionGroupId(raw.optionGroupId);
    if (!parsed.ok) {
      return parsed;
    }
    optionGroupId = parsed.optionGroupId;
  }
  if (roleKeyPresent) {
    const parsed = parseOptionalOptionRole(raw.optionRole);
    if (!parsed.ok) {
      return parsed;
    }
    optionRole = parsed.optionRole;
  }
  if (idKeyPresent || roleKeyPresent) {
    const pair = parseOptionGroupFields(
      optionGroupId,
      optionRole,
      idKeyPresent,
      roleKeyPresent,
    );
    if (!pair.ok) {
      return pair;
    }
    optionGroupId = pair.fields.optionGroupId;
    optionRole = pair.fields.optionRole;
  }

  return {
    ok: true,
    item: {
      name,
      quantity: quantity.quantity,
      unitPriceCents: unitPrice.cents,
      confidence,
      catalogItemId,
      unit,
      privateNote,
      priceSource,
      optionGroupId,
      optionRole,
    },
  };
}

export function totalCentsFromLineItems(
  items: Array<{ quantity: number; unitPriceCents: number; optionRole?: string | null }>,
): number {
  return items.reduce((sum, item) => {
    if (!lineContributesToTotal(item)) {
      return sum;
    }
    return sum + item.quantity * item.unitPriceCents;
  }, 0);
}

/**
 * Match incoming replace rows onto existing snapshots by name (order for duplicates).
 * Omitted confidence / catalogItemId keep the matched row; explicit null clears.
 *
 * Client catalogItemId values that do not match an existing snapshot are ignored.
 * Mobile local catalog UUIDs must not be written to catalog_item_id (FK + wrong tenant).
 */
export function resolveReplacementLineItems(
  incoming: ParsedLineItemInput[],
  existing: Array<
    Pick<
      QuoteLineItemRow,
      | "name"
      | "confidence"
      | "catalog_item_id"
      | "unit"
      | "private_note"
      | "price_source"
      | "option_group_id"
      | "option_role"
    >
  >,
): ResolvedLineItem[] {
  const unused = existing.map((row) => ({ ...row }));

  return incoming.map((item) => {
    let matchIndex = -1;
    if (item.catalogItemId) {
      matchIndex = unused.findIndex((row) => row.catalog_item_id === item.catalogItemId);
    }
    if (matchIndex < 0) {
      matchIndex = unused.findIndex((row) => row.name === item.name);
    }
    const match = matchIndex >= 0 ? unused.splice(matchIndex, 1)[0] : undefined;

    const confidence =
      item.confidence !== undefined ? item.confidence : (match?.confidence ?? null);

    let catalogItemId: string | null;
    if (item.catalogItemId === null) {
      catalogItemId = null;
    } else if (item.catalogItemId !== undefined && match?.catalog_item_id === item.catalogItemId) {
      catalogItemId = item.catalogItemId;
    } else {
      catalogItemId = match?.catalog_item_id ?? null;
    }

    let unit: string | null;
    if (item.unit === null) {
      unit = null;
    } else if (item.unit !== undefined) {
      unit = item.unit;
    } else {
      unit = match?.unit ?? null;
    }

    let privateNote: string | null;
    if (item.privateNote === null) {
      privateNote = null;
    } else if (item.privateNote !== undefined) {
      privateNote = item.privateNote;
    } else {
      privateNote = match?.private_note ?? null;
    }

    let priceSource: SnapshotPriceSource;
    if (item.priceSource !== undefined) {
      priceSource = item.priceSource;
    } else if (isSnapshotPriceSource(match?.price_source)) {
      priceSource = match.price_source;
    } else {
      priceSource = inferSnapshotPriceSource(item.unitPriceCents);
    }

    let optionGroupId: string | null;
    let optionRole: OptionRole | null;
    if (item.optionGroupId === null || item.optionRole === null) {
      optionGroupId = null;
      optionRole = null;
    } else if (item.optionGroupId !== undefined && item.optionRole !== undefined) {
      optionGroupId = item.optionGroupId;
      optionRole = item.optionRole;
    } else if (isOptionRole(match?.option_role) && match?.option_group_id) {
      optionGroupId = match.option_group_id;
      optionRole = match.option_role;
    } else {
      optionGroupId = null;
      optionRole = null;
    }

    return {
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      confidence,
      catalogItemId,
      unit,
      privateNote,
      priceSource,
      optionGroupId,
      optionRole,
    };
  });
}

function asBodyObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  return body as Record<string, unknown>;
}

export function parseQuoteCreateBody(body: unknown): ParsedQuoteCreateBody {
  const raw = asBodyObject(body);

  let status: ClientQuoteStatus = "draft_local";
  if (hasOwn(raw, "status") && raw.status !== undefined) {
    const parsed = parseClientQuoteStatus(raw.status);
    if (!parsed.ok) {
      return parsed;
    }
    status = parsed.status;
  }

  let totalCents = 0;
  if (hasOwn(raw, "totalCents") && raw.totalCents !== undefined) {
    const parsed = parseNonNegativeCents(raw.totalCents, "totalCents");
    if (!parsed.ok) {
      return parsed;
    }
    totalCents = parsed.cents;
  }

  const customerPhone =
    raw.customerPhone === undefined ? null : (raw.customerPhone as string | null);

  let privateNote: string | null = null;
  if (hasOwn(raw, "privateNote")) {
    const parsed = parseOptionalPrivateNote(raw.privateNote);
    if (!parsed.ok) {
      return parsed;
    }
    privateNote = parsed.note;
  }

  return { ok: true, status, customerPhone, totalCents, privateNote };
}

export function parseQuotePutBody(body: unknown): ParsedQuotePutBody {
  const raw = asBodyObject(body);
  const parsed: Extract<ParsedQuotePutBody, { ok: true }> = { ok: true };

  if (hasOwn(raw, "status") && raw.status !== undefined) {
    const status = parseClientQuoteStatus(raw.status);
    if (!status.ok) {
      return status;
    }
    parsed.status = status.status;
  }

  if (hasOwn(raw, "customerPhone")) {
    parsed.customerPhone = raw.customerPhone as string | null;
  }

  if (hasOwn(raw, "privateNote")) {
    const note = parseOptionalPrivateNote(raw.privateNote);
    if (!note.ok) {
      return note;
    }
    parsed.privateNote = note.note;
  }

  if (hasOwn(raw, "totalCents") && raw.totalCents !== undefined) {
    const cents = parseNonNegativeCents(raw.totalCents, "totalCents");
    if (!cents.ok) {
      return cents;
    }
    parsed.totalCents = cents.cents;
  }

  if (hasOwn(raw, "lineItems") && raw.lineItems !== undefined) {
    if (!Array.isArray(raw.lineItems)) {
      return { ok: false, error: "lineItems must be an array" };
    }
    const items: ParsedLineItemInput[] = [];
    for (const entry of raw.lineItems) {
      const item = parseLineItemInput(entry);
      if (!item.ok) {
        return item;
      }
      items.push(item.item);
    }
    parsed.lineItems = items;
  }

  if (
    parsed.status === undefined &&
    parsed.customerPhone === undefined &&
    parsed.totalCents === undefined &&
    parsed.privateNote === undefined &&
    parsed.lineItems === undefined
  ) {
    return { ok: false, error: "At least one field required" };
  }

  return parsed;
}

export const SELECT_QUOTE_FOR_UPDATE_SQL = `SELECT ${QUOTE_COLUMNS}
       FROM quotes
       WHERE id = $1 AND contractor_id = $2
       FOR UPDATE`;

export const SELECT_LINE_ITEMS_SQL = `SELECT ${LINE_ITEM_COLUMNS}
       FROM quote_line_items
       WHERE quote_id = $1
       ORDER BY created_at ASC`;

export const DELETE_LINE_ITEMS_SQL = `DELETE FROM quote_line_items WHERE quote_id = $1`;

export const INSERT_LINE_ITEM_SQL = `INSERT INTO quote_line_items (quote_id, name, quantity, unit_price_cents, confidence, catalog_item_id, unit, private_note, price_source, option_group_id, option_role)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;

/**
 * Quote metadata + line-item replace on one query function so the caller can
 * wrap this in a single DB transaction (BEGIN/COMMIT/ROLLBACK).
 */
export async function applyQuotePut(
  queryFn: QuoteWriteQueryFn,
  args: { quoteId: string; contractorId: string; body: unknown },
): Promise<QuotePutOutcome> {
  const parsed = parseQuotePutBody(args.body);
  if (!parsed.ok) {
    return { status: 400, json: { error: parsed.error } };
  }

  const quoteResult = await queryFn(SELECT_QUOTE_FOR_UPDATE_SQL, [
    args.quoteId,
    args.contractorId,
  ]);
  if (quoteResult.rows.length === 0) {
    return { status: 404, json: { error: "Quote not found" } };
  }
  const current = quoteResult.rows[0] as QuoteRow;

  // SYNC-06: freeze line items / totals on sent + siblings before any DELETE/INSERT.
  // GET and PATCH /archive are separate routes and stay allowed.
  if (isFrozenQuoteStatus(current.status) && putMutatesQuoteMoney(parsed)) {
    return { status: 409, json: { error: QUOTE_MONEY_FROZEN_ERROR } };
  }

  if (!isQuoteEditable(current.status)) {
    return { status: 409, json: { error: "Quote cannot be updated in its current status" } };
  }

  if (parsed.status !== undefined) {
    const transition = assertStatusTransition(current.status, parsed.status);
    if (!transition.ok) {
      return { status: transition.status, json: { error: transition.error } };
    }
  }

  let resolvedLines: ResolvedLineItem[] | undefined;
  let totalCents = parsed.totalCents;

  if (parsed.lineItems !== undefined) {
    const existingResult = await queryFn(SELECT_LINE_ITEMS_SQL, [args.quoteId]);
    resolvedLines = resolveReplacementLineItems(
      parsed.lineItems,
      existingResult.rows as QuoteLineItemRow[],
    );
    totalCents = totalCentsFromLineItems(resolvedLines);
  }

  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (parsed.status !== undefined) {
    params.push(parsed.status);
    setClauses.push(`status = $${params.length}`);
  }
  if (parsed.customerPhone !== undefined) {
    params.push(parsed.customerPhone);
    setClauses.push(`customer_phone = $${params.length}`);
  }
  if (parsed.privateNote !== undefined) {
    params.push(parsed.privateNote);
    setClauses.push(`private_note = $${params.length}`);
  }
  if (totalCents !== undefined) {
    params.push(totalCents);
    setClauses.push(`total_cents = $${params.length}`);
  }

  let quote = current;
  if (setClauses.length > 0) {
    params.push(args.quoteId);
    const idParam = params.length;
    params.push(args.contractorId);
    const contractorParam = params.length;
    const updateSql = `UPDATE quotes
         SET ${setClauses.join(", ")}
         WHERE id = $${idParam} AND contractor_id = $${contractorParam}
         RETURNING ${QUOTE_COLUMNS}`;
    const updated = await queryFn(updateSql, params);
    if (updated.rows.length === 0) {
      return { status: 404, json: { error: "Quote not found" } };
    }
    quote = updated.rows[0] as QuoteRow;
  }

  if (resolvedLines) {
    await queryFn(DELETE_LINE_ITEMS_SQL, [args.quoteId]);
    for (const item of resolvedLines) {
      await queryFn(INSERT_LINE_ITEM_SQL, [
        args.quoteId,
        item.name,
        item.quantity,
        item.unitPriceCents,
        item.confidence,
        item.catalogItemId,
        item.unit,
        item.privateNote,
        item.priceSource,
        item.optionGroupId,
        item.optionRole,
      ]);
    }
  }

  return { status: 200, json: { quote: quoteRowToResponse(quote) } };
}
