import {
  SHARE_QUOTE_ALERT_CANCELLED,
  SHARE_QUOTE_ALERT_CANNOT,
  SHARE_QUOTE_ALERT_FAILED,
  SHARE_QUOTE_CANCELLED,
  SHARE_QUOTE_EMPTY,
  SHARE_QUOTE_FAILED,
  SHARE_QUOTE_UNAVAILABLE,
  alertForFailedShare,
  classifyShareError,
  hasCustomerFacingLines,
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
    expect(deps.shareFile).not.toHaveBeenCalled();
    if (result.ok) throw new Error('expected empty share to fail');
    expect(alertForFailedShare(result)).toEqual({
      title: SHARE_QUOTE_ALERT_CANNOT,
      message: SHARE_QUOTE_EMPTY,
    });
  });

  it('blocks a quote with no lines at all without crashing', async () => {
    const deps = fakeDeps();
    const result = await shareCustomerQuote(
      {
        customerPhone: null,
        totalCents: 0,
        privateNote: SECRET_JOB,
        lineItems: [],
      },
      {},
      deps,
    );
    expect(result).toEqual({ ok: false, reason: 'empty', message: SHARE_QUOTE_EMPTY });
    expect(deps.printToPdf).not.toHaveBeenCalled();
    expect(deps.shareFile).not.toHaveBeenCalled();
    expect(hasCustomerFacingLines([])).toBe(false);
    expect(hasCustomerFacingLines(undefined)).toBe(false);
    expect(hasCustomerFacingLines([{ optionRole: 'alt' }])).toBe(false);
    expect(hasCustomerFacingLines([{ optionRole: 'base' }])).toBe(true);
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
    if (result.ok) throw new Error('expected share to fail');
    expect(alertForFailedShare(result)).toEqual({
      title: SHARE_QUOTE_ALERT_FAILED,
      message: SHARE_QUOTE_FAILED,
    });
  });

  it('treats share-sheet cancel as cancelled and does not fall back to HTML', async () => {
    const deps = fakeDeps({
      shareFile: jest.fn(async () => {
        throw new Error('User did not share');
      }),
    });
    const result = await shareCustomerQuote(source, {}, deps);
    expect(result).toEqual({
      ok: false,
      reason: 'cancelled',
      message: SHARE_QUOTE_CANCELLED,
    });
    expect(deps.printToPdf).toHaveBeenCalledTimes(1);
    expect(deps.writeTextFile).not.toHaveBeenCalled();
    expect(deps.shareFile).toHaveBeenCalledTimes(1);
    if (result.ok) throw new Error('expected share to be cancelled');
    expect(alertForFailedShare(result)).toEqual({
      title: SHARE_QUOTE_ALERT_CANCELLED,
      message: SHARE_QUOTE_CANCELLED,
    });
  });

  it('treats share API failure as failed and does not fall back to HTML', async () => {
    const deps = fakeDeps({
      shareFile: jest.fn(async () => {
        throw new Error('Another share request is being processed now');
      }),
    });
    const result = await shareCustomerQuote(source, {}, deps);
    expect(result).toEqual({ ok: false, reason: 'failed', message: SHARE_QUOTE_FAILED });
    expect(deps.writeTextFile).not.toHaveBeenCalled();
    expect(deps.shareFile).toHaveBeenCalledTimes(1);
  });

  it('treats HTML-fallback share cancel as cancelled, not success', async () => {
    const deps = fakeDeps({
      printToPdf: jest.fn(async () => {
        throw new Error('no print');
      }),
      shareFile: jest.fn(async () => {
        throw new Error('User cancelled');
      }),
    });
    const result = await shareCustomerQuote(source, {}, deps);
    expect(result).toEqual({
      ok: false,
      reason: 'cancelled',
      message: SHARE_QUOTE_CANCELLED,
    });
    expect(deps.writeTextFile).toHaveBeenCalledTimes(1);
    const html = (deps.writeTextFile as jest.Mock).mock.calls[0]![1] as string;
    expect(html).not.toContain(SECRET_JOB);
    expect(html).not.toContain(SECRET_LINE);
  });

  it('does not crash when lineItems is missing', async () => {
    const deps = fakeDeps();
    const result = await shareCustomerQuote(
      { customerPhone: null, totalCents: 0, lineItems: undefined as never },
      {},
      deps,
    );
    expect(result).toEqual({ ok: false, reason: 'empty', message: SHARE_QUOTE_EMPTY });
    expect(deps.printToPdf).not.toHaveBeenCalled();
  });

  it('classifies cancel vs share-API errors', () => {
    expect(classifyShareError(new Error('User cancelled'))).toBe('cancelled');
    expect(classifyShareError(new Error('Share dismissed'))).toBe('cancelled');
    expect(classifyShareError(new Error('User did not share'))).toBe('cancelled');
    expect(classifyShareError({ message: 'NSError domain code 3072' })).toBe('cancelled');
    expect(classifyShareError(new Error('NSError domain code 3072'))).toBe('cancelled');
    expect(classifyShareError(new Error('Another share request is being processed now'))).toBe(
      'failed',
    );
  });
});
