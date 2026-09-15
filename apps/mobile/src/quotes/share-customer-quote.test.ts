import {
  SHARE_QUOTE_EMPTY,
  SHARE_QUOTE_FAILED,
  SHARE_QUOTE_UNAVAILABLE,
  shareCustomerQuote,
  type ShareCustomerQuoteDeps,
} from './share-customer-quote';

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));
jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  writeAsStringAsync: jest.fn(),
  copyAsync: jest.fn(),
}));

const SECRET_JOB = 'subcontractor check — do not tell the client';
const SECRET_LINE = 'moisture from neighbor pipe';

function fakeDeps(overrides: Partial<ShareCustomerQuoteDeps> = {}): ShareCustomerQuoteDeps {
  return {
    printToPdf: jest.fn(async () => ({ uri: 'file:///cache/print.pdf' })),
    sharingAvailable: jest.fn(async () => true),
    shareFile: jest.fn(async () => undefined),
    cacheDirectory: 'file:///cache/',
    writeTextFile: jest.fn(async () => undefined),
    copyFile: jest.fn(async () => undefined),
    ...overrides,
  };
}

const source = {
  customerPhone: '+15555550100',
  totalCents: 25000,
  clientSentence: 'Appliances not included.',
  privateNote: SECRET_JOB,
  lineItems: [
    {
      name: 'Replace outlet',
      quantity: 1,
      unitPriceCents: 25000,
      unit: 'each',
      privateNote: SECRET_LINE,
      priceSource: 'spoken' as const,
    },
    {
      name: 'Keep the tub',
      quantity: 1,
      unitPriceCents: 45000,
      unit: 'job',
      optionRole: 'alt',
    },
  ],
};

describe('shareCustomerQuote', () => {
  it('prints HTML that includes the client sentence and omits private notes and alts', async () => {
    const deps = fakeDeps();
    const result = await shareCustomerQuote(source, { displayName: 'Ada', trade: 'plumbing' }, deps);
    expect(result).toEqual({ ok: true, kind: 'pdf' });
    expect(deps.printToPdf).toHaveBeenCalledTimes(1);
    const html = (deps.printToPdf as jest.Mock).mock.calls[0]![0] as string;
    expect(html).toContain('Appliances not included.');
    expect(html).toContain('Replace outlet');
    expect(html).toContain('Ada');
    expect(html).toContain('Plumbing');
    expect(html).not.toContain(SECRET_JOB);
    expect(html).not.toContain(SECRET_LINE);
    expect(html).not.toContain('Keep the tub');
    expect(html).not.toContain('privateNote');
    expect(html).not.toContain('priceSource');
    expect(html).not.toContain('price_source');
    expect(deps.shareFile).toHaveBeenCalledWith(
      'file:///cache/QuoteSnap-quote.pdf',
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
  });

  it('returns empty when there are no customer-facing lines', async () => {
    const deps = fakeDeps();
    const result = await shareCustomerQuote(
      {
        customerPhone: null,
        totalCents: 0,
        privateNote: SECRET_JOB,
        lineItems: [
          {
            name: 'Keep the tub',
            quantity: 1,
            unitPriceCents: 45000,
            optionRole: 'alt',
          },
        ],
      },
      {},
      deps,
    );
    expect(result).toEqual({ ok: false, reason: 'empty', message: SHARE_QUOTE_EMPTY });
    expect(deps.printToPdf).not.toHaveBeenCalled();
  });

  it('falls back to a shareable HTML file when print-to-pdf fails', async () => {
    const deps = fakeDeps({
      printToPdf: jest.fn(async () => {
        throw new Error('no print');
      }),
    });
    const result = await shareCustomerQuote(source, {}, deps);
    expect(result).toEqual({ ok: true, kind: 'html' });
    expect(deps.writeTextFile).toHaveBeenCalled();
    const html = (deps.writeTextFile as jest.Mock).mock.calls[0]![1] as string;
    expect(html).toContain('Replace outlet');
    expect(html).not.toContain(SECRET_JOB);
    expect(deps.shareFile).toHaveBeenCalledWith(
      'file:///cache/QuoteSnap-quote.html',
      expect.objectContaining({ mimeType: 'text/html' }),
    );
  });

  it('returns unavailable when the OS share sheet is missing', async () => {
    const deps = fakeDeps({
      sharingAvailable: jest.fn(async () => false),
    });
    const result = await shareCustomerQuote(source, {}, deps);
    expect(result).toEqual({
      ok: false,
      reason: 'unavailable',
      message: SHARE_QUOTE_UNAVAILABLE,
    });
    expect(deps.printToPdf).not.toHaveBeenCalled();
  });

  it('returns failed when both pdf and html share paths error', async () => {
    const deps = fakeDeps({
      printToPdf: jest.fn(async () => {
        throw new Error('no print');
      }),
      writeTextFile: jest.fn(async () => {
        throw new Error('no file');
      }),
    });
    const result = await shareCustomerQuote(source, {}, deps);
    expect(result).toEqual({ ok: false, reason: 'failed', message: SHARE_QUOTE_FAILED });
  });
});
