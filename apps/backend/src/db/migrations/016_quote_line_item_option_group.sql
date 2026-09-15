-- Thin option groups (design §8 / §13): one base + one alternate per
-- undecided item (walk-in shower vs keep the tub). Not good/better/best
-- packages. No option_groups table — linkage is a shared UUID on the
-- snapshot row plus role base|alt. Selected-for-total is the base role
-- (swap roles to pick the other). NULL on both columns = ungrouped line.
-- Totals must exclude option_role = 'alt'. Never invent a price here.

ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS option_group_id UUID;

ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS option_role VARCHAR(10);

ALTER TABLE quote_line_items
  DROP CONSTRAINT IF EXISTS quote_line_items_option_pair;

ALTER TABLE quote_line_items
  ADD CONSTRAINT quote_line_items_option_pair
  CHECK (
    (option_group_id IS NULL AND option_role IS NULL)
    OR (
      option_group_id IS NOT NULL
      AND option_role IN ('base', 'alt')
    )
  );

CREATE INDEX IF NOT EXISTS idx_quote_line_items_option_group
  ON quote_line_items (quote_id, option_group_id)
  WHERE option_group_id IS NOT NULL;

COMMENT ON COLUMN quote_line_items.option_group_id IS
  'Shared UUID linking a thin base+alternate pair on this quote. Not an FK. NULL = ungrouped. Totals use the base (and ungrouped) lines only.';

COMMENT ON COLUMN quote_line_items.option_role IS
  'base = selected for the quote total; alt = visible alternate, excluded from total. NULL when option_group_id is NULL. Swap roles to pick the other option. Not a third selected flag.';
