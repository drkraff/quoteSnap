import {
  applyShareSentLocalFields,
  markQuoteSentAfterShare,
  shareSentSnapshotFromSource,
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
  totalCents: number;
  update: (fn: (record: FakeQuote) => void) => Promise<void>;
};

function makeQuote(overrides: Partial<FakeQuote> = {}): FakeQuote {
  const quote: FakeQuote = {
    id: 'local-q1',
    status: 'draft_local',
    sentAt: null,
    customerPhone: null,
    totalCents: 25000,
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
      const record = { status, sentAt, totalCents: 25000 };
      expect(applyShareSentLocalFields(record, now)).toBe(false);
      expect(record.status).toBe(status);
      expect(record.sentAt).toBe(sentAt);
      expect(record.totalCents).toBe(25000);
    }
  });

  it('does not invent a customer phone on the sync payload', () => {
    expect(shareSentSyncPayload()).toEqual({ status: 'sent' });
    expect(shareSentSyncPayload()).not.toHaveProperty('customerPhone');
    expect(shareSentSyncPayload()).not.toHaveProperty('lineItems');
    expect(shareSentSyncPayload()).not.toHaveProperty('totalCents');
  });

  it('puts the stored line snapshot without inventing a phone or a price', () => {
    const snapshot = shareSentSnapshotFromSource({
      customerPhone: null,
      totalCents: 25000,
      privateNote: 'subcontractor check — do not tell the client',
      lineItems: [
        {
          name: 'Replace outlet',
          quantity: 1,
          unitPriceCents: 25000,
          unit: 'each',
          privateNote: 'moisture from neighbor pipe',
          clientId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        },
        {
          name: 'Cabinets',
          quantity: 14,
          unitPriceCents: null,
          unit: 'foot',
        },
      ],
    });
    expect(snapshot.totalCents).toBe(25000);
    expect(snapshot.lineItems[0]!.unitPriceCents).toBe(25000);
    expect(snapshot.lineItems[1]!.unitPriceCents).toBe(0);
    const payload = shareSentSyncPayload(snapshot);
    expect(payload).toEqual({
      status: 'sent',
      totalCents: 25000,
      lineItems: snapshot.lineItems,
    });
    expect(payload).not.toHaveProperty('customerPhone');
    expect(JSON.stringify(payload)).not.toContain('subcontractor check');
    expect(JSON.stringify(payload.lineItems)).toContain('moisture from neighbor pipe');
  });
});

describe('markQuoteSentAfterShare', () => {
  beforeEach(() => {
    mockedEnqueue.mockClear();
    mockedWrite.mockClear();
  });

  it('writes sent + sentAt locally and enqueues the stored snapshot without a phone', async () => {
    const quote = makeQuote({ status: 'draft_local', customerPhone: null });
    const now = new Date('2026-09-15T12:00:00.000Z');
    const snapshot = shareSentSnapshotFromSource({
      customerPhone: null,
      totalCents: 25000,
      lineItems: [
        { name: 'Replace outlet', quantity: 1, unitPriceCents: 25000, unit: 'each' },
      ],
    });

    await expect(
      markQuoteSentAfterShare(quote as unknown as never, now, snapshot),
    ).resolves.toBe('sent');

    expect(quote.status).toBe('sent');
    expect(quote.sentAt).toBe(now);
    expect(quote.customerPhone).toBeNull();
    expect(mockedEnqueue).toHaveBeenCalledWith({
      entityType: 'quote',
      entityId: 'local-q1',
      action: 'update',
      payload: {
        status: 'sent',
        totalCents: 25000,
        lineItems: snapshot.lineItems,
      },
    });
    const payload = mockedEnqueue.mock.calls[0]![0].payload as Record<string, unknown>;
    expect(payload.customerPhone).toBeUndefined();
  });

  it('does not enqueue or rewrite sentAt when the quote is already sent', async () => {
    const sentAt = new Date('2026-09-01T13:00:00.000Z');
    const quote = makeQuote({ status: 'sent', sentAt, totalCents: 25000 });

    await expect(markQuoteSentAfterShare(quote as unknown as never)).resolves.toBe('noop');

    expect(quote.status).toBe('sent');
    expect(quote.sentAt).toBe(sentAt);
    expect(quote.totalCents).toBe(25000);
    expect(quote.customerPhone).toBeNull();
    expect(mockedEnqueue).not.toHaveBeenCalled();
    expect(mockedWrite).not.toHaveBeenCalled();
  });
});
