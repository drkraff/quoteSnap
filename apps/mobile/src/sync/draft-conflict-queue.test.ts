import { database } from '../db';
import { NEEDS_REVIEW_STATUS } from './draft-conflict';
import {
  acknowledgeDraftReview,
  dropPendingQuoteDraftUpdatesInWrite,
  ensureNeedsReviewInWrite,
  isNeedsReviewForDraft,
} from './draft-conflict-queue';

jest.mock('../db', () => ({
  database: {
    write: jest.fn(async (fn: () => Promise<unknown>) => fn()),
    get: jest.fn(),
  },
}));

type FakeQueueItem = {
  entityType: string;
  entityId: string;
  action: string;
  payloadJson: string;
  status: string;
  retryCount: number;
  nextRetryAt: Date | null;
  destroyPermanently: () => Promise<void>;
};

const mockedDatabase = database as unknown as {
  write: jest.Mock;
  get: jest.Mock;
};

describe('draft-conflict-queue', () => {
  let queueItems: FakeQueueItem[];

  beforeEach(() => {
    queueItems = [];
    mockedDatabase.get.mockImplementation(() => ({
      query: () => ({
        fetch: async () => queueItems.filter((item) => item.status !== 'destroyed'),
      }),
      create: async (writer: (record: FakeQueueItem) => void) => {
        const record: FakeQueueItem = {
          entityType: '',
          entityId: '',
          action: '',
          payloadJson: '',
          status: '',
          retryCount: 0,
          nextRetryAt: null,
          async destroyPermanently() {
            record.status = 'destroyed';
          },
        };
        writer(record);
        queueItems.push(record);
        return record;
      },
    }));
  });

  it('drops pending quote/draft updates but not audio or in_progress', async () => {
    const pendingDraft: FakeQueueItem = {
      entityType: 'draft',
      entityId: 'd1',
      action: 'update',
      payloadJson: '{}',
      status: 'pending',
      retryCount: 0,
      nextRetryAt: null,
      async destroyPermanently() {
        pendingDraft.status = 'destroyed';
      },
    };
    const inProgress: FakeQueueItem = {
      entityType: 'draft',
      entityId: 'd1',
      action: 'update',
      payloadJson: '{}',
      status: 'in_progress',
      retryCount: 0,
      nextRetryAt: null,
      async destroyPermanently() {
        inProgress.status = 'destroyed';
      },
    };
    const audio: FakeQueueItem = {
      entityType: 'audio',
      entityId: 'q1',
      action: 'update',
      payloadJson: '{}',
      status: 'pending',
      retryCount: 0,
      nextRetryAt: null,
      async destroyPermanently() {
        audio.status = 'destroyed';
      },
    };
    queueItems = [pendingDraft, inProgress, audio];

    await dropPendingQuoteDraftUpdatesInWrite('q1', 'd1');

    expect(pendingDraft.status).toBe('destroyed');
    expect(inProgress.status).toBe('in_progress');
    expect(audio.status).toBe('pending');
  });

  it('creates a single needs_review marker and acknowledge removes it', async () => {
    await ensureNeedsReviewInWrite('d1');
    await ensureNeedsReviewInWrite('d1');
    expect(queueItems.filter((item) => item.status === NEEDS_REVIEW_STATUS)).toHaveLength(1);
    expect(isNeedsReviewForDraft(queueItems[0]!, 'd1')).toBe(true);

    await acknowledgeDraftReview('d1');
    expect(queueItems.filter((item) => item.status === NEEDS_REVIEW_STATUS)).toHaveLength(0);
  });
});
