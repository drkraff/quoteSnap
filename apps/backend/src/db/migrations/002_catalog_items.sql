CREATE TABLE catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  server_id UUID DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  trade_category VARCHAR(100),
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_catalog_items_contractor ON catalog_items(contractor_id);
CREATE INDEX idx_catalog_items_contractor_active ON catalog_items(contractor_id) WHERE is_archived = FALSE;

CREATE TRIGGER catalog_items_updated_at
  BEFORE UPDATE ON catalog_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
