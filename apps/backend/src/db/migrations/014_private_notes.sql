-- Private notes (design hard rule #9): contractor-only. Never copy these
-- columns into a customer PDF, SMS, or approval-page payload. Phase 6 must
-- use toCustomerQuotePayload (allowlist), not a quote-row spread.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS private_note TEXT;

ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS private_note TEXT;

COMMENT ON COLUMN quotes.private_note IS
  'Contractor-only job note. Internal. Never include on customer PDF/SMS/approval page.';

COMMENT ON COLUMN quote_line_items.private_note IS
  'Contractor-only line note. Internal. Never include on customer PDF/SMS/approval page.';
