-- Distinguish AI pipeline failure from SMS send failure (failed_send).
COMMENT ON COLUMN quotes.status IS
  'ai_processing | ai_failed | draft_local | draft_queued | sent | approved | declined | expired | failed_send';
