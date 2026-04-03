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
}
