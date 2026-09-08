import { OFFLINE_TRADE_TEMPLATES } from '../data/trade-templates';
import {
  CATALOG_UNIT_ALIASES,
  VALID_UNITS,
  parseCatalogUnit,
} from './units';

describe('parseCatalogUnit', () => {
  it('accepts the five units offered by ItemFormSheet', () => {
    for (const unit of VALID_UNITS) {
      expect(parseCatalogUnit(unit)).toBe(unit);
    }
  });

  it('maps seeded alias units onto a form pill so CAT-02 save sends a valid unit', () => {
    expect(parseCatalogUnit('per foot')).toBe('foot');
    expect(parseCatalogUnit('per light')).toBe('each');
    expect(parseCatalogUnit('per vent')).toBe('each');
    expect(parseCatalogUnit('  per foot  ')).toBe('foot');
  });

  it('returns null for unknown units so the form requires a pill', () => {
    expect(parseCatalogUnit('ea')).toBeNull();
    expect(parseCatalogUnit('per hour')).toBeNull();
    expect(parseCatalogUnit('')).toBeNull();
    expect(parseCatalogUnit('FOOT')).toBeNull();
    expect(parseCatalogUnit(undefined)).toBeNull();
  });

  it('only aliases onto members of VALID_UNITS', () => {
    for (const canonical of Object.values(CATALOG_UNIT_ALIASES)) {
      expect(VALID_UNITS).toContain(canonical);
    }
  });
});

describe('OFFLINE_TRADE_TEMPLATES units', () => {
  it('uses only canonical units so offline seed rows are editable', () => {
    for (const items of Object.values(OFFLINE_TRADE_TEMPLATES)) {
      for (const item of items) {
        expect(parseCatalogUnit(item.unit)).toBe(item.unit);
      }
    }
  });
});
