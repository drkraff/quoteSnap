export const VALID_UNITS = ['each', 'hour', 'meter', 'sqm', 'foot', 'sqft', 'job'] as const;

export type CatalogUnit = (typeof VALID_UNITS)[number];

/** Chips for a new line. Imperial stays valid for rows already stored as foot / sq ft. */
export const METRIC_UNITS = ['each', 'hour', 'meter', 'sqm', 'job'] as const;
export const IMPERIAL_UNITS = ['each', 'hour', 'foot', 'sqft', 'job'] as const;

export const UNIT_LABELS: Record<CatalogUnit, string> = {
  each: 'ea',
  hour: 'h',
  meter: 'm',
  sqm: 'm²',
  foot: 'ft',
  sqft: 'sq ft',
  job: 'job',
};

/** Customer document and line quantity. Cable length is ft. Labor is hours. */
const CUSTOMER_UNIT_LABELS: Record<CatalogUnit, string> = {
  each: 'ea',
  hour: 'hours',
  meter: 'm',
  sqm: 'm²',
  foot: 'ft',
  sqft: 'sq ft',
  job: 'job',
};

export function customerUnitLabel(unit: string | null | undefined): string {
  const parsed = parseCatalogUnit(unit);
  if (!parsed) return '';
  return CUSTOMER_UNIT_LABELS[parsed];
}

export function unitsForSystem(system: 'metric' | 'imperial'): readonly CatalogUnit[] {
  return system === 'imperial' ? IMPERIAL_UNITS : METRIC_UNITS;
}

/** Keep the row's stored unit visible even when it is the other system. */
export function unitChoices(
  system: 'metric' | 'imperial',
  current?: string | null,
): CatalogUnit[] {
  const choices: CatalogUnit[] = [...unitsForSystem(system)];
  const parsed = parseCatalogUnit(current);
  if (parsed && !choices.includes(parsed)) {
    choices.push(parsed);
  }
  return choices;
}

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
