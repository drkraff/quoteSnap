-- SMS-02 / SMS-04 / SMS-05: write-once customer snapshot and approval token.
-- The payload is the toCustomerQuotePayload allowlist captured at send.
-- The approval page reads this row, not live quote_line_items.
-- UPDATE is rejected so a later catalog or draft edit cannot rewrite it.
-- DELETE is allowed so quote/contractor cascades still work (there is no
-- DELETE API). Do not add an updated_at trigger.

CREATE TABLE quote_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL UNIQUE REFERENCES quotes(id) ON DELETE CASCADE,
  contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  contractor_display_name VARCHAR(100),
  contractor_trade VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quote_snapshots_payload_object CHECK (jsonb_typeof(payload) = 'object')
);

COMMENT ON TABLE quote_snapshots IS
  'SMS-02 write-once customer payload (toCustomerQuotePayload) plus contractor name/trade at send. Approval page (SMS-04) reads this row, not live lines. UPDATE is rejected.';

COMMENT ON COLUMN quote_snapshots.payload IS
  'Customer allowlist JSON: customerPhone, totalCents, clientSentence, lineItems (name, quantity, unitPriceCents, unit, roomName). No private notes, unselected alts, photos, or price_source. Blank prices are null, never invented.';

COMMENT ON COLUMN quote_snapshots.contractor_display_name IS
  'Contractor display name frozen at send. Null stays null. Not a live contractors join.';

COMMENT ON COLUMN quote_snapshots.contractor_trade IS
  'Contractor trade frozen at send. Null stays null.';

CREATE OR REPLACE FUNCTION reject_quote_snapshot_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'quote_snapshots are write-once';
END;
$$;

DROP TRIGGER IF EXISTS quote_snapshots_write_once ON quote_snapshots;

CREATE TRIGGER quote_snapshots_write_once
  BEFORE UPDATE ON quote_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION reject_quote_snapshot_update();

CREATE TABLE quote_approval_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL UNIQUE REFERENCES quotes(id) ON DELETE CASCADE,
  snapshot_id UUID NOT NULL REFERENCES quote_snapshots(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quote_approval_tokens_expires
  ON quote_approval_tokens (expires_at);

COMMENT ON COLUMN quote_approval_tokens.token_hash IS
  'SHA-256 hex of the raw approval token (32 random bytes, base64url). The raw token is returned once and is never stored.';

COMMENT ON COLUMN quote_approval_tokens.expires_at IS
  'SMS-10 TTL from send (QUOTE_APPROVAL_TTL_MS, default 72h). pg-boss marks still-sent quotes expired; lookup also treats past expires_at as expired.';

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ;

COMMENT ON COLUMN quotes.approved_at IS
  'SMS-06 timestamp of the first customer approval. Not rewritten by a second tap. Null until approved.';

COMMENT ON COLUMN quotes.declined_at IS
  'Timestamp of the first customer decline. Not rewritten by a second tap. Null until declined.';
