import { FEEDBACK_MESSAGE_MAX, FEEDBACK_QUEUE_LIMIT, FEEDBACK_SCREENSHOT_MAX_BYTES } from './copy';
import { normalizeScreenshotBase64, buildFeedbackRequest, readAppVersion, readPlatform } from './payload';
import { captureCurrentScreen } from './capture';
import {
  createFeedbackId,
  enqueueFeedbackItem,
  parseFeedbackQueue,
  type FeedbackQueueItem,
} from './queue';
import { feedbackQuoteIdFromPath, feedbackScreenFromPath } from './screen';
import {
  classifyFeedbackFailure,
  flushFeedbackQueue,
  resetFeedbackSubmitForTests,
  submitFeedback,
  type FeedbackTransport,
} from './submit';
import type { FeedbackRequestBody } from './payload';

const QUOTE_ID = '11111111-1111-4111-8111-111111111111';
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function item(overrides: Partial<FeedbackQueueItem> = {}): FeedbackQueueItem {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    createdAt: '2026-10-15T12:00:00.000Z',
    message: 'The total looked wrong',
    rating: 3,
    screen: 'draft',
    quoteId: QUOTE_ID,
    appVersion: '1.0.0',
    platform: 'android',
    screenshotBase64: null,
    ...overrides,
  };
}

function memoryTransport(options: {
  online?: boolean;
  initial?: FeedbackQueueItem[];
  post?: (body: FeedbackRequestBody) => Promise<unknown>;
}): FeedbackTransport & { posts: FeedbackRequestBody[]; items: () => FeedbackQueueItem[] } {
  let stored = options.initial ?? [];
  const posts: FeedbackRequestBody[] = [];
  return {
    posts,
    items: () => stored,
    isOnline: () => options.online ?? true,
    post: async (body) => {
      posts.push(body);
      if (options.post) return options.post(body);
      return { id: 'ok' };
    },
    load: async () => stored,
    save: async (next) => {
      stored = next;
    },
  };
}

describe('feedback context', () => {
  it('names the screen and attaches a quote id only on draft and quote', () => {
    expect(feedbackScreenFromPath('/draft/11111111-1111-4111-8111-111111111111')).toBe('draft');
    expect(feedbackScreenFromPath('/quote/11111111-1111-4111-8111-111111111111')).toBe('quote');
    expect(feedbackScreenFromPath('/(app)/settings')).toBe('settings');
    expect(feedbackScreenFromPath('/quotes')).toBe('quotes');
    expect(
      feedbackQuoteIdFromPath('/draft/11111111-1111-4111-8111-111111111111', QUOTE_ID),
    ).toBe(QUOTE_ID);
    expect(feedbackQuoteIdFromPath('/settings', QUOTE_ID)).toBeNull();
    expect(feedbackQuoteIdFromPath('/draft/not-a-uuid', 'not-a-uuid')).toBeNull();
  });

  it('builds a request and drops a quote id or screenshot the API would reject', () => {
    expect(readAppVersion(' 1.0.0 ')).toBe('1.0.0');
    expect(readAppVersion('')).toBe('unknown');
    expect(readPlatform('ios')).toBe('ios');
    expect(readPlatform('web')).toBe('unknown');

    const body = buildFeedbackRequest({
      message: '  Hello  ',
      rating: null,
      screen: 'draft',
      quoteId: 'not-a-uuid',
      appVersion: '1.0.0',
      platform: 'android',
      screenshotBase64: PNG,
    });
    expect(body).toEqual({
      message: 'Hello',
      screen: 'draft',
      appVersion: '1.0.0',
      platform: 'android',
      screenshotBase64: PNG,
    });
    expect(body && 'quoteId' in body).toBe(false);
    expect(buildFeedbackRequest(item({ message: '   ' }))).toBeNull();

    const big = 'A'.repeat(FEEDBACK_SCREENSHOT_MAX_BYTES + 8);
    expect(normalizeScreenshotBase64(big)).toBeNull();
    expect(normalizeScreenshotBase64(BufferLikeGif())).toBeNull();
    expect(normalizeScreenshotBase64(`data:image/png;base64,${PNG}`)).toBe(PNG);
  });
});

function BufferLikeGif(): string {
  return globalThis.btoa('GIF89a!!!!');
}

