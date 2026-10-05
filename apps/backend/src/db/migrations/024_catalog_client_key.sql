-- POST /catalog idempotency key.
-- A crash after the insert and before the client stores the server id retries
-- the same (contractor_id, client_key). NULL keeps older clients inserting a
-- new row on every POST. This is not a money column.

ALTER TABLE catalog_items
  ADD COLUMN IF NOT EXISTS client_key VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_items_contractor_client_key
  ON catalog_items (contractor_id, client_key)
  WHERE client_key IS NOT NULL;

COMMENT ON COLUMN catalog_items.client_key IS
  'Client-generated idempotency key (local catalog row id). NULL for older clients. Unique per contractor so a lost POST /catalog response returns the existing row and does not insert another. Not a price.';
