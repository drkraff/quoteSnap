-- Add voice_job_id to quotes for polling voice processing status
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS voice_job_id VARCHAR(50);

-- Update status column comment to include ai_processing
COMMENT ON COLUMN quotes.status IS
  'ai_processing | draft_local | draft_queued | sent | approved | declined | expired | failed_send';

-- Add confidence column to quote_line_items for AI confidence scores
ALTER TABLE quote_line_items ADD COLUMN IF NOT EXISTS confidence REAL;

-- Add catalog_item_id to quote_line_items to track which catalog item each AI line item came from
ALTER TABLE quote_line_items ADD COLUMN IF NOT EXISTS catalog_item_id UUID REFERENCES catalog_items(id) ON DELETE SET NULL;
