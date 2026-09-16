import {
  shareCustomerQuoteAndMarkSent,
  defaultConfirmShareSent,
} from './share-and-mark-sent';
import {
  SHARE_QUOTE_CANCELLED,
  SHARE_QUOTE_CONFIRM_SENT_BODY,
  SHARE_QUOTE_CONFIRM_SENT_NO,
  SHARE_QUOTE_CONFIRM_SENT_TITLE,
  SHARE_QUOTE_CONFIRM_SENT_YES,
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
    const markSent = jest.fn(
      async (
        record: FakeQuote,
        _now?: Date,
        _snapshot?: { totalCents: number; lineItems: { name: string; unitPriceCents: number }[] },
      ) => {
        record.status = 'sent';
        record.sentAt = now;
        return 'sent' as const;
      },
    );
    const result = await shareCustomerQuoteAndMarkSent(
      sourceWithLine,
      quote as unknown as never,
      {},
      {
        shareDeps: fakeShareDeps(),
        markSent: markSent as never,
        confirmSent: async () => true,
        now,
      },
    );

    expect(result.share).toEqual({ ok: true, kind: 'pdf' });
    expect(result.marked).toBe('sent');
    expect(markSent).toHaveBeenCalledTimes(1);
    const snapshot = markSent.mock.calls[0]![2];
    expect(snapshot?.totalCents).toBe(25000);
    expect(snapshot?.lineItems[0]!.name).toBe('Replace outlet');
    expect(snapshot?.lineItems[0]!.unitPriceCents).toBe(25000);
    expect(JSON.stringify(snapshot)).not.toContain('customerPhone');
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

  it('does not mark sent when the plumber says they did not send the Android share', async () => {
    const quote = makeQuote();
    const markSent = jest.fn(async (): Promise<MarkQuoteSentAfterShareResult> => 'sent');
    const result = await shareCustomerQuoteAndMarkSent(
      sourceWithLine,
      quote as unknown as never,
      {},
      {
        shareDeps: fakeShareDeps(),
        markSent,
        confirmSent: async () => false,
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

  it('does not ask to confirm after cancel or empty share', async () => {
    const quote = makeQuote();
    const confirmSent = jest.fn(async () => true);
    const markSent = jest.fn(async (): Promise<MarkQuoteSentAfterShareResult> => 'sent');
    await shareCustomerQuoteAndMarkSent(
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
        confirmSent,
      },
    );
    expect(confirmSent).not.toHaveBeenCalled();
    expect(markSent).not.toHaveBeenCalled();
  });
});

describe('defaultConfirmShareSent', () => {
  it('skips the prompt on iOS where cancel already throws', async () => {
    const alert = jest.fn();
    await expect(defaultConfirmShareSent({ platform: 'ios', alert: alert as never })).resolves.toBe(
      true,
    );
    expect(alert).not.toHaveBeenCalled();
  });

  it('asks on Android and treats Not yet as cancel', async () => {
    const alert = jest.fn(
      (
        _title: string,
        _message: string,
        buttons: { text: string; onPress?: () => void }[],
      ) => {
        buttons.find((button) => button.text === SHARE_QUOTE_CONFIRM_SENT_NO)?.onPress?.();
      },
    );
    await expect(
      defaultConfirmShareSent({ platform: 'android', alert: alert as never }),
    ).resolves.toBe(false);
    expect(alert).toHaveBeenCalledWith(
      SHARE_QUOTE_CONFIRM_SENT_TITLE,
      SHARE_QUOTE_CONFIRM_SENT_BODY,
      expect.arrayContaining([
        expect.objectContaining({ text: SHARE_QUOTE_CONFIRM_SENT_NO }),
        expect.objectContaining({ text: SHARE_QUOTE_CONFIRM_SENT_YES }),
      ]),
      expect.objectContaining({ cancelable: true }),
    );
  });

  it('asks on Android and treats I sent it as confirm', async () => {
    const alert = jest.fn(
      (
        _title: string,
        _message: string,
        buttons: { text: string; onPress?: () => void }[],
      ) => {
        buttons.find((button) => button.text === SHARE_QUOTE_CONFIRM_SENT_YES)?.onPress?.();
      },
    );
    await expect(
      defaultConfirmShareSent({ platform: 'android', alert: alert as never }),
    ).resolves.toBe(true);
  });
});
