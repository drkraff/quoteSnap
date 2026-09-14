-- P0-C: persist signup hourly labor rate (and optional markup) on the contractor.
-- Catalog seed is no longer the only write of contractors.trade.
-- hourly_rate_cents is integer cents. Labor unit price = this rate (hours × hourly
-- is qty × unit_price on a unit=hour line). Markup is stored, never used to invent SKUs.

ALTER TABLE contractors
  ADD COLUMN hourly_rate_cents INTEGER,
  ADD COLUMN markup_percent INTEGER;

ALTER TABLE contractors
  ADD CONSTRAINT contractors_hourly_rate_cents_positive
    CHECK (hourly_rate_cents IS NULL OR hourly_rate_cents > 0);

ALTER TABLE contractors
  ADD CONSTRAINT contractors_markup_percent_range
    CHECK (markup_percent IS NULL OR (markup_percent >= 0 AND markup_percent <= 100));

COMMENT ON COLUMN contractors.hourly_rate_cents IS
  'Signup labor rate in integer cents. Voice attach uses this as computed unit price on hour lines. NULL until POST /onboarding/profile.';

COMMENT ON COLUMN contractors.markup_percent IS
  'Optional material markup percent from signup (0-100). Not used to invent SKU or material prices.';
