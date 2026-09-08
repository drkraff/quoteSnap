export const VALID_UNITS = ['each', 'hour', 'foot', 'sqft', 'job'] as const;

export type CatalogUnit = (typeof VALID_UNITS)[number];

/**
 * Display-style strings written by starter templates before POST/PUT
 * enforced VALID_UNITS. Keep in sync with apps/backend/src/catalog/units.ts.
 */
export const CATALOG_UNIT_ALIASES: Readonly<Record<string, CatalogUnit>> = {
  'per foot': 'foot',
  'per light': 'each',
  'per vent': 'each',
};

const VALID_UNIT_SET: ReadonlySet<string> = new Set(VALID_UNITS);

export function parseCatalogUnit(value: unknown): CatalogUnit | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (VALID_UNIT_SET.has(trimmed)) {
    return trimmed as CatalogUnit;
  }
  return CATALOG_UNIT_ALIASES[trimmed] ?? null;
}
