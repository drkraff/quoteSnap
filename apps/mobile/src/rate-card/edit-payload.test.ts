import { buildRateCardEditPayload, rateCardEditQueueEntityId } from './edit-payload';

const entry = {
  displayName: 'Copper Pipe',
  unit: 'foot',
  trade: 'plumbing',
};

describe('buildRateCardEditPayload', () => {
  it('keeps the existing name+unit+trade and only changes cents', () => {
    expect(buildRateCardEditPayload(entry, 5200)).toEqual({
      name: 'Copper Pipe',
      unit: 'foot',
      unitPriceCents: 5200,
      trade: 'plumbing',
      source: 'typed',
    });
  });

  it('does not invent a row when unit or cents are missing', () => {
    expect(buildRateCardEditPayload({ ...entry, unit: 'ea' }, 5200)).toBeNull();
    expect(buildRateCardEditPayload(entry, 0)).toBeNull();
    expect(buildRateCardEditPayload({ ...entry, displayName: '  ' }, 5200)).toBeNull();
  });

  it('omits blank trade so the empty trade_key row updates', () => {
    expect(buildRateCardEditPayload({ ...entry, trade: null }, 1000)).toEqual({
      name: 'Copper Pipe',
      unit: 'foot',
      unitPriceCents: 1000,
      source: 'typed',
    });
  });
});

describe('rateCardEditQueueEntityId', () => {
  it('matches the exact-match upsert queue key', () => {
    expect(rateCardEditQueueEntityId(entry)).toBe('rate-card:copper pipe|foot|plumbing');
  });
});
