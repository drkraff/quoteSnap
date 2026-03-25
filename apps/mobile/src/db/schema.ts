import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'quotes',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'contractor_id', type: 'string' },
        { name: 'status', type: 'string' },
        // status: draft_local | draft_queued | sent | approved | declined | expired | failed_send
        { name: 'customer_phone', type: 'string', isOptional: true },
        { name: 'total_cents', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'sent_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'catalog_items',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'contractor_id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'unit', type: 'string' },
        { name: 'unit_price_cents', type: 'number' },
        // All prices as integer cents per architecture decision
        { name: 'trade_category', type: 'string', isOptional: true },
        { name: 'is_archived', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'drafts',
      columns: [
        { name: 'quote_id', type: 'string' },
        { name: 'line_items_json', type: 'string' },
        // JSON string: Array<{ catalogItemId: string, name: string, quantity: number, unitPriceCents: number }>
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'sync_queue_items',
      columns: [
        { name: 'entity_type', type: 'string' },
        // entity_type: quote | catalog_item | draft | audio
        { name: 'entity_id', type: 'string' },
        { name: 'action', type: 'string' },
        // action: create | update | delete
        { name: 'payload_json', type: 'string' },
        { name: 'status', type: 'string' },
        // status: pending | in_progress | failed | dead_letter
        { name: 'retry_count', type: 'number' },
        { name: 'last_error', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'next_retry_at', type: 'number', isOptional: true },
      ],
    }),
  ],
});
