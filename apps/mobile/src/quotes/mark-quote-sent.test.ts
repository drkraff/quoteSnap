import {
  applyShareSentLocalFields,
  markQuoteSentAfterShare,
  shareSentSyncPayload,
  shouldMarkQuoteSentAfterShare,
} from './mark-quote-sent';
import { enqueue } from '../sync/sync-queue';
import { database } from '../db';

jest.mock('../db', () => ({
  database: {
    write: jest.fn(async (fn: () => Promise<unknown>) => fn()),
  },
}));

jest.mock('../sync/sync-queue', () => ({
  enqueue: jest.fn(async () => undefined),
}));

const mockedEnqueue = enqueue as unknown as jest.Mock;
const mockedWrite = (database as unknown as { write: jest.Mock }).write;

type FakeQuote = {
  id: string;
  status: string;
  sentAt: Date | null;
  customerPhone: string | null;
  update: (fn: (record: FakeQuote) => void) => Promise<void>;
};

function makeQuote(overrides: Partial<FakeQuote> = {}): FakeQuote {
  const quote: FakeQuote = {
    id: 'local-q1',
    status: 'draft_local',
    sentAt: null,
    customerPhone: null,
    async update(fn) {
      fn(quote);
    },
    ...overrides,
  };
  return quote;
}

describe('shouldMarkQuoteSentAfterShare / applyShareSentLocalFields', () => {
  it('transitions eligible drafts to sent with a timestamp', () => {
    const now = new Date('2026-09-15T12:00:00.000Z');
    for (const status of ['draft_local', 'draft_queued', 'ai_failed']) {
      expect(shouldMarkQuoteSentAfterShare(status)).toBe(true);
      const record = { status, sentAt: null as Date | null };
      expect(applyShareSentLocalFields(record, now)).toBe(true);
      expect(record.status).toBe('sent');
      expect(record.sentAt).toBe(now);
    }
  });

  it('is a no-op on already sent and other frozen statuses', () => {
    const now = new Date('2026-09-15T12:00:00.000Z');
    const sentAt = new Date('2026-09-01T13:00:00.000Z');
    for (const status of ['sent', 'approved', 'declined', 'expired', 'failed_send', 'ai_processing']) {
      expect(shouldMarkQuoteSentAfterShare(status)).toBe(false);
      const record = { status, sentAt };
      expect(applyShareSentLocalFields(record, now)).toBe(false);
      expect(record.status).toBe(status);
      expect(record.sentAt).toBe(sentAt);
    }
  });

  it('does not invent a customer phone on the sync payload', () => {
    expect(shareSentSyncPayload()).toEqual({ status: 'sent' });
    expect(shareSentSyncPayload()).not.toHaveProperty('customerPhone');
    expect(shareSentSyncPayload()).not.toHaveProperty('lineItems');
    expect(shareSentSyncPayload()).not.toHaveProperty('totalCents');
  });
});

describe('markQuoteSentAfterShare', () => {
  beforeEach(() => {
    mockedEnqueue.mockClear();
    mockedWrite.mockClear();
  });

  it('writes sent + sentAt locally and enqueues status-only PUT', async () => {
    const quote = makeQuote({ status: 'draft_local', customerPhone: null });
    const now = new Date('2026-09-15T12:00:00.000Z');

    await expect(markQuoteSentAfterShare(quote as unknown as never, now)).resolves.toBe('sent');

    expect(quote.status).toBe('sent');
    expect(quote.sentAt).toBe(now);
    expect(quote.customerPhone).toBeNull();
    expect(mockedEnqueue).toHaveBeenCalledWith({
      entityType: 'quote',
      entityId: 'local-q1',
      action: 'update',
      payload: { status: 'sent' },
    });
    const payload = mockedEnqueue.mock.calls[0]![0].payload as Record<string, unknown>;
    expect(payload.customerPhone).toBeUndefined();
  });

  it('does not enqueue or rewrite sentAt when the quote is already sent', async () => {
    const sentAt = new Date('2026-09-01T13:00:00.000Z');
    const quote = makeQuote({ status: 'sent', sentAt });

    await expect(markQuoteSentAfterShare(quote as unknown as never)).resolves.toBe('noop');

    expect(quote.status).toBe('sent');
    expect(quote.sentAt).toBe(sentAt);
    expect(mockedEnqueue).not.toHaveBeenCalled();
    expect(mockedWrite).not.toHaveBeenCalled();
  });
});
