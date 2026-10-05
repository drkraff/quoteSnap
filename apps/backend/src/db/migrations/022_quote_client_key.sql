-- POST /quotes idempotency key.
-- A crash after the insert and before the client stores the server id retries
-- the same (contractor_id, client_key). NULL keeps older clients inserting a
-- new row on every POST. This is not a money column. SYNC-06 is unchanged.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS client_key VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_contractor_client_key
  ON quotes (contractor_id, client_key)
  WHERE client_key IS NOT NULL;

COMMENT ON COLUMN quotes.client_key IS
  'Client-generated idempotency key (local quote id or a stored uuid). NULL for older clients. Unique per contractor so a lost POST /quotes response returns the existing row and does not insert another. Not a price.';
