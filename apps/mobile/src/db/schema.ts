import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 7,
  tables: [
    tableSchema({
      name: 'quotes',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'contractor_id', type: 'string' },
        { name: 'status', type: 'string' },
        // status: ai_processing | ai_failed | draft_local | draft_queued | sent | approved | declined | expired | failed_send
        { name: 'customer_phone', type: 'string', isOptional: true },
        { name: 'total_cents', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'sent_at', type: 'number', isOptional: true },
        { name: 'voice_job_id', type: 'string', isOptional: true },
        // Soft-archive (HIST-05). Optional so v2→v3 SQLite ADD COLUMN can be null
        // on existing rows; treat null as active (not archived).
        { name: 'is_archived', type: 'boolean', isOptional: true },
        // Contractor-only (design #9). Never copy into a customer PDF/SMS payload.
        { name: 'private_note', type: 'string', isOptional: true },
        // Customer-facing scope / assumptions (design §8). Include on PDF/SMS.
        { name: 'client_sentence', type: 'string', isOptional: true },
        // Thin rooms/zones (design §6.1 / §8). JSON: [{id, name, privateNote?}].
        // Empty/null = single-memo / ungrouped. Line roomId lives in draft JSON.
        { name: 'rooms_json', type: 'string', isOptional: true },
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
        // JSON: name, qty, unitPriceCents, optional unit/confidence/privateNote/priceSource/optionGroupId/optionRole/roomId.
        // Leftover unused v1 column. Do not store private notes here —
        // job notes live on quotes.private_note; line notes in line_items_json.
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'sync_queue_items',
      columns: [
        { name: 'entity_type', type: 'string' },
        // entity_type: quote | catalog_item | draft | audio | onboarding | rate_card
        { name: 'entity_id', type: 'string' },
        { name: 'action', type: 'string' },
        // action: create | update | delete | seed
        { name: 'payload_json', type: 'string' },
        { name: 'status', type: 'string' },
        // status: pending | in_progress | failed | dead_letter | needs_review
        { name: 'retry_count', type: 'number' },
        { name: 'last_error', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'next_retry_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'resume_checkpoints',
      columns: [
        // FAIL-07: one local row per contractor while recording or editing a draft.
        // Not synced. Hydrate must not touch this table.
        { name: 'contractor_id', type: 'string', isIndexed: true },
        { name: 'kind', type: 'string' },
        // kind: voice_recording | draft_edit
        { name: 'quote_id', type: 'string', isOptional: true },
        { name: 'audio_uri', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});
