import { useEffect, useState } from 'react';
import { database } from '../db';
import { SyncQueueItem } from '../db/models/sync-queue-item';

const PENDING_STATUSES = new Set(['pending', 'failed', 'in_progress']);

export function useSyncQueueCounts(): { pendingCount: number; deadLetterCount: number } {
  const [counts, setCounts] = useState({ pendingCount: 0, deadLetterCount: 0 });

  useEffect(() => {
    const subscription = database
      .get<SyncQueueItem>('sync_queue_items')
      .query()
      .observe()
      .subscribe((items) => {
        let pendingCount = 0;
        let deadLetterCount = 0;
        for (const item of items) {
          if (item.status === 'dead_letter') deadLetterCount += 1;
          else if (PENDING_STATUSES.has(item.status)) pendingCount += 1;
        }
        setCounts({ pendingCount, deadLetterCount });
      });
    return () => subscription.unsubscribe();
  }, []);

  return counts;
}
