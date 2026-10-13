/**
 * Maps a customer allowlist payload to a shareable HTML/text quote.
 * The page stays light. Prices are the stored cents in the contractor's
 * currency — VAT is added on the document and is not a new line price.
 * Private notes, alts, and photos must already be stripped by
 * toCustomerQuotePayload. Line photos stay off this page: they are private
 * and the customer payload does not carry bytes or a public URL.
 */

import { customerUnitLabel } from '../catalog/units';
import {
  DEFAULT_CURRENCY,
  formatMoneyCents,
  taxLabelForCountry,
  type CurrencyCode,
} from '../money/currency';
import { quoteVatTotals } from '../money/vat';
import { normalizeClientSentence } from './client-sentence';
import type { CustomerLineItemPayload, CustomerQuotePayload } from './customer-payload';
import {
  addUtcDays,
  businessInitials,
  capitalizeItemName,
  DEFAULT_QUOTE_VALID_DAYS,
  formatQuoteDate,
  formatQuoteNumber,
  normalizeCustomerName,
  normalizeExclusions,
} from './customer-fields';
import { UNGROUPED_ROOM_LABEL } from './rooms';

/** Shown above the client sentence. Omitted when empty. */
export const CUSTOMER_NOTE_HEADING = 'Note';
/** Kept so older imports still point at the note heading. */
export const CUSTOMER_ASSUMPTIONS_HEADING = CUSTOMER_NOTE_HEADING;
export const CUSTOMER_EXCLUSIONS_HEADING = 'Not included';

export type CustomerDocumentBrand = {
  displayName?: string | null;
  trade?: string | null;
  phone?: string | null;
  email?: string | null;
  quoteId?: string | null;
  issuedAt?: Date | string | number | null;
  approvalUrl?: string | null;
  validDays?: number;
};

export type CustomerDocumentLine = {
  name: string;
  quantityLabel: string;
  unitLabel: string;
  unitPriceLabel: string;
  amountLabel: string;
};

export type CustomerDocumentSection = {
  roomName: string | null;
  heading: string | null;
  lines: CustomerDocumentLine[];
};

export type CustomerDocument = {
  contractorName: string | null;
  trade: string | null;
  clientSentence: string | null;
  exclusions: string | null;
  sections: CustomerDocumentSection[];
  subtotalLabel: string;
  vatLabel: string;
  totalLabel: string;
  html: string;
  text: string;
  filename: string;
};

const TRADE_LABELS: Record<string, string> = {
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  hvac: 'HVAC',
};

export const CUSTOMER_QUOTE_FILENAME_PDF = 'Vela-quote.pdf';
export const CUSTOMER_QUOTE_FILENAME_HTML = 'Vela-quote.html';

