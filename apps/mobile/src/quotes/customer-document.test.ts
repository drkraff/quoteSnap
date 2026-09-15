import {
  customerQuoteToDocument,
  escapeHtml,
  formatCustomerDisplayName,
  formatCustomerLineMoney,
  formatCustomerTrade,
  groupCustomerLines,
} from './customer-document';
import {
  customerPayloadHasPrivateNoteKey,
  toCustomerQuotePayload,
} from './customer-payload';

const SECRET_JOB = 'subcontractor check — do not tell the client';
const SECRET_LINE = 'moisture from neighbor pipe';
const SECRET_ROOM = "don't tell the client about the neighbor pipe";
const SECRET_PHOTO = 'file:///docs/photos/secret.jpg';

describe('customerQuoteToDocument', () => {
  it('includes client sentence and contractor name/trade', () => {
    const payload = toCustomerQuotePayload({
      customerPhone: '+15555550100',
      totalCents: 75000,
      clientSentence: 'Appliances and decorative lighting not included.',
      lineItems: [
        {
          name: 'Replace outlet',
          quantity: 3,
          unitPriceCents: 25000,
          unit: 'each',
        },
      ],
    });
    const doc = customerQuoteToDocument(payload, {
      displayName: 'Ada',
      trade: 'plumbing',
    });
    expect(doc.contractorName).toBe('Ada');
    expect(doc.trade).toBe('Plumbing');
    expect(doc.clientSentence).toBe('Appliances and decorative lighting not included.');
    expect(doc.html).toContain('Ada');
    expect(doc.html).toContain('Plumbing');
    expect(doc.html).toContain('Appliances and decorative lighting not included.');
    expect(doc.text).toContain('Ada');
    expect(doc.text).toContain('Plumbing');
    expect(doc.text).toContain('Appliances and decorative lighting not included.');
    expect(doc.filename).toBe('QuoteSnap-quote.pdf');
  });

  it('never copies private notes, leftover notes, photos, or alts into html/text', () => {
    const source = {
      customerPhone: '+15555550100',
      totalCents: 180000,
      clientSentence: 'Appliances not included.',
      privateNote: SECRET_JOB,
      notes: 'leftover drafts.notes must not leak either',
      rooms: [
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          name: 'Kitchen',
          privateNote: SECRET_ROOM,
        },
      ],
      photos: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          localUri: SECRET_PHOTO,
          r2Key: 'photos/contractor/secret.jpg',
        },
      ],
      lineItems: [
        {
          name: 'Walk-in shower',
          quantity: 1,
          unitPriceCents: 180000,
          unit: 'job',
          privateNote: SECRET_LINE,
          priceSource: 'spoken' as const,
          optionGroupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          optionRole: 'base' as const,
          roomId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        },
        {
          name: 'Keep the tub',
          quantity: 1,
          unitPriceCents: 45000,
          unit: 'job',
          optionGroupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          optionRole: 'alt' as const,
        },
      ],
    };
    const payload = toCustomerQuotePayload(source);
    expect(customerPayloadHasPrivateNoteKey(payload)).toBe(false);

    const doc = customerQuoteToDocument(payload, { displayName: 'Ada', trade: 'hvac' });
    const haystack = `${doc.html}\n${doc.text}`;
    expect(haystack).toContain('Appliances not included.');
    expect(haystack).toContain('Walk-in shower');
    expect(haystack).toContain('Kitchen');
    expect(haystack).toContain('$1800.00');
    expect(haystack).not.toContain(SECRET_JOB);
    expect(haystack).not.toContain(SECRET_LINE);
    expect(haystack).not.toContain(SECRET_ROOM);
    expect(haystack).not.toContain(SECRET_PHOTO);
    expect(haystack).not.toContain('privateNote');
    expect(haystack).not.toContain('private_note');
    expect(haystack).not.toContain('priceSource');
    expect(haystack).not.toContain('price_source');
    expect(haystack).not.toContain('Keep the tub');
    expect(haystack).not.toContain('$450.00');
    expect(haystack).not.toContain('$2250.00');
    expect(haystack).not.toContain('secret.jpg');
    expect(haystack).not.toContain('r2Key');
    expect(doc.totalLabel).toBe('$1800.00');
    expect(doc.sections.some((section) => section.heading === 'Kitchen')).toBe(true);
  });

  it('leaves unknown prices blank and does not invent a line amount', () => {
    const payload = toCustomerQuotePayload({
      customerPhone: null,
      totalCents: 0,
      privateNote: SECRET_JOB,
      lineItems: [
        {
          name: 'Laminate cabinets',
          quantity: 14,
          unitPriceCents: null,
          unit: 'foot',
          privateNote: SECRET_LINE,
        },
      ],
    });
    const doc = customerQuoteToDocument(payload);
    expect(doc.sections[0]!.lines[0]!.unitPriceLabel).toBe('');
    expect(doc.sections[0]!.lines[0]!.amountLabel).toBe('');
    expect(doc.totalLabel).toBe('$0.00');
    expect(doc.html).toContain('Laminate cabinets');
    expect(doc.html).not.toContain(SECRET_JOB);
    expect(doc.text).not.toContain('$185');
    const cabinetsHtml = doc.html.slice(
      doc.html.indexOf('Laminate cabinets'),
      doc.html.indexOf('Total'),
    );
    expect(cabinetsHtml).not.toContain('$0.00');
  });

  it('treats stored 0 cents as blank, not a zero-dollar price', () => {
    const payload = toCustomerQuotePayload({
      customerPhone: null,
      totalCents: 15000,
      lineItems: [
        { name: 'Labor', quantity: 2, unitPriceCents: 7500, unit: 'hour' },
        { name: 'Quartz countertop', quantity: 12, unitPriceCents: 0, unit: 'foot' },
      ],
    });
    const doc = customerQuoteToDocument(payload);
    const quartz = doc.sections[0]!.lines.find((line) => line.name === 'Quartz countertop');
    expect(quartz?.unitPriceLabel).toBe('');
    expect(quartz?.amountLabel).toBe('');
    expect(doc.totalLabel).toBe('$150.00');
    expect(doc.html).toContain('$75.00');
    expect(doc.html).toContain('$150.00');
  });

  it('groups ungrouped lines under Job when other rooms exist', () => {
    const payload = toCustomerQuotePayload({
      customerPhone: null,
      totalCents: 0,
      rooms: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Kitchen' }],
      lineItems: [
        {
          name: 'Cabinets',
          quantity: 14,
          unitPriceCents: null,
          unit: 'foot',
          roomId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        },
        {
          name: 'Permit',
          quantity: 1,
          unitPriceCents: null,
          unit: 'job',
        },
      ],
    });
    const doc = customerQuoteToDocument(payload);
    expect(doc.sections.map((section) => section.heading)).toEqual(['Kitchen', 'Job']);
    expect(doc.html).toContain('Kitchen');
    expect(doc.html).toContain('Job');
    expect(doc.html).toContain('Permit');
  });

  it('does not invent prices when a total is already selected-only', () => {
    const payload = toCustomerQuotePayload({
      customerPhone: null,
      totalCents: 25000,
      lineItems: [
        { name: 'Outlet', quantity: 1, unitPriceCents: 25000, unit: 'each' },
        { name: 'Mystery SKU', quantity: 1, unitPriceCents: null, unit: 'each' },
      ],
    });
    const doc = customerQuoteToDocument(payload);
    expect(doc.totalLabel).toBe('$250.00');
    const mystery = doc.sections[0]!.lines.find((line) => line.name === 'Mystery SKU');
    expect(mystery?.unitPriceLabel).toBe('');
    expect(mystery?.amountLabel).toBe('');
    expect(doc.html).toContain('Mystery SKU');
  });

  it('escapes html in names and the client sentence', () => {
    const payload = toCustomerQuotePayload({
      customerPhone: null,
      totalCents: 0,
      clientSentence: 'Do not include <script>alert(1)</script>',
      lineItems: [
        {
          name: 'Cabinets <b>cheap</b>',
          quantity: 1,
          unitPriceCents: null,
        },
      ],
    });
    const doc = customerQuoteToDocument(payload);
    expect(doc.html).toContain('Do not include &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(doc.html).toContain('Cabinets &lt;b&gt;cheap&lt;/b&gt;');
    expect(doc.html).not.toContain('<script>alert(1)</script>');
  });
});

describe('format helpers', () => {
  it('maps known trades and trims blank brand fields', () => {
    expect(formatCustomerTrade('hvac')).toBe('HVAC');
    expect(formatCustomerTrade(' electrical ')).toBe('Electrical');
    expect(formatCustomerTrade('')).toBeNull();
    expect(formatCustomerDisplayName('  Ada  ')).toBe('Ada');
    expect(formatCustomerDisplayName('   ')).toBeNull();
    expect(formatCustomerLineMoney(null)).toBe('');
    expect(formatCustomerLineMoney(0)).toBe('');
    expect(formatCustomerLineMoney(2500)).toBe('$25.00');
    expect(escapeHtml(`a&b<"'>`)).toBe('a&amp;b&lt;&quot;&#39;&gt;');
  });

  it('keeps a single ungrouped section when no room names are present', () => {
    const sections = groupCustomerLines([
      { name: 'Outlet', quantity: 1, unitPriceCents: 100, unit: 'each', roomName: null },
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading).toBeNull();
  });
});
