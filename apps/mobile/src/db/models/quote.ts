import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly } from '@nozbe/watermelondb/decorators';

export class Quote extends Model {
  static table = 'quotes';

  @text('server_id') serverId!: string | null;
  @text('contractor_id') contractorId!: string;
  @text('status') status!: string;
  @text('customer_phone') customerPhone!: string | null;
  @field('total_cents') totalCents!: number;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @date('sent_at') sentAt!: Date | null;
  @text('voice_job_id') voiceJobId!: string | null;
  @text('ai_failure_stage') aiFailureStage!: string | null;
  @field('is_archived') isArchived!: boolean | null;
  @text('private_note') privateNote!: string | null;
  @text('client_sentence') clientSentence!: string | null;
  @text('rooms_json') roomsJson!: string | null;
  @text('photos_json') photosJson!: string | null;
  // Local follow-up reminder. Not a server column. Do not enqueue these.
  @date('followed_up_at') followedUpAt!: Date | null;
  @field('follow_up_dismissed') followUpDismissed!: boolean | null;
  // Last observed server updatedAt (ISO). Not a server column. Do not enqueue.
  @text('server_revision') serverRevision!: string | null;
  // Token map of unsynced local edits. Not a server column. Do not enqueue.
  @text('local_dirty') localDirty!: string | null;
}
