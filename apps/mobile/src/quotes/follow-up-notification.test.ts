import { FOLLOW_UP_DAY_MS } from './follow-up';
import {
  applyFollowUpNotification,
  createOptionalExpoNotificationScheduler,
  followUpNotificationId,
  planFollowUpNotification,
  type LocalNotificationScheduler,
} from './follow-up-notification';

const NOW = new Date('2026-10-04T00:00:00.000Z');
const DAY = FOLLOW_UP_DAY_MS;

function fakeScheduler(): LocalNotificationScheduler & {
  scheduled: { id: string; fireAt: Date; title: string; body: string }[];
  cancelled: string[];
} {
  const scheduled: { id: string; fireAt: Date; title: string; body: string }[] = [];
  const cancelled: string[] = [];
  return {
    scheduled,
    cancelled,
    async schedule(request) {
      scheduled.push(request);
    },
    async cancel(id) {
      cancelled.push(id);
    },
  };
}

describe('planFollowUpNotification', () => {
  it('schedules one alarm at sent_at plus N days while that time is still ahead', () => {
    const sentAt = new Date(NOW.getTime() - DAY);
    const plan = planFollowUpNotification(
      { status: 'sent', sentAt, customerName: ' Ada ' },
      NOW,
    );
    expect(plan).toEqual({
      action: 'schedule',
      fireAt: new Date(sentAt.getTime() + 3 * DAY),
      title: 'Needs follow-up',
      body: 'Follow up with Ada.',
    });
  });

  it('does not put a price in the body and omits a blank name', () => {
    const sentAt = new Date(NOW.getTime() - DAY);
    const plan = planFollowUpNotification(
      { status: 'sent', sentAt, customerName: '  ', totalCents: 5000 } as {
        status: string;
        sentAt: Date;
        customerName: string;
      },
      NOW,
    );
    expect(plan.action).toBe('schedule');
    if (plan.action !== 'schedule') return;
    expect(plan.body).toBe('A sent quote has had no answer.');
    expect(plan.body).not.toMatch(/\$/);
    expect(plan.body).not.toContain('5000');
    expect(plan.title).not.toMatch(/\$/);
  });

  it('does not schedule when sent_at is missing or the alarm time has passed', () => {
    expect(planFollowUpNotification({ status: 'sent', sentAt: null }, NOW)).toEqual({ action: 'none' });
    const sentAt = new Date(NOW.getTime() - 3 * DAY);
    expect(planFollowUpNotification({ status: 'sent', sentAt }, NOW)).toEqual({ action: 'none' });
  });

  it('cancels when the quote is approved, declined, expired, followed up, dismissed, snoozed, or archived', () => {
    const sentAt = new Date(NOW.getTime() - DAY);
    const cases = [
      { status: 'approved', sentAt },
      { status: 'declined', sentAt },
      { status: 'expired', sentAt },
      { status: 'sent', sentAt, followedUpAt: NOW },
      { status: 'sent', sentAt, dismissed: true },
      { status: 'sent', sentAt, followUpDismissed: true },
      { status: 'sent', sentAt, snoozedUntil: new Date(NOW.getTime() + DAY) },
      { status: 'sent', sentAt, isArchived: true },
    ];
    for (const quote of cases) {
      expect(planFollowUpNotification(quote, NOW)).toEqual({ action: 'cancel' });
    }
  });

  it('leaves drafts and voice rows alone', () => {
    for (const status of ['draft_local', 'draft_queued', 'ai_processing', 'ai_failed']) {
      expect(planFollowUpNotification({ status, sentAt: null }, NOW)).toEqual({ action: 'none' });
    }
  });
});

describe('applyFollowUpNotification', () => {
  it('schedules and cancels through the injected scheduler', async () => {
    const scheduler = fakeScheduler();
    const fireAt = new Date(NOW.getTime() + DAY);
    await applyFollowUpNotification(scheduler, 'q1', {
      action: 'schedule',
      fireAt,
      title: 'Needs follow-up',
      body: 'A sent quote has had no answer.',
    });
    await applyFollowUpNotification(scheduler, 'q1', { action: 'cancel' });
    await applyFollowUpNotification(scheduler, 'q1', { action: 'none' });
    await applyFollowUpNotification(scheduler, '  ', { action: 'cancel' });

    expect(followUpNotificationId('q1')).toBe('follow-up:q1');
    expect(scheduler.scheduled).toEqual([
      {
        id: 'follow-up:q1',
        fireAt,
        title: 'Needs follow-up',
        body: 'A sent quote has had no answer.',
      },
    ]);
    expect(scheduler.cancelled).toEqual(['follow-up:q1']);
  });

  it('no-ops when expo-notifications is not installed', async () => {
    const scheduler = createOptionalExpoNotificationScheduler();
    await expect(
      scheduler.schedule({
        id: 'follow-up:q1',
        fireAt: NOW,
        title: 'Needs follow-up',
        body: 'A sent quote has had no answer.',
      }),
    ).resolves.toBeUndefined();
    await expect(scheduler.cancel('follow-up:q1')).resolves.toBeUndefined();
  });
});
