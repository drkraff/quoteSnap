/**
 * Authenticated send: write the snapshot and approval token once, then
 * hand the link to an SmsSender. The default sender only logs.
 */

import {
  LINE_ITEM_COLUMNS,
  QUOTE_COLUMNS,
  type QuoteLineItemRow,
  type QuoteRow,
} from "../routes/quotes-payload.js";
import {
  approvalExpiresAt,
  buildApprovalUrl,
  generateApprovalToken,
  hashApprovalToken,
} from "./approval-token.js";
import {
  SELECT_SNAPSHOT_FOR_QUOTE_SQL,
  buildQuoteSnapshotPayload,
  insertQuoteSnapshotOnce,
  normalizeSnapshotBrand,
  type SnapshotQueryFn,
} from "./quote-snapshot.js";
import type { SmsSender } from "./sms-sender.js";

export const SEND_PHONE_REQUIRED_ERROR = "A customer phone number is required to send";
export const SEND_PHONE_INVALID_ERROR =
  "customer phone must be 20 characters or fewer and include 7 to 15 digits";
export const SEND_EMPTY_QUOTE_ERROR = "Add at least one item before sending";
export const QUOTE_NOT_SENDABLE_ERROR = "Quote cannot be sent in its current status";
export const SNAPSHOT_EXISTS_ERROR = "Quote snapshot already exists";
export const QUOTE_NOT_FOUND_ERROR = "Quote not found";

/** Drafts, AI-failed recovery, and share-marked sent (no snapshot yet). */
export const SENDABLE_QUOTE_STATUSES = [
  "draft_local",
  "draft_queued",
  "ai_failed",
  "sent",
] as const;

export type SendableQuoteStatus = (typeof SENDABLE_QUOTE_STATUSES)[number];

const SENDABLE_STATUS_SET: ReadonlySet<string> = new Set(SENDABLE_QUOTE_STATUSES);

export function isSendableQuoteStatus(value: string): value is SendableQuoteStatus {
  return SENDABLE_STATUS_SET.has(value);
}

export const SELECT_QUOTE_FOR_SEND_SQL = `SELECT ${QUOTE_COLUMNS}
  FROM quotes
  WHERE id = $1 AND contractor_id = $2
  FOR UPDATE`;

export const SELECT_SEND_LINE_ITEMS_SQL = `SELECT ${LINE_ITEM_COLUMNS}
  FROM quote_line_items
  WHERE quote_id = $1
  ORDER BY created_at ASC`;

export const SELECT_CONTRACTOR_BRAND_SQL = `SELECT display_name, trade
  FROM contractors
  WHERE id = $1`;

export const INSERT_APPROVAL_TOKEN_SQL = `INSERT INTO quote_approval_tokens (
    quote_id, snapshot_id, token_hash, expires_at
  ) VALUES ($1, $2, $3, $4)
  RETURNING expires_at`;

/** Status and phone only. Line items and totals stay on the existing rows. */
export const MARK_QUOTE_SENT_SQL = `UPDATE quotes
  SET status = 'sent',
      sent_at = COALESCE(sent_at, $3),
      customer_phone = $4
  WHERE id = $1
    AND contractor_id = $2
    AND status IN ('draft_local', 'draft_queued', 'ai_failed', 'sent')
  RETURNING id, status, sent_at`;

export type SendQuoteJson = {
  quoteId: string;
  status: "sent";
  sentAt: string | null;
  expiresAt: string;
  sms: { mode: "dry-run" };
  approvalUrl?: string;
};

export type SendQuoteOutcome =
  | { status: 400 | 404 | 409; json: { error: string } }
  | { status: 201; json: SendQuoteJson };

export function parseCustomerPhoneForSend(
  value: unknown,
): { ok: true; phone: string } | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: SEND_PHONE_REQUIRED_ERROR };
  }
  const phone = value.trim();
  if (phone.length === 0) {
    return { ok: false, error: SEND_PHONE_REQUIRED_ERROR };
  }
  if (phone.length > 20) {
    return { ok: false, error: SEND_PHONE_INVALID_ERROR };
  }
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return { ok: false, error: SEND_PHONE_INVALID_ERROR };
  }
  return { ok: true, phone };
}

export function resolveSendPhone(
  bodyPhone: unknown,
  stored: string | null,
): { ok: true; phone: string } | { ok: false; error: string } {
  if (bodyPhone !== undefined && bodyPhone !== null) {
    return parseCustomerPhoneForSend(bodyPhone);
  }
  return parseCustomerPhoneForSend(stored);
}

function asBodyObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  return body as Record<string, unknown>;
}

