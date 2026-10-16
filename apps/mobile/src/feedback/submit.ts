import {
  enqueueFeedbackItem,
  feedbackBodyForItem,
  type FeedbackQueueItem,
} from './queue';
import type { FeedbackRequestBody } from './payload';

export type FeedbackTransport = {
  isOnline: () => boolean | Promise<boolean>;
  post: (body: FeedbackRequestBody) => Promise<unknown>;
  load: () => Promise<FeedbackQueueItem[]>;
  save: (items: FeedbackQueueItem[]) => Promise<void>;
};

export type FeedbackFailure = 'drop' | 'stop' | 'retry-without-screenshot';

export function feedbackStatus(error: unknown): number | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  ) {
    return (error as { status: number }).status;
  }
  return null;
}

/** 4xx that will never succeed is dropped. Network, 401, 429, and 5xx stay queued. */
export function classifyFeedbackFailure(status: number | null): FeedbackFailure {
  if (status === 413) return 'retry-without-screenshot';
  if (status !== null && status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429) {
    return 'drop';
  }
  return 'stop';
}

let tail: Promise<unknown> = Promise.resolve();

function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function resetFeedbackSubmitForTests(): void {
  tail = Promise.resolve();
}

async function persist(transport: FeedbackTransport, item: FeedbackQueueItem): Promise<void> {
  const queue = await transport.load();
  await transport.save(enqueueFeedbackItem(queue, item));
}

async function postBody(transport: FeedbackTransport, item: FeedbackQueueItem): Promise<'sent' | FeedbackFailure> {
  const body = feedbackBodyForItem(item);
  if (!body) return 'drop';
  try {
    await transport.post(body);
    return 'sent';
  } catch (error) {
    return classifyFeedbackFailure(feedbackStatus(error));
  }
}

async function sendItem(
  transport: FeedbackTransport,
  item: FeedbackQueueItem,
): Promise<'sent' | 'queued' | 'rejected'> {
  const online = await transport.isOnline();
  if (!online) {
    await persist(transport, item);
    return 'queued';
  }
  const first = await postBody(transport, item);
  if (first === 'sent') return 'sent';
  if (first === 'drop') return 'rejected';
  const slim = first === 'retry-without-screenshot' ? { ...item, screenshotBase64: null } : item;
  if (slim !== item) {
    const second = await postBody(transport, slim);
    if (second === 'sent') return 'sent';
    if (second === 'drop') return 'rejected';
  }
  await persist(transport, slim);
  return 'queued';
}

async function drainQueue(transport: FeedbackTransport): Promise<void> {
  if (!(await transport.isOnline())) return;
  const items = await transport.load();
  const remaining: FeedbackQueueItem[] = [];
  let stopped = false;
  for (const item of items) {
    if (stopped) {
      remaining.push(item);
      continue;
    }
    const first = await postBody(transport, item);
    if (first === 'sent' || first === 'drop') continue;
    const slim = first === 'retry-without-screenshot' ? { ...item, screenshotBase64: null } : item;
    if (slim !== item) {
      const second = await postBody(transport, slim);
      if (second === 'sent' || second === 'drop') continue;
      remaining.push(slim);
      stopped = true;
      continue;
    }
    remaining.push(item);
    stopped = true;
  }
  await transport.save(remaining);
}

export async function submitFeedback(
  item: FeedbackQueueItem,
  transport: FeedbackTransport,
): Promise<'sent' | 'queued' | 'rejected'> {
  return runExclusive(async () => {
    const result = await sendItem(transport, item);
    if (result === 'sent') await drainQueue(transport);
    return result;
  });
}

export async function flushFeedbackQueue(transport: FeedbackTransport): Promise<void> {
  return runExclusive(() => drainQueue(transport));
}
