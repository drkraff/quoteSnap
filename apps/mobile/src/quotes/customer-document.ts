/**
 * Maps a customer allowlist payload to a shareable HTML/text quote.
 * Never invents prices. Private notes, alts, photos, and contractor-only
 * fields must already be stripped by toCustomerQuotePayload.
 */

import type { CustomerLineItemPayload, CustomerQuotePayload } from './customer-payload';
import { UNGROUPED_ROOM_LABEL } from './rooms';
import { formatQuantityLabel } from '../utils/line-items';

export type CustomerDocumentBrand = {
  displayName?: string | null;
  trade?: string | null;
};

export type CustomerDocumentLine = {
  name: string;
  quantityLabel: string;
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
  sections: CustomerDocumentSection[];
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

export const CUSTOMER_QUOTE_FILENAME_PDF = 'QuoteSnap-quote.pdf';
export const CUSTOMER_QUOTE_FILENAME_HTML = 'QuoteSnap-quote.html';

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

/** Blank / unknown prices stay blank — never $0.00 on a line. */
export function formatCustomerLineMoney(cents: number | null | undefined): string {
  if (cents == null || cents === 0) {
    return '';
  }
  return formatDollarAmount(cents);
}

export function formatDollarAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function groupCustomerLines(
  items: CustomerLineItemPayload[],
): CustomerDocumentSection[] {
  const hasRoom = items.some((item) => item.roomName != null && item.roomName !== '');
  if (!hasRoom) {
    return [
      {
        roomName: null,
        heading: null,
        lines: items.map(toDocumentLine),
      },
    ];
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
    lines: (buckets.get(roomName) ?? []).map(toDocumentLine),
  }));
  if (ungrouped.length > 0) {
    sections.push({
      roomName: null,
      heading: UNGROUPED_ROOM_LABEL,
      lines: ungrouped.map(toDocumentLine),
    });
  }
  return sections;
}

function toDocumentLine(item: CustomerLineItemPayload): CustomerDocumentLine {
  return {
    name: item.name,
    quantityLabel: formatQuantityLabel(item.quantity, item.unit),
    unitPriceLabel: formatCustomerLineMoney(item.unitPriceCents),
    amountLabel: formatCustomerLineMoney(
      item.unitPriceCents == null || item.unitPriceCents === 0
        ? null
        : item.unitPriceCents * item.quantity,
    ),
  };
}

export function customerQuoteToDocument(
  payload: CustomerQuotePayload,
  brand: CustomerDocumentBrand = {},
): CustomerDocument {
  const contractorName = formatCustomerDisplayName(brand.displayName);
  const trade = formatCustomerTrade(brand.trade);
  const clientSentence = payload.clientSentence?.trim()
    ? payload.clientSentence.trim()
    : null;
  const sections = groupCustomerLines(payload.lineItems);
  const totalLabel = formatDollarAmount(payload.totalCents);
  const filename = CUSTOMER_QUOTE_FILENAME_PDF;
  const html = renderCustomerQuoteHtml({
    contractorName,
    trade,
    clientSentence,
    sections,
    totalLabel,
  });
  const text = renderCustomerQuoteText({
    contractorName,
    trade,
    clientSentence,
    sections,
    totalLabel,
  });
  return {
    contractorName,
    trade,
    clientSentence,
    sections,
    totalLabel,
    html,
    text,
    filename,
  };
}

function renderCustomerQuoteText(doc: {
  contractorName: string | null;
  trade: string | null;
  clientSentence: string | null;
  sections: CustomerDocumentSection[];
  totalLabel: string;
}): string {
  const lines: string[] = [];
  lines.push(doc.contractorName ?? 'Quote');
  if (doc.trade) {
    lines.push(doc.trade);
  }
  lines.push('');
  if (doc.clientSentence) {
    lines.push(doc.clientSentence);
    lines.push('');
  }
  for (const section of doc.sections) {
    if (section.heading) {
      lines.push(section.heading);
    }
    for (const line of section.lines) {
      const cols = [line.name, line.quantityLabel, line.unitPriceLabel, line.amountLabel]
        .filter((part) => part !== '')
        .join('  ');
      lines.push(cols);
    }
    lines.push('');
  }
  lines.push(`Total  ${doc.totalLabel}`);
  return lines.join('\n').trimEnd() + '\n';
}

function renderCustomerQuoteHtml(doc: {
  contractorName: string | null;
  trade: string | null;
  clientSentence: string | null;
  sections: CustomerDocumentSection[];
  totalLabel: string;
}): string {
  const title = escapeHtml(doc.contractorName ?? 'Quote');
  const trade = doc.trade ? `<p class="trade">${escapeHtml(doc.trade)}</p>` : '';
  const sentence = doc.clientSentence
    ? `<p class="sentence">${escapeHtml(doc.clientSentence)}</p>`
    : '';
  const bodyRows = doc.sections
    .map((section) => {
      const heading = section.heading
        ? `<tr class="room"><td colspan="4">${escapeHtml(section.heading)}</td></tr>`
        : '';
      const itemRows = section.lines
        .map((line) => {
          return `<tr>
  <td>${escapeHtml(line.name)}</td>
  <td class="num">${escapeHtml(line.quantityLabel)}</td>
  <td class="num">${escapeHtml(line.unitPriceLabel)}</td>
  <td class="num">${escapeHtml(line.amountLabel)}</td>
</tr>`;
        })
        .join('\n');
      return `${heading}\n${itemRows}`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .trade { color: #666; margin: 0 0 16px; font-size: 14px; }
  .sentence { white-space: pre-wrap; font-size: 16px; margin: 0 0 20px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 4px; border-bottom: 1px solid #ccc; vertical-align: top; }
  th.num, td.num { text-align: right; white-space: nowrap; }
  tr.room td { background: #f5f5f5; font-weight: 700; border-bottom: 1px solid #ccc; }
  .total { font-size: 18px; font-weight: 700; margin-top: 16px; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <h1>${title}</h1>
  ${trade}
  ${sentence}
  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th class="num">Qty</th>
        <th class="num">Price</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
${bodyRows}
    </tbody>
  </table>
  <p class="total"><span>Total</span><span>${escapeHtml(doc.totalLabel)}</span></p>
</body>
</html>
`;
}
