-- Thin rooms/zones (design §6.1 / §8): named capture groups on a quote.
-- No quote_rooms table — rooms live as JSON on the quote, lines point at a
-- room id (nullable = ungrouped / default single-memo). No photo or clip
-- columns. Room private notes are contractor-only. Never invent a price.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS rooms JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN quotes.rooms IS
  'Thin rooms/zones: JSON array of {id (uuid), name, privateNote?}. Empty array = single-memo / ungrouped. Contractor-only notes. Never invent prices.';

ALTER TABLE quote_line_items
  ADD COLUMN IF NOT EXISTS room_id UUID;

COMMENT ON COLUMN quote_line_items.room_id IS
  'Optional room/zone on this snapshot. Matches quotes.rooms[].id. NULL = ungrouped (default single-memo). Not an FK.';

CREATE INDEX IF NOT EXISTS idx_quote_line_items_room
  ON quote_line_items (quote_id, room_id)
  WHERE room_id IS NOT NULL;
