-- A frozen quote cannot return to a draft or voice status, and its line
-- items are write-once. Frozen statuses match FROZEN_QUOTE_STATUSES:
-- sent, approved, declined, expired, failed_send.
--
-- These are BEFORE ROW triggers, not deferred constraint triggers. A quote
-- save writes the new lines and then sets status. The line trigger must see
-- the status that is current at each statement. Deferring it to COMMIT would
-- reject that save, because the status would already be sent.
--
-- Deleting the quote (or the contractor, which deletes the quote first)
-- still cascades the lines away: the parent quote is already gone when that
-- delete reaches the line trigger. There is no quote DELETE API.

CREATE OR REPLACE FUNCTION reject_frozen_quote_status_thaw()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('sent', 'approved', 'declined', 'expired', 'failed_send')
     AND NEW.status IN ('ai_processing', 'ai_failed', 'draft_local', 'draft_queued')
     AND NEW.status IS DISTINCT FROM OLD.status
  THEN
    RAISE EXCEPTION 'frozen quote cannot return to draft or voice'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotes_status_transition ON quotes;

CREATE TRIGGER quotes_status_transition
  BEFORE UPDATE OF status ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION reject_frozen_quote_status_thaw();

COMMENT ON FUNCTION reject_frozen_quote_status_thaw() IS
  'Rejects sent/approved/declined/expired/failed_send moving back to ai_processing, ai_failed, draft_local, or draft_queued. Forward moves (sent to approved, declined, or expired) stay allowed.';

CREATE OR REPLACE FUNCTION reject_frozen_quote_line_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO parent_status FROM quotes WHERE id = OLD.quote_id;
    IF parent_status IS NULL THEN
      RETURN OLD;
    END IF;
    IF parent_status IN ('sent', 'approved', 'declined', 'expired', 'failed_send') THEN
      RAISE EXCEPTION 'quote line items are write-once after send'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  SELECT status INTO parent_status FROM quotes WHERE id = NEW.quote_id;
  IF parent_status IN ('sent', 'approved', 'declined', 'expired', 'failed_send') THEN
    RAISE EXCEPTION 'quote line items are write-once after send'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.quote_id IS DISTINCT FROM OLD.quote_id THEN
    SELECT status INTO parent_status FROM quotes WHERE id = OLD.quote_id;
    IF parent_status IN ('sent', 'approved', 'declined', 'expired', 'failed_send') THEN
      RAISE EXCEPTION 'quote line items are write-once after send'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quote_line_items_frozen ON quote_line_items;

CREATE TRIGGER quote_line_items_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON quote_line_items
  FOR EACH ROW
  EXECUTE FUNCTION reject_frozen_quote_line_write();

COMMENT ON FUNCTION reject_frozen_quote_line_write() IS
  'Line items on a sent, approved, declined, expired, or failed_send quote cannot be inserted, updated, or deleted. A cascade delete is allowed once the parent quote is gone.';
