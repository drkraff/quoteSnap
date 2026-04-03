-- Add voice_job_id to quotes for polling voice processing status
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS voice_job_id VARCHAR(50);

-- Update status column comment to include ai_processing
COMMENT ON COLUMN quotes.status IS
  'ai_processing | draft_local | draft_queued | sent | approved | declined | expired | failed_send';
