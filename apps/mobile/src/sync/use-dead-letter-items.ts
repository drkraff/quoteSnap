import { useEffect, useState } from 'react';
import { SyncQueueItem } from '../db/models/sync-queue-item';
import { deadLetterItemsQuery } from './sync-queue';

/** Live `dead_letter` rows — same `.observe()` pattern as Quotes and Catalog. */
export function useDeadLetterItems(): SyncQueueItem[] {
  const [items, setItems] = useState<SyncQueueItem[]>([]);

  useEffect(() => {
    const subscription = deadLetterItemsQuery().observe().subscribe(setItems);
    return () => subscription.unsubscribe();
  }, []);

  return items;
}
