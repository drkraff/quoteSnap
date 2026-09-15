import {
  shareCustomerQuoteAndMarkSent,
} from './share-and-mark-sent';
import {
  SHARE_QUOTE_CANCELLED,
  SHARE_QUOTE_EMPTY,
  SHARE_QUOTE_FAILED,
  type ShareCustomerQuoteDeps,
} from './share-customer-quote';
import type { MarkQuoteSentAfterShareResult } from './mark-quote-sent';

jest.mock('../db', () => ({
  database: {
    write: jest.fn(async (fn: () => Promise<unknown>) => fn()),
  },
}));

jest.mock('../sync/sync-queue', () => ({
  enqueue: jest.fn(async () => undefined),
}));

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

function fakeShareDeps(overrides: Partial<ShareCustomerQuoteDeps> = {}): ShareCustomerQuoteDeps {
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

const sourceWithLine = {
  customerPhone: null as string | null,
  totalCents: 25000,
  privateNote: SECRET_JOB,
  lineItems: [
    {
      name: 'Replace outlet',
      quantity: 1,
      unitPriceCents: 25000,
      unit: 'each',
      privateNote: SECRET_LINE,
    },
  ],
};

type FakeQuote = {
  id: string;
  status: string;
  sentAt: Date | null;
  totalCents: number;
};

function makeQuote(overrides: Partial<FakeQuote> = {}): FakeQuote {
  return {
    id: 'local-q1',
    status: 'draft_local',
    sentAt: null,
    totalCents: 25000,
    ...overrides,
  };
}

describe('shareCustomerQuoteAndMarkSent', () => {
  it('does not mark sent when the plumber cancels the share sheet', async () => {
    const quote = makeQuote();
    const markSent = jest.fn(async (): Promise<MarkQuoteSentAfterShareResult> => 'sent');
    const result = await shareCustomerQuoteAndMarkSent(
      sourceWithLine,
      quote as unknown as never,
      {},
      {
        shareDeps: fakeShareDeps({
          shareFile: jest.fn(async () => {
            throw new Error('User did not share');
          }),
        }),
        markSent,
      },
    );

    expect(result.share).toEqual({
      ok: false,
      reason: 'cancelled',
      message: SHARE_QUOTE_CANCELLED,
    });
    expect(result.marked).toBe('skipped');
    expect(markSent).not.toHaveBeenCalled();
    expect(quote.status).toBe('draft_local');
    expect(quote.sentAt).toBeNull();
  });

  it('does not mark sent when the share API fails', async () => {
    const quote = makeQuote({ status: 'draft_queued' });
    const markSent = jest.fn(async (): Promise<MarkQuoteSentAfterShareResult> => 'sent');
    const result = await shareCustomerQuoteAndMarkSent(
      sourceWithLine,
      quote as unknown as never,
      {},
      {
        shareDeps: fakeShareDeps({
          shareFile: jest.fn(async () => {
            throw new Error('Another share request is being processed now');
          }),
        }),
        markSent,
      },
    );

    expect(result.share).toEqual({
      ok: false,
      reason: 'failed',
      message: SHARE_QUOTE_FAILED,
    });
    expect(result.marked).toBe('skipped');
    expect(markSent).not.toHaveBeenCalled();
    expect(quote.status).toBe('draft_queued');
    expect(quote.sentAt).toBeNull();
  });

  it('blocks an empty quote with friendly copy and does not mark sent', async () => {
    const quote = makeQuote({ totalCents: 0 });
    const markSent = jest.fn(async (): Promise<MarkQuoteSentAfterShareResult> => 'sent');
    const shareDeps = fakeShareDeps();
    const result = await shareCustomerQuoteAndMarkSent(
      {
        customerPhone: null,
        totalCents: 0,
        privateNote: SECRET_JOB,
        lineItems: [],
      },
      quote as unknown as never,
      {},
      { shareDeps, markSent },
    );

    expect(result.share).toEqual({
      ok: false,
      reason: 'empty',
      message: SHARE_QUOTE_EMPTY,
    });
    expect(result.marked).toBe('skipped');
    expect(markSent).not.toHaveBeenCalled();
    expect(shareDeps.printToPdf).not.toHaveBeenCalled();
    expect(shareDeps.shareFile).not.toHaveBeenCalled();
    expect(quote.status).toBe('draft_local');
  });

  it('marks an eligible draft sent after a successful share', async () => {
    const quote = makeQuote();
    const now = new Date('2026-09-15T12:00:00.000Z');
    const markSent = jest.fn(async (record: FakeQuote) => {
      record.status = 'sent';
      record.sentAt = now;
      return 'sent' as const;
    });
    const result = await shareCustomerQuoteAndMarkSent(
      sourceWithLine,
      quote as unknown as never,
      {},
      { shareDeps: fakeShareDeps(), markSent: markSent as never, now },
    );

    expect(result.share).toEqual({ ok: true, kind: 'pdf' });
    expect(result.marked).toBe('sent');
    expect(markSent).toHaveBeenCalledTimes(1);
    expect(quote.status).toBe('sent');
    expect(quote.sentAt).toBe(now);
  });

  it('re-shares an already-sent quote without rewriting status, sentAt, or totals', async () => {
    const sentAt = new Date('2026-09-01T13:00:00.000Z');
    const quote = makeQuote({ status: 'sent', sentAt, totalCents: 25000 });
    const markSent = jest.fn(async (): Promise<MarkQuoteSentAfterShareResult> => 'noop');
    const result = await shareCustomerQuoteAndMarkSent(
      sourceWithLine,
      quote as unknown as never,
      {},
      { shareDeps: fakeShareDeps(), markSent },
    );

    expect(result.share).toEqual({ ok: true, kind: 'pdf' });
    expect(result.marked).toBe('noop');
    expect(markSent).toHaveBeenCalledTimes(1);
    expect(quote.status).toBe('sent');
    expect(quote.sentAt).toBe(sentAt);
    expect(quote.totalCents).toBe(25000);
  });
});