export function sendQuoteJson(args: {
  quoteId: string;
  sentAt: Date | null;
  expiresAt: Date;
  approvalUrl: string;
  smsMode: "dry-run";
}): SendQuoteJson {
  const json: SendQuoteJson = {
    quoteId: args.quoteId,
    status: "sent",
    sentAt: args.sentAt ? args.sentAt.toISOString() : null,
    expiresAt: args.expiresAt.toISOString(),
    sms: { mode: args.smsMode },
  };
  if (args.smsMode === "dry-run") {
    json.approvalUrl = args.approvalUrl;
  }
  return json;
}

function asDate(value: Date | string | null): Date | null {
  if (value == null) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}

/**
 * Create the write-once snapshot and token, mark the quote sent, then call
 * the sender. A quote that already has a snapshot is refused — the payload
 * is not replaced and the raw token cannot be reissued.
 */
export async function sendQuoteForApproval(
  queryFn: SnapshotQueryFn,
  args: {
    quoteId: string;
    contractorId: string;
    body: unknown;
    sender: SmsSender;
    now: Date;
    publicBaseUrl: string;
    ttlMs: number;
    generateToken?: () => string;
  },
): Promise<SendQuoteOutcome> {
  const quoteResult = await queryFn(SELECT_QUOTE_FOR_SEND_SQL, [
    args.quoteId,
    args.contractorId,
  ]);
  if (quoteResult.rows.length === 0) {
    return { status: 404, json: { error: QUOTE_NOT_FOUND_ERROR } };
  }
  const quote = quoteResult.rows[0] as QuoteRow;
  if (!isSendableQuoteStatus(quote.status)) {
    return { status: 409, json: { error: QUOTE_NOT_SENDABLE_ERROR } };
  }

  const existingSnapshot = await queryFn(SELECT_SNAPSHOT_FOR_QUOTE_SQL, [args.quoteId]);
  if (existingSnapshot.rows.length > 0) {
    return { status: 409, json: { error: SNAPSHOT_EXISTS_ERROR } };
  }

  const lineResult = await queryFn(SELECT_SEND_LINE_ITEMS_SQL, [args.quoteId]);
  const payload = buildQuoteSnapshotPayload({
    quote,
    lineItems: lineResult.rows as QuoteLineItemRow[],
  });
  if (payload.lineItems.length === 0) {
    return { status: 400, json: { error: SEND_EMPTY_QUOTE_ERROR } };
  }

  const body = asBodyObject(args.body);
  const phone = resolveSendPhone(
    Object.prototype.hasOwnProperty.call(body, "customerPhone") ? body.customerPhone : undefined,
    quote.customer_phone,
  );
  if (!phone.ok) {
    return { status: 400, json: { error: phone.error } };
  }

  const brandResult = await queryFn(SELECT_CONTRACTOR_BRAND_SQL, [args.contractorId]);
  if (brandResult.rows.length === 0) {
    return { status: 404, json: { error: QUOTE_NOT_FOUND_ERROR } };
  }
  const brandRow = brandResult.rows[0] as {
    display_name: string | null;
    trade: string | null;
  };
  const brand = normalizeSnapshotBrand(brandRow.display_name, brandRow.trade);

  const saved = await insertQuoteSnapshotOnce(queryFn, {
    quoteId: args.quoteId,
    contractorId: args.contractorId,
    payload,
    contractorDisplayName: brand.displayName,
    contractorTrade: brand.trade,
  });
  if (!saved.created) {
    return { status: 409, json: { error: SNAPSHOT_EXISTS_ERROR } };
  }

  const rawToken = (args.generateToken ?? generateApprovalToken)();
  const tokenHash = hashApprovalToken(rawToken);
  const expiresAt = approvalExpiresAt(args.now, args.ttlMs);
  await queryFn(INSERT_APPROVAL_TOKEN_SQL, [
    args.quoteId,
    saved.snapshot.id,
    tokenHash,
    expiresAt,
  ]);

  const marked = await queryFn(MARK_QUOTE_SENT_SQL, [
    args.quoteId,
    args.contractorId,
    args.now,
    phone.phone,
  ]);
  if (marked.rows.length === 0) {
    // Throw so withTransaction rolls the snapshot and token back.
    throw new Error(QUOTE_NOT_SENDABLE_ERROR);
  }
  const markedRow = marked.rows[0] as {
    id: string;
    status: string;
    sent_at: Date | string | null;
  };

  const approvalUrl = buildApprovalUrl(args.publicBaseUrl, rawToken);
  const sms = await args.sender.sendQuoteLink({
    toPhone: phone.phone,
    approvalUrl,
    quoteId: args.quoteId,
  });

  return {
    status: 201,
    json: sendQuoteJson({
      quoteId: args.quoteId,
      sentAt: asDate(markedRow.sent_at),
      expiresAt,
      approvalUrl,
      smsMode: sms.mode,
    }),
  };
}
