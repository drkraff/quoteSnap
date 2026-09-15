-- Draft quality flags (design §7). Voice attach already computes
-- spoken | catalog | learned | computed | unknown in memory; this column
-- persists that onto the quote_line_items snapshot so hydrate/draft UI
-- can badge it. `known` is a contractor-typed/confirmed price on review.
-- NULL on pre-migration rows: infer known if unit_price_cents > 0 else unknown.
-- Never invent a price here — source is provenance only.

ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS price_source VARCHAR(20);

ALTER TABLE quote_line_items
  DROP CONSTRAINT IF EXISTS quote_line_items_price_source_allowed;

ALTER TABLE quote_line_items
  ADD CONSTRAINT quote_line_items_price_source_allowed
  CHECK (
    price_source IS NULL OR price_source IN (
      'spoken',
      'catalog',
      'learned',
      'computed',
      'unknown',
      'known'
    )
  );

COMMENT ON COLUMN quote_line_items.price_source IS
  'Snapshot price provenance from attach or contractor edit: spoken | catalog | learned | computed | unknown | known. UI maps catalog/learned/known → Known (quiet). NULL on old rows: infer known if unit_price_cents > 0 else unknown. Not a live catalog join. Never invent a price.';
