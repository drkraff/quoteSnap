import { catalogItemsFromSetupRates, LABOR_CATALOG_NAME } from './setup-rates';

describe('catalogItemsFromSetupRates', () => {
  it('turns the hourly rate and named setup prices into catalog items', () => {
    expect(catalogItemsFromSetupRates({
      hourlyRateCents: 1500,
      rates: [
        { name: 'Light switch', unit: 'each', unitPriceCents: 4000 },
        { name: 'Cable', unit: 'meter', unitPriceCents: 3000 },
      ],
    })).toEqual([
      { name: LABOR_CATALOG_NAME, unit: 'hour', unitPriceCents: 1500 },
      { name: 'Light switch', unit: 'each', unitPriceCents: 4000 },
      { name: 'Cable', unit: 'meter', unitPriceCents: 3000 },
    ]);
  });

  it('skips a blank name or a blank price and does not invent sq ft', () => {
    expect(catalogItemsFromSetupRates({
      hourlyRateCents: null,
      rates: [
        { name: '   ', unit: 'sqft', unitPriceCents: 3000 },
        { name: 'Cable', unit: null, unitPriceCents: null },
        { name: 'Cable', unitPriceCents: 0 },
        { name: 'Socket', unit: 'not-a-unit', unitPriceCents: 8000 },
      ],
    })).toEqual([
      { name: 'Socket', unit: 'each', unitPriceCents: 8000 },
    ]);
  });

  it('keeps the first price when the same name and unit are entered twice', () => {
    expect(catalogItemsFromSetupRates({
      hourlyRateCents: 1500,
      rates: [
        { name: 'labor', unit: 'hour', unitPriceCents: 9999 },
        { name: 'Cable', unit: 'meter', unitPriceCents: 3000 },
        { name: ' cable ', unit: 'meter', unitPriceCents: 100 },
      ],
    })).toEqual([
      { name: LABOR_CATALOG_NAME, unit: 'hour', unitPriceCents: 1500 },
      { name: 'Cable', unit: 'meter', unitPriceCents: 3000 },
    ]);
  });
});
