-- Direct DELETE of quote_snapshots is the same write-once violation as UPDATE.
-- ON DELETE CASCADE from quotes (and from contractors, which deletes quotes
-- first) still removes the row: the parent quote is already gone when that
-- delete reaches this trigger. There is no DELETE API.

CREATE OR REPLACE FUNCTION reject_quote_snapshot_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM quotes WHERE id = OLD.quote_id) THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'quote_snapshots are write-once';
END;
$$;

DROP TRIGGER IF EXISTS quote_snapshots_write_once_delete ON quote_snapshots;

CREATE TRIGGER quote_snapshots_write_once_delete
  BEFORE DELETE ON quote_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION reject_quote_snapshot_update();
