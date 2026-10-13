-- Contractor locale (Israel defaults) and the customer-facing quote fields
-- the PDF needs that are not already columns.
--
-- currency_code / unit_system / vat_percent live on the contractor so a
-- second device and the approval snapshot see the same choice. Existing
-- rows take ILS, metric, and 18. Cents are not converted.
--
-- quotes.customer_name and quotes.exclusions are customer-facing, like
-- client_sentence. They are not private notes. Quote number and the
-- valid-until date are derived from the id and the issue date, so they
-- do not need columns. The approval token stays a hash on the server;
-- the device keeps the raw link locally.

ALTER TABLE contractors
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) NOT NULL DEFAULT 'ILS',
  ADD COLUMN IF NOT EXISTS unit_system VARCHAR(16) NOT NULL DEFAULT 'metric',
  ADD COLUMN IF NOT EXISTS vat_percent INTEGER NOT NULL DEFAULT 18;

ALTER TABLE contractors
  DROP CONSTRAINT IF EXISTS contractors_currency_code_allowed;
ALTER TABLE contractors
  ADD CONSTRAINT contractors_currency_code_allowed
  CHECK (currency_code IN ('ILS', 'USD'));

ALTER TABLE contractors
  DROP CONSTRAINT IF EXISTS contractors_unit_system_allowed;
ALTER TABLE contractors
  ADD CONSTRAINT contractors_unit_system_allowed
  CHECK (unit_system IN ('metric', 'imperial'));

ALTER TABLE contractors
  DROP CONSTRAINT IF EXISTS contractors_vat_percent_range;
ALTER TABLE contractors
  ADD CONSTRAINT contractors_vat_percent_range
  CHECK (vat_percent >= 0 AND vat_percent <= 100);

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS customer_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS exclusions TEXT;

COMMENT ON COLUMN contractors.currency_code IS
  'Display currency. Default ILS. Does not convert stored cents.';
COMMENT ON COLUMN contractors.unit_system IS
  'metric shows meter and m² on new lines. imperial shows foot and sq ft. Stored units are kept.';
COMMENT ON COLUMN contractors.vat_percent IS
  'VAT percent on the customer document. quotes.total_cents stays the ex-VAT line sum.';
COMMENT ON COLUMN quotes.customer_name IS
  'Customer name on the PDF and approval page. Null when blank.';
COMMENT ON COLUMN quotes.exclusions IS
  'Customer-facing Not included section. Null when blank. Not a private note.';
