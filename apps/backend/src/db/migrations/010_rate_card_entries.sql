-- P0-A: per-contractor learned unit prices (rate card).
-- Key is exact normalized_name + unit + optional trade (trade_key).
-- Not a catalog SKU and not a quote snapshot — catalog_items stay CAT-*
-- identity-priced; quote_line_items stay per-quote snapshots (CONTEXT invariant 2).
-- Attach-on-match is P0-B; this table is storage + upsert only.

CREATE TABLE rate_card_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  normalized_name VARCHAR(200) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  trade VARCHAR(100),
  trade_key VARCHAR(100) NOT NULL GENERATED ALWAYS AS (COALESCE(trade, '')) STORED,
  unit_price_cents INTEGER NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 1,
  source VARCHAR(30) NOT NULL DEFAULT 'typed',
  price_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rate_card_entries_normalized_name_not_blank
    CHECK (normalized_name <> ''),
  CONSTRAINT rate_card_entries_display_name_not_blank
    CHECK (display_name <> ''),
  CONSTRAINT rate_card_entries_unit_price_cents_positive
    CHECK (unit_price_cents > 0),
  CONSTRAINT rate_card_entries_use_count_positive
    CHECK (use_count >= 1),
  CONSTRAINT rate_card_entries_source_allowed
    CHECK (source IN ('typed', 'confirmed'))
);

CREATE UNIQUE INDEX rate_card_entries_contractor_key
  ON rate_card_entries (contractor_id, normalized_name, unit, trade_key);

CREATE INDEX rate_card_entries_contractor
  ON rate_card_entries (contractor_id);

CREATE TRIGGER rate_card_entries_updated_at
  BEFORE UPDATE ON rate_card_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE rate_card_entries IS
  'Per-contractor learned unit prices. Unique on contractor_id + normalized_name + unit + trade_key (empty string when trade is NULL). Last confirmed unit_price_cents, use_count, optional price_history. Not joined into quotes or catalog; GPT must not read this to invent prices. P0-A upsert; P0-B exact attach.';

COMMENT ON COLUMN rate_card_entries.normalized_name IS
  'Lowercased, trimmed, collapsed-whitespace English name. Exact-match key with unit and trade_key. No embeddings.';

COMMENT ON COLUMN rate_card_entries.unit_price_cents IS
  'Integer cents. CHECK rate_card_entries_unit_price_cents_positive: unit_price_cents > 0.';

COMMENT ON COLUMN rate_card_entries.source IS
  'How the last price was learned: typed (draft price sheet) | confirmed (same path, explicit confirm).';

COMMENT ON COLUMN rate_card_entries.price_history IS
  'JSONB array of {unit_price_cents, recorded_at} capped in app code (newest last).';
