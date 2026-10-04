/**
 * SMS-04 / SMS-06 / SMS-07 / SMS-09: public approval HTML from the snapshot.
 * Lookup treats a past expires_at as expired even before the pg-boss job runs.
 * A second tap, or the opposite tap, does not flip approved/declined.
 */

import type { CustomerLineItemPayload, CustomerQuotePayload } from "./customer-payload.js";
import { hashApprovalToken, isApprovalTokenShape } from "./approval-token.js";
import type { SnapshotQueryFn } from "./quote-snapshot.js";

export const APPROVAL_NOT_FOUND_MESSAGE = "This quote could not be found.";
export const APPROVAL_EXPIRED_MESSAGE = "This quote has expired";

export const SELECT_APPROVAL_SQL = `SELECT
    t.expires_at,
    t.quote_id,
    s.payload,
    s.contractor_display_name,
    s.contractor_trade,
    q.status,
    q.approved_at,
    q.declined_at
  FROM quote_approval_tokens t
  JOIN quote_snapshots s ON s.id = t.snapshot_id
  JOIN quotes q ON q.id = t.quote_id
  WHERE t.token_hash = $1`;

export const SELECT_APPROVAL_FOR_UPDATE_SQL = `${SELECT_APPROVAL_SQL}
  FOR UPDATE OF q`;

/** First approval only. status = 'sent' so a decided quote cannot flip. */
export const MARK_QUOTE_APPROVED_SQL = `UPDATE quotes
  SET status = 'approved',
      approved_at = COALESCE(approved_at, $2)
  WHERE id = $1
    AND status = 'sent'
  RETURNING approved_at`;

/** First decline only. status = 'sent' so a decided quote cannot flip. */
export const MARK_QUOTE_DECLINED_SQL = `UPDATE quotes
  SET status = 'declined',
      declined_at = COALESCE(declined_at, $2)
  WHERE id = $1
    AND status = 'sent'
  RETURNING declined_at`;

export type ApprovalAction = "approve" | "decline";

export type ApprovalPageLine = {
  name: string;
  quantityLabel: string;
  unitPriceLabel: string;
  amountLabel: string;
  roomName: string | null;
};

export type ApprovalPageModel = {
  contractorName: string | null;
  trade: string | null;
  clientSentence: string | null;
  lines: ApprovalPageLine[];
  totalLabel: string;
  token: string;
};

export type ApprovalView =
  | { kind: "not_found" }
  | { kind: "expired" }
  | { kind: "open"; page: ApprovalPageModel }
  | { kind: "approved"; page: ApprovalPageModel; decidedAt: string | null }
  | { kind: "declined"; page: ApprovalPageModel; decidedAt: string | null };

export type ApprovalHttpResult = {
  status: number;
  html: string;
};

type ApprovalRow = {
  expires_at: Date | string;
  quote_id: string;
  payload: unknown;
  contractor_display_name: string | null;
  contractor_trade: string | null;
  status: string;
  approved_at: Date | string | null;
  declined_at: Date | string | null;
};

const TRADE_LABELS: Record<string, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  hvac: "HVAC",
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Blank / unknown prices stay blank — never $0.00 on a line. */
export function formatApprovalLineMoney(cents: number | null | undefined): string {
  if (cents == null || cents === 0) {
    return "";
  }
  return formatApprovalDollars(cents);
}

