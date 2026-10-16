-- Beta tester notes. Additive. Does not change quotes, catalog, or contractors.

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  rating SMALLINT,
  screen TEXT,
  quote_id UUID,
  app_version TEXT,
  platform TEXT,
  screenshot BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT feedback_message_not_blank CHECK (char_length(btrim(message)) > 0),
  CONSTRAINT feedback_rating_range CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  CONSTRAINT feedback_screenshot_max CHECK (
    screenshot IS NULL OR octet_length(screenshot) <= 1048576
  )
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_contractor ON feedback (contractor_id);

COMMENT ON TABLE feedback IS
  'In-app notes from beta testers. Not a customer message and not part of the quote.';

COMMENT ON COLUMN feedback.quote_id IS
  'Quote the tester was looking at. Not a foreign key: the id may be a local draft that has not synced.';

COMMENT ON COLUMN feedback.screenshot IS
  'Optional PNG or JPEG of the current screen. At most 1MB.';
