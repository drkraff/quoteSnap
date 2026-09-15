-- Thin photo-on-line (design §6.1 / §8): stills as job evidence.
-- No media tables existed before this file. Voice audio uses R2 then is
-- deleted after Whisper+GPT+DB commit — that is not a photo store.
-- Photos are contractor-only, never public by default, never on the
-- customer PDF/SMS/approval allowlist. Video / OCR / Vision are out of scope.
-- Bytes live in private R2 (photos/{contractor_id}/{id}); this table is
-- metadata + attach target. line_client_id matches quote_line_items.client_id
-- (stable across DELETE+INSERT line replace). room_id matches quotes.rooms[].id.

CREATE TABLE IF NOT EXISTS quote_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  contractor_id UUID NOT NULL REFERENCES contractors(id),
  client_id UUID NOT NULL,
  line_client_id UUID,
  room_id UUID,
  r2_key TEXT NOT NULL,
  mime VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quote_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_quote_attachments_quote
  ON quote_attachments (quote_id, created_at ASC);

COMMENT ON TABLE quote_attachments IS
  'Thin photo-on-line stills. Contractor-only job evidence; not public; omit from customer PDF/SMS. r2_key is private object storage, not a CDN URL.';

COMMENT ON COLUMN quote_attachments.client_id IS
  'Mobile-generated UUID for idempotent retry (local URI queue → upload → stamp server id).';

COMMENT ON COLUMN quote_attachments.line_client_id IS
  'Optional attach to a draft line via quote_line_items.client_id. NULL = job-level (or room-only). Not an FK — line rows are replaced on PUT.';

COMMENT ON COLUMN quote_attachments.room_id IS
  'Optional attach to quotes.rooms[].id. NULL = ungrouped / job-level. Not an FK.';

COMMENT ON COLUMN quote_attachments.r2_key IS
  'Private R2 object key. Never expose as a public URL. Contractor GET streams bytes with auth.';

ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS client_id UUID;

COMMENT ON COLUMN quote_line_items.client_id IS
  'Client-stable line id so photos can attach across snapshot replace. NULL on older rows. Not a price.';
