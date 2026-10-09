-- Half an hour is 0.5. Migration 007 stored quantity as INTEGER with
-- CHECK (quantity >= 1), so a spoken half hour was rounded up to 1.
-- There is no one-hour minimum. Hours and other quantities may be fractional
-- (at most 2 decimal places, enforced in the app). Still must be > 0.

ALTER TABLE quote_line_items
  DROP CONSTRAINT IF EXISTS quote_line_items_quantity_positive;

ALTER TABLE quote_line_items
  ALTER COLUMN quantity TYPE numeric(12, 2)
  USING quantity::numeric;

ALTER TABLE quote_line_items
  ADD CONSTRAINT quote_line_items_quantity_positive
  CHECK (quantity > 0);

COMMENT ON COLUMN quote_line_items.quantity IS
  'Positive quantity, up to 2 decimal places. Half an hour is 0.5. There is no one-hour minimum. CHECK quote_line_items_quantity_positive: quantity > 0.';
