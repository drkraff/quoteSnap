-- Soft-archive for quotes (catalog CAT-03 analog).
-- Lifecycle status (HIST-01) stays on quotes.status; visibility is is_archived.
-- GET /quotes lists active rows only. PATCH /quotes/:id/archive sets this flag.
-- Do not hard-delete server-backed quotes: hydrate would recreate them.

ALTER TABLE quotes
  ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_quotes_contractor_active
  ON quotes (contractor_id)
  WHERE is_archived = FALSE;

COMMENT ON COLUMN quotes.is_archived IS
  'Soft-archive. TRUE hides the quote from GET /quotes and the contractor Quotes list. Status is unchanged so a sent/approved quote can be archived without losing HIST-01. Client writes via PATCH /quotes/:id/archive, not PUT status.';
