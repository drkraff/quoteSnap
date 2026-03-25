import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly } from '@nozbe/watermelondb/decorators';

export class CatalogItem extends Model {
  static table = 'catalog_items';

  @text('server_id') serverId!: string | null;
  @text('contractor_id') contractorId!: string;
  @text('name') name!: string;
  @text('unit') unit!: string;
  @field('unit_price_cents') unitPriceCents!: number;
  @text('trade_category') tradeCategory!: string | null;
  @field('is_archived') isArchived!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
