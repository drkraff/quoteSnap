import { classifyQueueFailure, isPermanentClientStatus } from './queue-failure';
import { ParentNotReadyError } from './parent-not-ready';
import { FrozenQuoteWriteError, QUOTE_MONEY_FROZEN_ERROR } from './frozen-quote';

describe('classifyQueueFailure', () => {
  it('defers a parent that has no server id without treating it as a failed write', () => {
    expect(classifyQueueFailure(new ParentNotReadyError('Cannot sync draft: parent quote has no server ID yet'))).toBe(
      'defer',
    );
    expect(classifyQueueFailure(new Error('Cannot sync update: no server ID for quote'))).toBe('defer');
    expect(classifyQueueFailure(new Error('Cannot sync photo: parent quote has no server ID yet'))).toBe('defer');
  });

  it('treats 401 as a session refresh, not a permanent failure', () => {
    expect(classifyQueueFailure({ status: 401, error: 'Unauthorized' })).toBe('unauthorized');
    expect(isPermanentClientStatus(401)).toBe(false);
  });

  it('retries network errors, 5xx, 408, and 429', () => {
    expect(classifyQueueFailure(new Error('Network request failed'))).toBe('retry');
    expect(classifyQueueFailure({ status: 500, error: 'Internal server error' })).toBe('retry');
    expect(classifyQueueFailure({ status: 503, error: 'unavailable' })).toBe('retry');
    expect(classifyQueueFailure({ status: 408, error: 'timeout' })).toBe('retry');
    expect(classifyQueueFailure({ status: 429, error: 'slow down' })).toBe('retry');
    expect(isPermanentClientStatus(408)).toBe(false);
    expect(isPermanentClientStatus(429)).toBe(false);
  });

  it('parks permanent 4xx immediately, including status lock and validation', () => {
    expect(classifyQueueFailure({ status: 400, error: 'name is required' })).toBe('permanent');
    expect(classifyQueueFailure({ status: 403, error: 'Forbidden' })).toBe('permanent');
    expect(classifyQueueFailure({ status: 404, error: 'Quote not found' })).toBe('permanent');
    expect(classifyQueueFailure({ status: 422, error: 'invalid' })).toBe('permanent');
    expect(
      classifyQueueFailure({
        status: 409,
        error: 'Quote cannot be updated in its current status',
      }),
    ).toBe('permanent');
    expect(classifyQueueFailure(new FrozenQuoteWriteError(QUOTE_MONEY_FROZEN_ERROR))).toBe('permanent');
  });
});
