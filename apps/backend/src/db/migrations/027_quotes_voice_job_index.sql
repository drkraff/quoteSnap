-- GET /voice/status/:jobId polls `voice_job_id` every 1.5s. The column had no
-- index, so each poll scanned quotes. Most rows have a null job id.
CREATE INDEX IF NOT EXISTS idx_quotes_voice_job_id
  ON quotes (voice_job_id, contractor_id)
  WHERE voice_job_id IS NOT NULL;
