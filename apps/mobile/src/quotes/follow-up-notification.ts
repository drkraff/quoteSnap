/**
 * One local reminder at sent_at + N days. No FCM and no push server.
 * Cancel when the customer has answered, the quote was archived, or the
 * contractor followed up / dismissed / snoozed. Already-due quotes stay on
 * the in-app list; this does not schedule a second alarm after follow-up.
 *
 * The default scheduler no-ops. expo-notifications is not installed, so a
 * device banner needs that package, a native rebuild, and notification
 * permission. Tests drive a fake scheduler.
 */

import {
  FOLLOW_UP_AFTER_DAYS,
  FOLLOW_UP_DAY_MS,
  FOLLOW_UP_FILTER_LABEL,
  parseFollowUpInstant,
  presentCustomerText,
  type FollowUpQuoteInput,
} from './follow-up';

export type FollowUpNotificationPlan =
  | { action: 'schedule'; fireAt: Date; title: string; body: string }
  | { action: 'cancel' }
  | { action: 'none' };

export type LocalNotificationRequest = {
  id: string;
  fireAt: Date;
  title: string;
  body: string;
};

export type LocalNotificationScheduler = {
  schedule(request: LocalNotificationRequest): Promise<void>;
  cancel(id: string): Promise<void>;
};

const LEAVE_ALONE_STATUSES = new Set([
  'draft_local',
  'draft_queued',
  'ai_processing',
  'ai_failed',
]);

export function followUpNotificationId(quoteId: string): string {
  return `follow-up:${quoteId}`;
}

export function followUpNotificationBody(customerName: string | null | undefined): string {
  const name = presentCustomerText(customerName);
  if (name) return `Follow up with ${name}.`;
  return 'A sent quote has had no answer.';
}

/**
 * Schedule only while the fire time is still in the future and nothing has
 * snoozed or answered the quote. Cancel a pending alarm when it must not fire.
 */
export function planFollowUpNotification(
  quote: FollowUpQuoteInput & { customerName?: string | null },
  now: Date,
  afterDays: number = FOLLOW_UP_AFTER_DAYS,
): FollowUpNotificationPlan {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return { action: 'none' };
  if (LEAVE_ALONE_STATUSES.has(quote.status) && quote.isArchived !== true) {
    return { action: 'none' };
  }

  const windowMs =
    typeof afterDays === 'number' && Number.isFinite(afterDays) && afterDays > 0
      ? afterDays * FOLLOW_UP_DAY_MS
      : null;
  const sentMs = parseFollowUpInstant(quote.sentAt);
  const followedUpMs = parseFollowUpInstant(quote.followedUpAt);
  const snoozedUntilMs = parseFollowUpInstant(quote.snoozedUntil);
  const dismissed = quote.dismissed === true || quote.followUpDismissed === true;
  const nowMs = now.getTime();
  const snoozeActive = snoozedUntilMs != null && nowMs < snoozedUntilMs;

  const mustCancel =
    quote.isArchived === true
    || dismissed
    || followedUpMs != null
    || snoozeActive
    || quote.status === 'approved'
    || quote.status === 'declined'
    || quote.status === 'expired';

  if (mustCancel) return { action: 'cancel' };
  if (quote.status !== 'sent' || sentMs == null || windowMs == null) return { action: 'none' };

  const fireMs = sentMs + windowMs;
  if (fireMs <= nowMs) return { action: 'none' };

  return {
    action: 'schedule',
    fireAt: new Date(fireMs),
    title: FOLLOW_UP_FILTER_LABEL,
    body: followUpNotificationBody(quote.customerName),
  };
}

export async function applyFollowUpNotification(
  scheduler: LocalNotificationScheduler,
  quoteId: string,
  plan: FollowUpNotificationPlan,
): Promise<void> {
  if (quoteId.trim() === '') return;
  const id = followUpNotificationId(quoteId);
  if (plan.action === 'schedule') {
    await scheduler.schedule({
      id,
      fireAt: plan.fireAt,
      title: plan.title,
      body: plan.body,
    });
    return;
  }
  if (plan.action === 'cancel') {
    await scheduler.cancel(id);
  }
}

/**
 * No native module. schedule and cancel resolve without prompting or throwing.
 * A device build that adds expo-notifications can replace this scheduler.
 */
export function createOptionalExpoNotificationScheduler(): LocalNotificationScheduler {
  return {
    async schedule() {
      return undefined;
    },
    async cancel() {
      return undefined;
    },
  };
}
