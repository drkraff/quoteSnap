-- P0-B: persist spoken/catalog unit on quote snapshots so rate-card
-- exact attach (name+unit+trade) can round-trip. Nullable — older rows
-- and lines with no spoken unit stay NULL. Not a live catalog join.

ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS unit VARCHAR(50);

COMMENT ON COLUMN quote_line_items.unit IS
  'Optional snapshot unit (each|hour|foot|sqft|job). Spoken or catalog at extract time. NULL when unknown. Not invented.';
