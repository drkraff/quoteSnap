-- Design §5: old-quote import learns into the contractor's rate card.
-- source=imported is the same upsert path as typed/confirmed (P0-A / PR #44).
-- Does not rewrite catalog_items or quote_line_items snapshots.

ALTER TABLE rate_card_entries
  DROP CONSTRAINT rate_card_entries_source_allowed;

ALTER TABLE rate_card_entries
  ADD CONSTRAINT rate_card_entries_source_allowed
    CHECK (source IN ('typed', 'confirmed', 'imported'));

COMMENT ON COLUMN rate_card_entries.source IS
  'How the last price was learned: typed (draft price sheet) | confirmed (same path, explicit confirm) | imported (literal lines from an old quote). Never an AI-guessed SKU price.';
