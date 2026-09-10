import {
  REVIEW_BEFORE_SENDING,
  comparableLineItems,
  isDraftContentFork,
  isNeedsReviewStatus,
  isPreSendDraftStatus,
  isServerRevisionFork,
  lineItemsConflict,
  lineItemsFromQueuePayload,
  sendBlockedByReview,
  shouldApplyHydrateDraftConflict,
} from './draft-conflict';

const pipe = { name: 'Pipe', quantity: 2, unitPriceCents: 1500 };
const elbow = { name: 'Elbow', quantity: 1, unitPriceCents: 400 };

describe('lineItemsConflict', () => {
  it('is false when name, quantity, and cents match in order', () => {
    expect(lineItemsConflict(comparableLineItems([pipe]), comparableLineItems([pipe]))).toBe(
      false,
    );
  });

  it('ignores catalog id and confidence (snapshots compare on name/qty/cents)', () => {
    const local = comparableLineItems([
      { name: 'Pipe', quantity: 2, unitPriceCents: 1500 },
    ]);
    const server = comparableLineItems([
      { name: 'Pipe', quantity: 2, unitPriceCents: 1500 },
    ]);
    expect(lineItemsConflict(local, server)).toBe(false);
  });

  it('is true when quantity, price, name, or length differs', () => {
    expect(
      lineItemsConflict(
        comparableLineItems([pipe]),
        comparableLineItems([{ ...pipe, quantity: 3 }]),
      ),
    ).toBe(true);
    expect(
      lineItemsConflict(
        comparableLineItems([pipe]),
        comparableLineItems([{ ...pipe, unitPriceCents: 1600 }]),
      ),
    ).toBe(true);
    expect(lineItemsConflict(comparableLineItems([pipe]), comparableLineItems([elbow]))).toBe(
      true,
    );
    expect(
      lineItemsConflict(comparableLineItems([pipe]), comparableLineItems([pipe, elbow])),
    ).toBe(true);
  });
});

describe('isServerRevisionFork / isDraftContentFork', () => {
  it('does not treat unpushed local edits as a fork when we have no last server revision', () => {
    expect(isServerRevisionFork(null, '2026-09-10T12:00:00.000Z')).toBe(false);
    expect(
      isDraftContentFork({
        lastKnownUpdatedAt: null,
        serverUpdatedAt: '2026-09-10T12:00:00.000Z',
        localLines: comparableLineItems([pipe, elbow]),
        serverLines: comparableLineItems([pipe]),
      }),
    ).toBe(false);
  });

  it('is a fork only when the server timestamp moved and line items differ', () => {
    expect(
      isDraftContentFork({
        lastKnownUpdatedAt: '2026-09-10T11:00:00.000Z',
        serverUpdatedAt: '2026-09-10T12:00:00.000Z',
        localLines: comparableLineItems([pipe, elbow]),
        serverLines: comparableLineItems([pipe]),
      }),
    ).toBe(true);
  });

  it('is not a fork when the timestamp moved but line items match', () => {
    expect(
      isDraftContentFork({
        lastKnownUpdatedAt: '2026-09-10T11:00:00.000Z',
        serverUpdatedAt: '2026-09-10T12:00:00.000Z',
        localLines: comparableLineItems([pipe]),
        serverLines: comparableLineItems([pipe]),
      }),
    ).toBe(false);
  });

  it('is not a fork when the timestamp is unchanged (unpushed local vs same server row)', () => {
    expect(
      isDraftContentFork({
        lastKnownUpdatedAt: '2026-09-10T12:00:00.000Z',
        serverUpdatedAt: '2026-09-10T12:00:00.000Z',
        localLines: comparableLineItems([pipe, elbow]),
        serverLines: comparableLineItems([pipe]),
      }),
    ).toBe(false);
  });
});

describe('shouldApplyHydrateDraftConflict', () => {
  it('applies when a dirty pre-send draft disagrees with the server', () => {
    expect(
      shouldApplyHydrateDraftConflict({
        dirty: true,
        serverStatus: 'draft_local',
        localLines: comparableLineItems([pipe, elbow]),
        serverLines: comparableLineItems([pipe]),
      }),
    ).toBe(true);
  });

  it('does not apply when local is not dirty (silent server-as-truth hydrate)', () => {
    expect(
      shouldApplyHydrateDraftConflict({
        dirty: false,
        serverStatus: 'draft_local',
        localLines: comparableLineItems([elbow]),
        serverLines: comparableLineItems([pipe]),
      }),
    ).toBe(false);
  });

  it('does not apply when lines match, even if dirty', () => {
    expect(
      shouldApplyHydrateDraftConflict({
        dirty: true,
        serverStatus: 'draft_local',
        localLines: comparableLineItems([pipe]),
        serverLines: comparableLineItems([pipe]),
      }),
    ).toBe(false);
  });

  it('does not use the review-before-sending path for sent quotes', () => {
    expect(
      shouldApplyHydrateDraftConflict({
        dirty: true,
        serverStatus: 'sent',
        localLines: comparableLineItems([pipe]),
        serverLines: comparableLineItems([elbow]),
      }),
    ).toBe(false);
  });
});

describe('send gate and payload helpers', () => {
  it('blocks send while needs_review is set', () => {
    expect(sendBlockedByReview(true)).toBe(true);
    expect(sendBlockedByReview(false)).toBe(false);
    expect(REVIEW_BEFORE_SENDING).toBe('Review before sending');
  });

  it('recognizes pre-send and needs_review statuses', () => {
    expect(isPreSendDraftStatus('draft_local')).toBe(true);
    expect(isPreSendDraftStatus('draft_queued')).toBe(true);
    expect(isPreSendDraftStatus('ai_failed')).toBe(true);
    expect(isPreSendDraftStatus('sent')).toBe(false);
    expect(isNeedsReviewStatus('needs_review')).toBe(true);
    expect(isNeedsReviewStatus('pending')).toBe(false);
  });

  it('reads line items from draft JSON or quote-send array payloads', () => {
    expect(
      lineItemsFromQueuePayload({
        lineItemsJson: JSON.stringify([pipe]),
      }),
    ).toEqual([pipe]);
    expect(
      lineItemsFromQueuePayload({
        lineItems: [elbow],
      }),
    ).toEqual([elbow]);
    expect(lineItemsFromQueuePayload({ customerPhone: '+1' })).toBeNull();
  });
});
