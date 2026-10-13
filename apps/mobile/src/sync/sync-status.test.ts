import {
  SYNC_STATUS_FAILED,
  SYNC_STATUS_SAVED_ON_PHONE,
  SYNC_STATUS_SYNCED,
  syncStatusView,
} from './sync-status';

describe('syncStatusView', () => {
  it('says the phone has the quote when offline, even with an empty queue', () => {
    expect(
      syncStatusView({ online: false, pendingCount: 0, deadLetterCount: 0 }),
    ).toEqual({
      kind: 'saved_on_phone',
      message: SYNC_STATUS_SAVED_ON_PHONE,
      tappable: false,
    });
  });

  it('says the phone has the quote while a change is still pending', () => {
    expect(
      syncStatusView({ online: true, pendingCount: 2, deadLetterCount: 0 }).message,
    ).toBe('Saved on phone - will sync when online');
  });

  it('says synced when online and nothing is waiting', () => {
    expect(syncStatusView({ online: true, pendingCount: 0, deadLetterCount: 0 })).toEqual({
      kind: 'synced',
      message: SYNC_STATUS_SYNCED,
      tappable: false,
    });
  });

  it('says the change failed and can be retried, ahead of pending or offline', () => {
    const view = syncStatusView({ online: false, pendingCount: 3, deadLetterCount: 1 });
    expect(view).toEqual({
      kind: 'failed',
      message: SYNC_STATUS_FAILED,
      tappable: true,
    });
    expect(view.message).toBe("Couldn't sync - tap to retry");
    expect(view.message.toLowerCase()).not.toContain('queued');
  });
});
