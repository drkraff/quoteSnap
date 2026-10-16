-- 030. Sales tax can be 8.25. Migration 026 stored vat_percent as INTEGER,
-- so a fractional percent could not be saved.
--
-- This only widens the column to numeric(6, 3). It does not rewrite any
-- contractor row. 18 stays 18. Israel accounts keep the percent they
-- already have. The column default stays 18, matching 026, until a
-- contractor saves a country.

ALTER TABLE contractors
  DROP CONSTRAINT IF EXISTS contractors_vat_percent_range;

ALTER TABLE contractors
  ALTER COLUMN vat_percent TYPE numeric(6, 3)
  USING vat_percent::numeric;

ALTER TABLE contractors
  ADD CONSTRAINT contractors_vat_percent_range
  CHECK (vat_percent >= 0 AND vat_percent <= 100);

COMMENT ON COLUMN contractors.vat_percent IS
  'Tax percent on the customer document, from 0 to 100 with up to 3 decimal places (8.25). quotes.total_cents stays the ex-tax line sum. Existing rows keep the percent they already stored.';
