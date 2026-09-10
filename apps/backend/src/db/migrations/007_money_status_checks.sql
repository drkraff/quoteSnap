-- A-14: CHECK constraints for money, quantity, and quote status.
-- Aligns with A-06 app-layer parsers:
--   catalog_items.unit_price_cents  >  0  (SKU prices; POST/PUT reject <= 0)
--   quotes.total_cents              >= 0  (empty / ai_processing quotes are 0)
--   quote_line_items.unit_price_cents >= 0  (free snapshot lines allowed)
--   quote_line_items.quantity       >= 1
-- Columns are INTEGER, so cents cannot be stored as fractional numbers.
-- Status allow-list is HIST-01 including voice + Phase 6 reserved names.
-- Keep in sync with apps/backend/src/quotes/statuses.ts.

-- Repair existing rows so ADD CONSTRAINT does not fail on dirty data.
UPDATE catalog_items
   SET unit_price_cents = 1
 WHERE unit_price_cents < 1;

UPDATE quotes
   SET total_cents = 0
 WHERE total_cents < 0;

UPDATE quote_line_items
   SET unit_price_cents = 0
 WHERE unit_price_cents < 0;

UPDATE quote_line_items
   SET quantity = 1
 WHERE quantity < 1;

UPDATE quotes
   SET status = 'draft_local'
 WHERE status NOT IN (
      'ai_processing',
      'ai_failed',
      'draft_local',
      'draft_queued',
      'sent',
      'approved',
      'declined',
      'expired',
      'failed_send'
    );

ALTER TABLE catalog_items
  ADD CONSTRAINT catalog_items_unit_price_cents_positive
  CHECK (unit_price_cents > 0);

ALTER TABLE quotes
  ADD CONSTRAINT quotes_total_cents_nonnegative
  CHECK (total_cents >= 0);

ALTER TABLE quotes
  ADD CONSTRAINT quotes_status_allowed
  CHECK (status IN (
    'ai_processing',
    'ai_failed',
    'draft_local',
    'draft_queued',
    'sent',
    'approved',
    'declined',
    'expired',
    'failed_send'
  ));

ALTER TABLE quote_line_items
  ADD CONSTRAINT quote_line_items_quantity_positive
  CHECK (quantity >= 1);

ALTER TABLE quote_line_items
  ADD CONSTRAINT quote_line_items_unit_price_cents_nonnegative
  CHECK (unit_price_cents >= 0);

COMMENT ON COLUMN quotes.status IS
  'HIST-01 allow-list (CHECK quotes_status_allowed): ai_processing | ai_failed | draft_local | draft_queued | sent | approved | declined | expired | failed_send. Client writes are draft_local | draft_queued only (A-06). Voice worker/reaper own ai_processing / ai_failed. Phase 6 owns sent / approved / declined / expired / failed_send.';

COMMENT ON COLUMN catalog_items.unit_price_cents IS
  'Integer cents. CHECK catalog_items_unit_price_cents_positive: unit_price_cents > 0.';

COMMENT ON COLUMN quotes.total_cents IS
  'Integer cents. CHECK quotes_total_cents_nonnegative: total_cents >= 0. Empty and ai_processing quotes are 0.';

COMMENT ON COLUMN quote_line_items.unit_price_cents IS
  'Snapshot integer cents (not a live catalog join). CHECK quote_line_items_unit_price_cents_nonnegative: unit_price_cents >= 0 (free lines allowed).';

COMMENT ON COLUMN quote_line_items.quantity IS
  'Integer units. CHECK quote_line_items_quantity_positive: quantity >= 1.';

-- Postgres catalog_items.server_id is a leftover from migration 002. It is
-- unused by the API (INSERT/SELECT never read or write it). Do not confuse it
-- with WatermelonDB catalog_items.server_id, which stores this row's `id`
-- after sync. Left in place — dropping it is a separate, coordinated change.
COMMENT ON COLUMN catalog_items.server_id IS
  'Unused Postgres leftover (DEFAULT gen_random_uuid()). Not the WatermelonDB catalog_items.server_id mapping; that client column stores this row''s id after sync. Do not SELECT or JOIN this column as a client key.';
