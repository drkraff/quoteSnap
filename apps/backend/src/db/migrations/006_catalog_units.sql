-- Normalize starter-SKU units that seed INSERT wrote outside VALID_UNITS
-- (each | hour | foot | sqft | job). Aliases: per foot → foot; per light /
-- per vent → each. Money columns are unchanged.
UPDATE catalog_items SET unit = 'foot' WHERE unit = 'per foot';
UPDATE catalog_items SET unit = 'each' WHERE unit IN ('per light', 'per vent');
