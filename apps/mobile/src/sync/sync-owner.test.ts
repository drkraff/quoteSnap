import {
  queueItemBlockedForContractor,
  stampSyncOwner,
  syncOwnerIdFromPayload,
  payloadWithoutSyncOwner,
  SYNC_OWNER_KEY,
} from './sync-owner';

describe('sync queue owner', () => {
  it('stamps the signed-in contractor and strips that key before an API body', () => {
    const stamped = stampSyncOwner({ customerPhone: '555' }, 'contractor-a');
    expect(stamped[SYNC_OWNER_KEY]).toBe('contractor-a');
    expect(syncOwnerIdFromPayload(JSON.stringify(stamped))).toBe('contractor-a');
    expect(payloadWithoutSyncOwner(stamped)).toEqual({ customerPhone: '555' });
    expect(payloadWithoutSyncOwner(stamped)).not.toHaveProperty(SYNC_OWNER_KEY);
  });

  it('does not send another contractor's queued work, including while signed out', () => {
    expect(queueItemBlockedForContractor('contractor-a', 'contractor-b')).toBe(true);
    expect(queueItemBlockedForContractor('contractor-a', null)).toBe(true);
    expect(queueItemBlockedForContractor('contractor-a', 'contractor-a')).toBe(false);
    expect(queueItemBlockedForContractor(null, 'contractor-b')).toBe(false);
  });
});