export function formatCustomerTrade(trade: string | null | undefined): string | null {
  if (trade == null) return null;
  const trimmed = trade.trim();
  if (trimmed === '') return null;
  const mapped = TRADE_LABELS[trimmed.toLowerCase()];
  if (mapped) return mapped;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function formatCustomerDisplayName(
  displayName: string | null | undefined,
): string | null {
  if (displayName == null) return null;
  const trimmed = displayName.trim();
  return trimmed === '' ? null : trimmed;
}

/** Blank / unknown prices stay blank — never ₪0.00 on a line. */
export function formatCustomerLineMoney(
  cents: number | null | undefined,
  currency: CurrencyCode = DEFAULT_CURRENCY,
): string {
  if (cents == null || cents === 0) {
    return '';
  }
  return formatMoneyCents(cents, currency);
}

/** @deprecated Use formatMoneyCents. Kept for stats imports; default is ILS. */
export function formatDollarAmount(cents: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  return formatMoneyCents(cents, currency);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function quantityNumber(quantity: number): string {
  if (Number.isInteger(quantity)) return String(quantity);
  return String(Math.round(quantity * 100) / 100);
}

function unitLabel(unit: string | null | undefined): string {
  return customerUnitLabel(unit);
}

export function groupCustomerLines(
  items: CustomerLineItemPayload[],
  currency: CurrencyCode = DEFAULT_CURRENCY,
): CustomerDocumentSection[] {
  const mapLine = (item: CustomerLineItemPayload) => toDocumentLine(item, currency);
  const hasRoom = items.some((item) => item.roomName != null && item.roomName !== '');
  if (!hasRoom) {
    return [{ roomName: null, heading: null, lines: items.map(mapLine) }];
  }

  const order: string[] = [];
  const buckets = new Map<string, CustomerLineItemPayload[]>();
  const ungrouped: CustomerLineItemPayload[] = [];

  for (const item of items) {
    const room = item.roomName?.trim() ? item.roomName.trim() : null;
    if (!room) {
      ungrouped.push(item);
      continue;
    }
    if (!buckets.has(room)) {
      order.push(room);
      buckets.set(room, []);
    }
    buckets.get(room)!.push(item);
  }

  const sections: CustomerDocumentSection[] = order.map((roomName) => ({
    roomName,
    heading: roomName,
    lines: (buckets.get(roomName) ?? []).map(mapLine),
  }));
  if (ungrouped.length > 0) {
    sections.push({
      roomName: null,
      heading: UNGROUPED_ROOM_LABEL,
      lines: ungrouped.map(mapLine),
    });
  }
  return sections;
}

function toDocumentLine(
  item: CustomerLineItemPayload,
  currency: CurrencyCode,
): CustomerDocumentLine {
  const blank = item.unitPriceCents == null || item.unitPriceCents === 0;
  return {
    name: capitalizeItemName(item.name),
    quantityLabel: quantityNumber(item.quantity),
    unitLabel: unitLabel(item.unit),
    unitPriceLabel: formatCustomerLineMoney(item.unitPriceCents, currency),
    amountLabel: formatCustomerLineMoney(
      blank ? null : item.unitPriceCents! * item.quantity,
      currency,
    ),
  };
}

function asIssuedDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function customerQuoteToDocument(
  payload: CustomerQuotePayload,
  brand: CustomerDocumentBrand = {},
): CustomerDocument {
  const contractorName = formatCustomerDisplayName(brand.displayName);
  const trade = formatCustomerTrade(brand.trade);
  const clientSentence = normalizeClientSentence(payload.clientSentence);
  const exclusions = normalizeExclusions(payload.exclusions);
  const currency = payload.currencyCode ?? DEFAULT_CURRENCY;
  const vatPercent = payload.vatPercent ?? 18;
  const taxLabel = taxLabelForCountry(payload.countryCode);
  const sections = groupCustomerLines(payload.lineItems, currency);
  const totals = quoteVatTotals(payload.totalCents, vatPercent);
  const subtotalLabel = formatMoneyCents(payload.totalCents, currency);
  const vatLabel = totals
    ? formatMoneyCents(totals.vatCents, currency)
    : '';
  const totalLabel = totals
    ? formatMoneyCents(totals.totalCents, currency)
    : subtotalLabel;
  const issued = asIssuedDate(brand.issuedAt);
  const validDays = brand.validDays ?? DEFAULT_QUOTE_VALID_DAYS;
  const validUntil = issued ? addUtcDays(issued, validDays) : null;
  const filename = CUSTOMER_QUOTE_FILENAME_PDF;
  const view = {
    contractorName,
    trade,
    phone: formatCustomerDisplayName(brand.phone),
    email: formatCustomerDisplayName(brand.email),
    initials: businessInitials(contractorName),
    quoteNumber: formatQuoteNumber(brand.quoteId),
    issuedLabel: issued ? formatQuoteDate(issued) : null,
    validLabel: validUntil ? formatQuoteDate(validUntil) : null,
    customerName: normalizeCustomerName(payload.customerName),
    customerPhone: formatCustomerDisplayName(payload.customerPhone),
    clientSentence,
    exclusions,
    sections,
    subtotalLabel,
    vatPercent,
    taxLabel,
    vatLabel,
    totalLabel,
    approvalUrl: formatCustomerDisplayName(brand.approvalUrl),
  };
  return {
    contractorName,
    trade,
    clientSentence,
    exclusions,
    sections,
    subtotalLabel,
    vatLabel,
    totalLabel,
    html: renderCustomerQuoteHtml(view),
    text: renderCustomerQuoteText(view),
    filename,
  };
}

type DocumentView = {
  contractorName: string | null;
  trade: string | null;
  phone: string | null;
  email: string | null;
  initials: string | null;
  quoteNumber: string | null;
  issuedLabel: string | null;
  validLabel: string | null;
  customerName: string | null;
  customerPhone: string | null;
  clientSentence: string | null;
  exclusions: string | null;
  sections: CustomerDocumentSection[];
  subtotalLabel: string;
  vatPercent: number;
  taxLabel: string;
  vatLabel: string;
  totalLabel: string;
  approvalUrl: string | null;
};

function renderCustomerQuoteText(doc: DocumentView): string {
  const lines: string[] = [];
  lines.push(doc.contractorName ?? 'Quote');
  if (doc.trade) lines.push(doc.trade);
  const contact = [doc.phone, doc.email].filter((part): part is string => part != null);
  if (contact.length > 0) lines.push(contact.join('  '));
  if (doc.quoteNumber) lines.push(doc.quoteNumber);
  if (doc.issuedLabel) lines.push(`Date  ${doc.issuedLabel}`);
  if (doc.validLabel) lines.push(`Valid until  ${doc.validLabel}`);
  if (doc.customerName) lines.push(doc.customerName);
  if (doc.customerPhone) lines.push(doc.customerPhone);
  lines.push('');
  if (doc.clientSentence) {
    lines.push(CUSTOMER_NOTE_HEADING);
    lines.push(doc.clientSentence);
    lines.push('');
  }
  for (const section of doc.sections) {
    if (section.heading) lines.push(section.heading);
    for (const line of section.lines) {
      const cols = [
        line.name,
        line.quantityLabel,
        line.unitLabel,
        line.unitPriceLabel,
        line.amountLabel,
      ].filter((part) => part !== '');
      lines.push(cols.join('  '));
    }
    lines.push('');
  }
  lines.push(`Subtotal  ${doc.subtotalLabel}`);
  if (doc.vatLabel !== '') {
    lines.push(`${doc.taxLabel} ${doc.vatPercent}%  ${doc.vatLabel}`);
  }
  lines.push(`Total  ${doc.totalLabel}`);
  if (doc.exclusions) {
    lines.push('');
    lines.push(CUSTOMER_EXCLUSIONS_HEADING);
    lines.push(doc.exclusions);
  }
  if (doc.approvalUrl) {
    lines.push('');
    lines.push(`Accept this quote: ${doc.approvalUrl}`);
  }
  return lines.join('\n').trimEnd() + '\n';
}

function renderCustomerQuoteHtml(doc: DocumentView): string {
  const title = escapeHtml(doc.contractorName ?? 'Quote');
  const initials = doc.initials
    ? `<div class="mark">${escapeHtml(doc.initials)}</div>`
    : '';
  const trade = doc.trade ? `<p class="trade">${escapeHtml(doc.trade)}</p>` : '';
  const contactParts = [doc.phone, doc.email].filter((part): part is string => part != null);
  const contact = contactParts.length > 0
    ? `<p class="contact">${contactParts.map((part) => escapeHtml(part)).join(' · ')}</p>`
    : '';
  const metaRows = [
    doc.quoteNumber ? metaRow('Quote', doc.quoteNumber) : '',
    doc.issuedLabel ? metaRow('Date', doc.issuedLabel) : '',
    doc.validLabel ? metaRow('Valid until', doc.validLabel) : '',
  ].join('');
  const meta = metaRows ? `<table class="meta">${metaRows}</table>` : '';
  const customerBits = [doc.customerName, doc.customerPhone].filter((part): part is string => part != null);
  const customer = customerBits.length > 0
    ? `<section class="who"><p class="kicker">Prepared for</p>${customerBits
      .map((part) => `<p class="who-line">${escapeHtml(part)}</p>`)
      .join('')}</section>`
    : '';
  const note = doc.clientSentence
    ? `<section class="block"><h2>${escapeHtml(CUSTOMER_NOTE_HEADING)}</h2><p>${escapeHtml(doc.clientSentence)}</p></section>`
    : '';
  const excluded = doc.exclusions
    ? `<section class="block"><h2>${escapeHtml(CUSTOMER_EXCLUSIONS_HEADING)}</h2><p>${escapeHtml(doc.exclusions)}</p></section>`
    : '';
  const approval = doc.approvalUrl
    ? `<section class="accept"><h2>Acceptance</h2><p>Accept this quote:</p><p class="link">${escapeHtml(doc.approvalUrl)}</p></section>`
    : `<section class="accept"><h2>Acceptance</h2><p class="sign">Accepted by ______________________________ &nbsp; Date ____________</p></section>`;
  const bodyRows = doc.sections
    .map((section) => {
      const heading = section.heading
        ? `<tr class="room"><td colspan="5">${escapeHtml(section.heading)}</td></tr>`
        : '';
      const itemRows = section.lines
        .map((line) => `<tr>
  <td>${escapeHtml(line.name)}</td>
  <td class="num">${escapeHtml(line.quantityLabel)}</td>
  <td class="num">${escapeHtml(line.unitLabel)}</td>
  <td class="num">${escapeHtml(line.unitPriceLabel)}</td>
  <td class="num">${escapeHtml(line.amountLabel)}</td>
</tr>`)
        .join('\n');
      return `${heading}\n${itemRows}`;
    })
    .join('\n');
  const vatRow = doc.vatLabel !== ''
    ? `<div class="money"><span>${escapeHtml(doc.taxLabel)} ${doc.vatPercent}%</span><span>${escapeHtml(doc.vatLabel)}</span></div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a1a1a; background: #fff; margin: 0; }
  .page { max-width: 720px; margin: 0 auto; padding: 28px 32px 40px; }
  .rule { height: 4px; background: #ff6b2c; margin: -28px -32px 24px; }
  .head { display: flex; gap: 14px; align-items: flex-start; }
  .mark { width: 44px; height: 44px; border-radius: 8px; background: #1a1a1a; color: #fff; font-weight: 700; font-size: 16px; display: flex; align-items: center; justify-content: center; letter-spacing: 0.04em; }
  h1 { font-size: 22px; font-weight: 700; margin: 0; letter-spacing: -0.01em; }
  .trade { color: #555; margin: 2px 0 0; font-size: 13px; }
  .contact { color: #333; margin: 8px 0 0; font-size: 13px; }
  .meta { margin: 18px 0 0; border-collapse: collapse; }
  .meta td { padding: 2px 16px 2px 0; font-size: 13px; vertical-align: baseline; }
  .meta .k { color: #777; width: 88px; }
  .who { margin: 18px 0 0; }
  .kicker { margin: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #777; }
  .who-line { margin: 2px 0 0; font-size: 15px; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 22px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #e6e6e6; vertical-align: top; font-size: 14px; }
  th { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #666; font-weight: 600; }
  th.num, td.num { text-align: right; white-space: nowrap; }
  tr.room td { background: #f7f7f7; font-weight: 700; font-size: 13px; }
  .totals { margin-top: 12px; margin-left: auto; width: 240px; }
  .money { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
  .grand { font-size: 18px; font-weight: 700; border-top: 2px solid #1a1a1a; margin-top: 6px; padding-top: 8px; }
  .block { margin-top: 22px; }
  .block h2, .accept h2 { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #777; margin: 0 0 6px; }
  .block p, .accept p { margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.45; }
  .accept { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e6e6e6; }
  .link { margin-top: 6px; word-break: break-all; color: #1a1a1a; }
  .sign { margin-top: 12px; color: #333; }
</style>
</head>
<body>
  <div class="page">
  <div class="rule"></div>
  <div class="head">
    ${initials}
    <div>
      <h1>${title}</h1>
      ${trade}
      ${contact}
    </div>
  </div>
  ${meta}
  ${customer}
  ${note}
  <table class="items">
    <thead>
      <tr>
        <th>Item</th>
        <th class="num">Qty</th>
        <th class="num">Unit</th>
        <th class="num">Unit price</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>
${bodyRows}
    </tbody>
  </table>
  <div class="totals">
    <div class="money"><span>Subtotal</span><span>${escapeHtml(doc.subtotalLabel)}</span></div>
    ${vatRow}
    <div class="money grand"><span>Total</span><span>${escapeHtml(doc.totalLabel)}</span></div>
  </div>
  ${excluded}
  ${approval}
  </div>
</body>
</html>
`;
}

function metaRow(label: string, value: string): string {
  return `<tr><td class="k">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`;
}