describe('feedback queue', () => {
  beforeEach(() => {
    resetFeedbackSubmitForTests();
  });

  it('keeps the newest notes and ignores a corrupt file', () => {
    const first = item({ id: '1', message: 'one' });
    const queued = Array.from({ length: FEEDBACK_QUEUE_LIMIT }, (_, index) =>
      item({ id: String(index), message: `note ${index}` }),
    );
    const next = enqueueFeedbackItem(queued, first);
    expect(next).toHaveLength(FEEDBACK_QUEUE_LIMIT);
    expect(next[next.length - 1]?.message).toBe('one');
    expect(next[0]?.message).toBe('note 1');
    expect(parseFeedbackQueue('not json')).toEqual([]);
    expect(parseFeedbackQueue(JSON.stringify([first, { message: 1 }]))).toEqual([first]);
    expect(createFeedbackId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('sends immediately when online and does not leave the note queued', async () => {
    const transport = memoryTransport({ online: true });
    const result = await submitFeedback(item(), transport);
    expect(result).toBe('sent');
    expect(transport.posts).toHaveLength(1);
    expect(transport.posts[0]).toMatchObject({
      message: 'The total looked wrong',
      rating: 3,
      screen: 'draft',
      quoteId: QUOTE_ID,
      appVersion: '1.0.0',
      platform: 'android',
    });
    expect(transport.items()).toEqual([]);
  });

  it('queues while offline and sends the note when the flush runs online', async () => {
    const transport = memoryTransport({ online: false });
    const queued = await submitFeedback(item({ message: 'Offline note' }), transport);
    expect(queued).toBe('queued');
    expect(transport.posts).toHaveLength(0);
    expect(transport.items().map((row) => row.message)).toEqual(['Offline note']);

    const online = memoryTransport({ online: true, initial: transport.items() });
    await flushFeedbackQueue(online);
    expect(online.posts.map((body) => body.message)).toEqual(['Offline note']);
    expect(online.items()).toEqual([]);
  });

  it('drops a 400, keeps a 429, and stops after a server error', async () => {
    expect(classifyFeedbackFailure(400)).toBe('drop');
    expect(classifyFeedbackFailure(429)).toBe('stop');
    expect(classifyFeedbackFailure(null)).toBe('stop');

    const rejected = memoryTransport({
      online: true,
      post: async () => {
        throw { status: 400, error: 'Message is required' };
      },
    });
    expect(await submitFeedback(item(), rejected)).toBe('rejected');
    expect(rejected.items()).toEqual([]);

    resetFeedbackSubmitForTests();
    const limited = memoryTransport({
      online: true,
      post: async () => {
        throw { status: 429, error: 'Too many' };
      },
    });
    expect(await submitFeedback(item({ message: 'Later' }), limited)).toBe('queued');
    expect(limited.items()).toHaveLength(1);

    resetFeedbackSubmitForTests();
    let calls = 0;
    const flaky = memoryTransport({
      online: true,
      initial: [item({ id: '1', message: 'first' }), item({ id: '2', message: 'second' })],
      post: async () => {
        calls += 1;
        if (calls === 1) return { id: 'ok' };
        throw { status: 500, error: 'Internal server error' };
      },
    });
    await flushFeedbackQueue(flaky);
    expect(flaky.posts).toHaveLength(2);
    expect(flaky.items().map((row) => row.message)).toEqual(['second']);
  });

  it('retries a too-large screenshot without the image', async () => {
    const transport = memoryTransport({
      online: true,
      post: async (body) => {
        if (body.screenshotBase64) throw { status: 413, error: 'too large' };
        return { id: 'ok' };
      },
    });
    const result = await submitFeedback(item({ screenshotBase64: PNG }), transport);
    expect(result).toBe('sent');
    expect(transport.posts).toHaveLength(2);
    expect(transport.posts[1]?.screenshotBase64).toBeUndefined();
  });
});

describe('captureCurrentScreen', () => {
  it('returns null when capture is missing, throws, or is not a still', async () => {
    expect(await captureCurrentScreen(null)).toBeNull();
    expect(
      await captureCurrentScreen(async () => {
        throw new Error('native module missing');
      }),
    ).toBeNull();
    expect(await captureCurrentScreen(async () => globalThis.btoa('GIF89a!!!!'))).toBeNull();
    expect(await captureCurrentScreen(async () => PNG)).toBe(PNG);
  });
});

describe('message length', () => {
  it('refuses a note past the API cap', () => {
    expect(buildFeedbackRequest(item({ message: 'x'.repeat(FEEDBACK_MESSAGE_MAX + 1) }))).toBeNull();
  });
});
