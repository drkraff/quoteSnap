-- Client sentence (design §8): customer-facing scope at the top of the PDF.
-- Distinct from quotes.private_note (contractor-only; never on PDF/SMS).
-- Voice extract assumptions[] are joined into this column; the contractor
-- can edit the text on the draft. Phase 6 must include it in
-- toCustomerQuotePayload (allowlist).

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS client_sentence TEXT;

COMMENT ON COLUMN quotes.client_sentence IS
  'Customer-facing quote note (assumptions / exclusions). Include on PDF/SMS/approval. Never treat as a private note.';
