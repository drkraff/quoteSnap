import { Model } from '@nozbe/watermelondb';
import { text, date } from '@nozbe/watermelondb/decorators';

export class ResumeCheckpoint extends Model {
  static table = 'resume_checkpoints';

  @text('contractor_id') contractorId!: string;
  @text('kind') kind!: string;
  @text('quote_id') quoteId!: string | null;
  @text('audio_uri') audioUri!: string | null;
  @date('updated_at') updatedAt!: Date;
}
