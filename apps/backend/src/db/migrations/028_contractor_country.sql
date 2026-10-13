-- Country chosen at onboarding. Additive only.
--
-- Existing contractors stay NULL. This file does not change any existing
-- row, including currency, units, and tax percent from
-- 026_locale_and_customer_document.sql.
-- NULL means "no country chosen yet" and keeps those earlier values.
-- US and IL are the only codes. A later profile save sets the code.

ALTER TABLE contractors
  ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);

ALTER TABLE contractors
  DROP CONSTRAINT IF EXISTS contractors_country_code_allowed;
ALTER TABLE contractors
  ADD CONSTRAINT contractors_country_code_allowed
  CHECK (country_code IS NULL OR country_code IN ('US', 'IL'));

COMMENT ON COLUMN contractors.country_code IS
  'US or IL from onboarding. Null on rows that existed before this column. Does not rewrite other contractor columns.';
