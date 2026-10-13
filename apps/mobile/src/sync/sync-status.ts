/**
 * Contractor-facing sync sentence. Queue status stays in Watermelon;
 * this only chooses the words on screen.
 */

export const SYNC_STATUS_SAVED_ON_PHONE = 'Saved on phone - will sync when online';
export const SYNC_STATUS_SYNCED = 'Synced';
export const SYNC_STATUS_FAILED = "Couldn't sync - tap to retry";

export type SyncStatusKind = 'saved_on_phone' | 'synced' | 'failed';

export type SyncStatusView = {
  kind: SyncStatusKind;
  message: string;
  tappable: boolean;
};

export function syncStatusView(input: {
  online: boolean;
  pendingCount: number;
  deadLetterCount: number;
}): SyncStatusView {
  if (input.deadLetterCount > 0) {
    return {
      kind: 'failed',
      message: SYNC_STATUS_FAILED,
      tappable: true,
    };
  }
  if (!input.online || input.pendingCount > 0) {
    return {
      kind: 'saved_on_phone',
      message: SYNC_STATUS_SAVED_ON_PHONE,
      tappable: false,
    };
  }
  return {
    kind: 'synced',
    message: SYNC_STATUS_SYNCED,
    tappable: false,
  };
}
