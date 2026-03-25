import { Model } from '@nozbe/watermelondb';
import { text, date } from '@nozbe/watermelondb/decorators';

export class Draft extends Model {
  static table = 'drafts';

  @text('quote_id') quoteId!: string;
  @text('line_items_json') lineItemsJson!: string;
  @text('notes') notes!: string | null;
  @date('updated_at') updatedAt!: Date;
}
