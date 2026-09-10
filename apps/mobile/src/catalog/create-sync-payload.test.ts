import {
  catalogCreateSyncPayload,
  catalogUpdateFromQueuePayload,
} from './create-sync-payload';

describe('catalogCreateSyncPayload', () => {
  const fields = { name: 'Custom Valve', unit: 'each', unitPriceCents: 12500 };

  it('includes contractor tradeCategory on catalog create (A-15)', () => {
    expect(catalogCreateSyncPayload(fields, 'plumbing')).toEqual({
      name: 'Custom Valve',
      unit: 'each',
      unitPriceCents: 12500,
      tradeCategory: 'plumbing',
    });
  });

  it('omits tradeCategory when the contractor trade is unset', () => {
    expect(catalogCreateSyncPayload(fields, null)).toEqual(fields);
    expect(catalogCreateSyncPayload(fields, '   ')).toEqual(fields);
  });
});

describe('catalogUpdateFromQueuePayload', () => {
  it('does not send tradeCategory on name/unit/price edits', () => {
    expect(
      catalogUpdateFromQueuePayload({
        name: 'Copper pipe',
        unit: 'per foot',
        unitPriceCents: 1800,
      }),
    ).toEqual({
      name: 'Copper pipe',
      unit: 'foot',
      unitPriceCents: 1800,
    });
  });

  it('forwards tradeCategory when the queued update included it', () => {
    expect(
      catalogUpdateFromQueuePayload({
        name: 'Copper pipe',
        unit: 'foot',
        unitPriceCents: 1800,
        tradeCategory: 'plumbing',
      }),
    ).toEqual({
      name: 'Copper pipe',
      unit: 'foot',
      unitPriceCents: 1800,
      tradeCategory: 'plumbing',
    });
  });
});
