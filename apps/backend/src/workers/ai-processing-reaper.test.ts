import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_PROCESSING_REAPER_CRON,
  AI_PROCESSING_REAPER_QUEUE,
  DEFAULT_AI_PROCESSING_TIMEOUT_MS,
  reapStaleAiProcessingQuotes,
  resolveAiProcessingTimeoutMs,
  startAiProcessingReaper,
} from './ai-processing-reaper.js';
import type { QueryFn } from './ai-processing-reaper.js';

describe('resolveAiProcessingTimeoutMs', () => {
  it('defaults to 15 minutes when unset', () => {
    assert.equal(resolveAiProcessingTimeoutMs(undefined), 15 * 60 * 1000);
    assert.equal(resolveAiProcessingTimeoutMs(undefined), DEFAULT_AI_PROCESSING_TIMEOUT_MS);
  });

  it('defaults when the env var is blank', () => {
    assert.equal(resolveAiProcessingTimeoutMs(''), DEFAULT_AI_PROCESSING_TIMEOUT_MS);
    assert.equal(resolveAiProcessingTimeoutMs('   '), DEFAULT_AI_PROCESSING_TIMEOUT_MS);
  });

  it('parses a positive millisecond override', () => {
    assert.equal(resolveAiProcessingTimeoutMs('30000'), 30_000);
  });

  it('rejects non-positive or non-finite values', () => {
    assert.equal(resolveAiProcessingTimeoutMs('0'), DEFAULT_AI_PROCESSING_TIMEOUT_MS);
    assert.equal(resolveAiProcessingTimeoutMs('-1000'), DEFAULT_AI_PROCESSING_TIMEOUT_MS);
    assert.equal(resolveAiProcessingTimeoutMs('nope'), DEFAULT_AI_PROCESSING_TIMEOUT_MS);
    assert.equal(resolveAiProcessingTimeoutMs('Infinity'), DEFAULT_AI_PROCESSING_TIMEOUT_MS);
  });
});

describe('reapStaleAiProcessingQuotes', () => {
  it('marks stale ai_processing rows as ai_failed with a parameterized cutoff', async () => {
    const calls: Array<{ text: string; params: unknown[] }> = [];
    const runQuery: QueryFn = async (text, params) => {
      calls.push({ text, params: params ?? [] });
      return { rows: [{ id: 'q1' }, { id: 'q2' }] };
    };

    const now = new Date('2026-09-07T22:00:00.000Z');
    const ids = await reapStaleAiProcessingQuotes(runQuery, 15 * 60 * 1000, now);

    assert.deepEqual(ids, ['q1', 'q2']);
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.text, /SET status = 'ai_failed'/);
    assert.match(calls[0]!.text, /WHERE status = 'ai_processing'/);
    assert.match(calls[0]!.text, /created_at < \$1/);
    assert.equal(calls[0]!.text.includes('${'), false);
    assert.deepEqual(calls[0]!.params, [new Date('2026-09-07T21:45:00.000Z')]);
  });

  it('returns an empty list when nothing is stale', async () => {
    const runQuery: QueryFn = async () => ({ rows: [] });
    const ids = await reapStaleAiProcessingQuotes(runQuery, 60_000, new Date());
    assert.deepEqual(ids, []);
  });
});

describe('startAiProcessingReaper', () => {
  it('creates the queue, schedules minute cron in UTC, and registers a worker', async () => {
    const events: string[] = [];
    const boss = {
      createQueue: async (name: string) => {
        events.push(`create:${name}`);
      },
      schedule: async (
        name: string,
        cron: string,
        data: object | null,
        options: { tz?: string }
      ) => {
        events.push(`schedule:${name}:${cron}:${data}:${options.tz}`);
      },
      work: async (name: string) => {
        events.push(`work:${name}`);
      },
    };

    await startAiProcessingReaper(boss as never, async () => ({ rows: [] }));

    assert.deepEqual(events, [
      `create:${AI_PROCESSING_REAPER_QUEUE}`,
      `schedule:${AI_PROCESSING_REAPER_QUEUE}:${AI_PROCESSING_REAPER_CRON}:null:UTC`,
      `work:${AI_PROCESSING_REAPER_QUEUE}`,
    ]);
    assert.equal(AI_PROCESSING_REAPER_CRON, '* * * * *');
  });
});
