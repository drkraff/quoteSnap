import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly } from '@nozbe/watermelondb/decorators';

export class SyncQueueItem extends Model {
  static table = 'sync_queue_items';

  @text('entity_type') entityType!: string;
  @text('entity_id') entityId!: string;
  @text('action') action!: string;
  @text('payload_json') payloadJson!: string;
  @text('status') status!: string;
  @field('retry_count') retryCount!: number;
  @text('last_error') lastError!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @date('next_retry_at') nextRetryAt!: Date | null;
}