export function formatApprovalDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatApprovalTrade(trade: string | null | undefined): string | null {
  if (trade == null) {
    return null;
  }
  const trimmed = trade.trim();
  if (trimmed === "") {
    return null;
  }
  const mapped = TRADE_LABELS[trimmed.toLowerCase()];
  if (mapped) {
    return mapped;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function formatApprovalDisplayName(
  displayName: string | null | undefined,
): string | null {
  if (displayName == null) {
    return null;
  }
  const trimmed = displayName.trim();
  return trimmed === "" ? null : trimmed;
}

export function formatDecisionTimestamp(value: Date): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const hh = String(value.getUTCHours()).padStart(2, "0");
  const mm = String(value.getUTCMinutes()).padStart(2, "0");
  return `${value.getUTCDate()} ${months[value.getUTCMonth()]} ${value.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

function quantityLabel(quantity: number, unit: string | null): string {
  return unit ? `${quantity} ${unit}` : String(quantity);
}

export function parseSnapshotPayload(value: unknown): CustomerQuotePayload | null {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.lineItems)) {
    return null;
  }
  if (typeof obj.totalCents !== "number" || !Number.isInteger(obj.totalCents) || obj.totalCents < 0) {
    return null;
  }
  const lineItems: CustomerLineItemPayload[] = [];
  for (const entry of obj.lineItems) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return null;
    }
    const line = entry as Record<string, unknown>;
    if (typeof line.name !== "string" || typeof line.quantity !== "number") {
      return null;
    }
    let unitPriceCents: number | null;
    if (line.unitPriceCents === null) {
      unitPriceCents = null;
    } else if (typeof line.unitPriceCents === "number") {
      unitPriceCents = line.unitPriceCents;
    } else {
      return null;
    }
    lineItems.push({
      name: line.name,
      quantity: line.quantity,
      unitPriceCents,
      unit: typeof line.unit === "string" ? line.unit : null,
      roomName: typeof line.roomName === "string" && line.roomName.trim() !== ""
        ? line.roomName
        : null,
    });
  }
  return {
    customerPhone: typeof obj.customerPhone === "string" ? obj.customerPhone : null,
    totalCents: obj.totalCents,
    clientSentence: typeof obj.clientSentence === "string" && obj.clientSentence.trim() !== ""
      ? obj.clientSentence
      : null,
    lineItems,
  };
}

export function approvalPageModel(args: {
  payload: CustomerQuotePayload;
  contractorDisplayName: string | null;
  contractorTrade: string | null;
  token: string;
}): ApprovalPageModel {
  return {
    contractorName: formatApprovalDisplayName(args.contractorDisplayName),
    trade: formatApprovalTrade(args.contractorTrade),
    clientSentence: args.payload.clientSentence,
    lines: args.payload.lineItems.map((item) => ({
      name: item.name,
      quantityLabel: quantityLabel(item.quantity, item.unit),
      unitPriceLabel: formatApprovalLineMoney(item.unitPriceCents),
      amountLabel: formatApprovalLineMoney(
        item.unitPriceCents == null || item.unitPriceCents === 0
          ? null
          : item.unitPriceCents * item.quantity,
      ),
      roomName: item.roomName,
    })),
    totalLabel: formatApprovalDollars(args.payload.totalCents),
    token: args.token,
  };
}

function asDate(value: Date | string | null): Date | null {
  if (value == null) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Approved and declined stay visible after the TTL. A still-sent quote whose
 * token is past expires_at is expired even when status has not been updated.
 */
export function classifyApprovalRow(
  row: ApprovalRow,
  now: Date,
  token: string,
): ApprovalView {
  const payload = parseSnapshotPayload(row.payload);
  const expiresAt = asDate(row.expires_at);
  if (!payload || !expiresAt) {
    return { kind: "not_found" };
  }
  const page = approvalPageModel({
    payload,
    contractorDisplayName: row.contractor_display_name,
    contractorTrade: row.contractor_trade,
    token,
  });
  if (row.status === "approved") {
    const decided = asDate(row.approved_at);
    return {
      kind: "approved",
      page,
      decidedAt: decided ? formatDecisionTimestamp(decided) : null,
    };
  }
  if (row.status === "declined") {
    const decided = asDate(row.declined_at);
    return {
      kind: "declined",
      page,
      decidedAt: decided ? formatDecisionTimestamp(decided) : null,
    };
  }
  if (row.status === "expired" || expiresAt.getTime() <= now.getTime()) {
    return { kind: "expired" };
  }
  if (row.status === "sent") {
    return { kind: "open", page };
  }
  return { kind: "not_found" };
}

const PAGE_STYLE = `body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#111;margin:0 auto;padding:20px 16px 48px;max-width:640px;line-height:1.4}
h1{font-size:1.5rem;margin:0 0 4px}
.trade{color:#555;margin:0 0 16px}
.assumptions{margin:0 0 20px}
.assumptions h2{font-size:.8rem;letter-spacing:.02em;text-transform:uppercase;color:#555;margin:0 0 6px}
.sentence{white-space:pre-wrap;margin:0}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:10px 4px;border-bottom:1px solid #ddd;vertical-align:top}
th.num,td.num{text-align:right;white-space:nowrap}
tr.room td{background:#f6f6f6;font-weight:700}
.total{display:flex;justify-content:space-between;font-size:1.25rem;font-weight:700;margin:16px 0 24px}
.actions{display:flex;flex-direction:column;gap:12px}
button{appearance:none;width:100%;min-height:48px;font-size:1.05rem;border-radius:10px;font-weight:700}
.approve{background:#146c43;color:#fff;border:0}
.decline{background:#fff;color:#111;border:1px solid #111}
.decision{font-size:1.1rem;font-weight:700;margin:0 0 16px}
.neutral{font-size:1.15rem;margin:24px 0}`;

function htmlDocument(title: string, main: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
${main}
</body>
</html>
`;
}

export function renderNotFoundPage(): string {
  return htmlDocument(
    "Quote",
    `<p class="neutral">${escapeHtml(APPROVAL_NOT_FOUND_MESSAGE)}</p>`,
  );
}

export function renderExpiredPage(): string {
  return htmlDocument(
    "Quote",
    `<p class="neutral">${escapeHtml(APPROVAL_EXPIRED_MESSAGE)}</p>`,
  );
}

function groupApprovalLines(
  lines: ApprovalPageLine[],
): Array<{ heading: string | null; lines: ApprovalPageLine[] }> {
  const hasRoom = lines.some((line) => line.roomName);
  if (!hasRoom) {
    return [{ heading: null, lines }];
  }
  const order: string[] = [];
  const buckets = new Map<string, ApprovalPageLine[]>();
  const ungrouped: ApprovalPageLine[] = [];
  for (const line of lines) {
    if (!line.roomName) {
      ungrouped.push(line);
      continue;
    }
    const existing = buckets.get(line.roomName);
    if (existing) {
      existing.push(line);
    } else {
      order.push(line.roomName);
      buckets.set(line.roomName, [line]);
    }
  }
  const sections = order.map((roomName) => ({
    heading: roomName,
    lines: buckets.get(roomName) ?? [],
  }));
  if (ungrouped.length > 0) {
    sections.push({ heading: "Job", lines: ungrouped });
  }
  return sections;
}

function renderLineRow(line: ApprovalPageLine): string {
  return `<tr>
<td>${escapeHtml(line.name)}</td>
<td class="num">${escapeHtml(line.quantityLabel)}</td>
<td class="num">${escapeHtml(line.unitPriceLabel)}</td>
<td class="num">${escapeHtml(line.amountLabel)}</td>
</tr>`;
}

function renderQuoteBody(page: ApprovalPageModel, decisionHtml: string, actionsHtml: string): string {
  const title = page.contractorName ?? "Quote";
  const trade = page.trade ? `<p class="trade">${escapeHtml(page.trade)}</p>` : "";
  const sentence = page.clientSentence
    ? `<section class="assumptions"><h2>Assumptions</h2><p class="sentence">${escapeHtml(page.clientSentence)}</p></section>`
    : "";
  const rows = groupApprovalLines(page.lines).map((section) => {
    const heading = section.heading
      ? `<tr class="room"><td colspan="4">${escapeHtml(section.heading)}</td></tr>`
      : "";
    return heading + section.lines.map(renderLineRow).join("");
  }).join("");
  return htmlDocument(
    title,
    `<h1>${escapeHtml(title)}</h1>
${trade}
${decisionHtml}
${sentence}
<table>
<thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<p class="total"><span>Total</span><span>${escapeHtml(page.totalLabel)}</span></p>
${actionsHtml}`,
  );
}

function actionForms(token: string): string {
  const encoded = escapeHtml(encodeURIComponent(token));
  return `<div class="actions">
<form method="post" action="/q/${encoded}/approve"><button class="approve" type="submit">Approve</button></form>
<form method="post" action="/q/${encoded}/decline"><button class="decline" type="submit">Decline</button></form>
</div>`;
}

export function renderApprovalView(view: ApprovalView): ApprovalHttpResult {
  if (view.kind === "not_found") {
    return { status: 404, html: renderNotFoundPage() };
  }
  if (view.kind === "expired") {
    return { status: 200, html: renderExpiredPage() };
  }
  if (view.kind === "approved") {
    const when = view.decidedAt ? ` ${view.decidedAt}` : "";
    return {
      status: 200,
      html: renderQuoteBody(
        view.page,
        `<p class="decision">${escapeHtml(`You approved this quote.${when}`)}</p>`,
        "",
      ),
    };
  }
  if (view.kind === "declined") {
    const when = view.decidedAt ? ` ${view.decidedAt}` : "";
    return {
      status: 200,
      html: renderQuoteBody(
        view.page,
        `<p class="decision">${escapeHtml(`You declined this quote.${when}`)}</p>`,
        "",
      ),
    };
  }
  return {
    status: 200,
    html: renderQuoteBody(view.page, "", actionForms(view.page.token)),
  };
}

async function loadApprovalRow(
  queryFn: SnapshotQueryFn,
  tokenHash: string,
  forUpdate: boolean,
): Promise<ApprovalRow | null> {
  const sql = forUpdate ? SELECT_APPROVAL_FOR_UPDATE_SQL : SELECT_APPROVAL_SQL;
  const result = await queryFn(sql, [tokenHash]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0] as ApprovalRow;
}

export async function viewApproval(
  queryFn: SnapshotQueryFn,
  token: string,
  now: Date,
): Promise<ApprovalView> {
  if (!isApprovalTokenShape(token)) {
    return { kind: "not_found" };
  }
  const row = await loadApprovalRow(queryFn, hashApprovalToken(token), false);
  if (!row) {
    return { kind: "not_found" };
  }
  return classifyApprovalRow(row, now, token);
}

/**
 * One-tap approve or decline. Decided quotes stay decided. Expired quotes
 * are not approved. The snapshot row is never updated.
 */
export async function decideApproval(
  queryFn: SnapshotQueryFn,
  token: string,
  action: ApprovalAction,
  now: Date,
): Promise<ApprovalView> {
  if (!isApprovalTokenShape(token)) {
    return { kind: "not_found" };
  }
  const tokenHash = hashApprovalToken(token);
  const row = await loadApprovalRow(queryFn, tokenHash, true);
  if (!row) {
    return { kind: "not_found" };
  }
  const current = classifyApprovalRow(row, now, token);
  if (current.kind !== "open") {
    return current;
  }
  const sql = action === "approve" ? MARK_QUOTE_APPROVED_SQL : MARK_QUOTE_DECLINED_SQL;
  const updated = await queryFn(sql, [row.quote_id, now]);
  if (updated.rows.length === 0) {
    const again = await loadApprovalRow(queryFn, tokenHash, false);
    if (!again) {
      return { kind: "not_found" };
    }
    return classifyApprovalRow(again, now, token);
  }
  const decidedAt = asDate(
    (updated.rows[0] as { approved_at?: Date | string | null; declined_at?: Date | string | null })[
      action === "approve" ? "approved_at" : "declined_at"
    ] ?? null,
  );
  if (action === "approve") {
    return {
      kind: "approved",
      page: current.page,
      decidedAt: decidedAt ? formatDecisionTimestamp(decidedAt) : null,
    };
  }
  return {
    kind: "declined",
    page: current.page,
    decidedAt: decidedAt ? formatDecisionTimestamp(decidedAt) : null,
  };
}

export async function approvalHttpResult(args: {
  token: string;
  action?: ApprovalAction;
  queryFn: SnapshotQueryFn;
  now: Date;
}): Promise<ApprovalHttpResult> {
  const view = args.action
    ? await decideApproval(args.queryFn, args.token, args.action, args.now)
    : await viewApproval(args.queryFn, args.token, args.now);
  return renderApprovalView(view);
}
