-- FAIL-04 / FAIL-05: distinguish Whisper (asr) vs GPT mapping vs reaper timeout.
-- Null on quotes that are not in (or recovered from) ai_failed.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS ai_failure_stage VARCHAR(20);

COMMENT ON COLUMN quotes.ai_failure_stage IS
  'asr | mapping | timeout — voice pipeline failure stage (FAIL-04/05); null when not failed';
