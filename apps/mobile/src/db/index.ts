import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import { Quote } from './models/quote';
import { CatalogItem } from './models/catalog-item';
import { Draft } from './models/draft';
import { SyncQueueItem } from './models/sync-queue-item';

const adapter = new SQLiteAdapter({
  schema,
  jsi: true,
  onSetUpError: (error) => {
    // eslint-disable-next-line no-console
    console.error('WatermelonDB setup error:', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Quote, CatalogItem, Draft, SyncQueueItem],
});
