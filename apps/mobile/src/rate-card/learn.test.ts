import { buildRateCardLearnPayload, rateCardQueueEntityId } from './learn';

const catalog = [
  {
    id: 'local-pipe',
    serverId: 'srv-pipe',
    unit: 'foot',
    tradeCategory: 'plumbing',
  },
  {
    id: 'local-switch',
    serverId: 'srv-switch',
    unit: 'each',
    tradeCategory: 'electrical',
  },
];

describe('buildRateCardLearnPayload', () => {
  it('uses catalog unit and trade when the line has a local catalog id', () => {
    expect(
      buildRateCardLearnPayload(
        { name: 'Pipe Repair', catalogItemId: 'local-pipe', unitPriceCents: 5200 },
        catalog,
      ),
    ).toEqual({
      name: 'Pipe Repair',
      unit: 'foot',
      unitPriceCents: 5200,
      trade: 'plumbing',
      source: 'typed',
    });
  });

  it('matches catalog by serverId for AI snapshot catalogItemId values', () => {
    const payload = buildRateCardLearnPayload(
      { name: 'Switch Replacement', catalogItemId: 'srv-switch', unitPriceCents: 8500 },
      catalog,
    );
    expect(payload?.unit).toBe('each');
    expect(payload?.trade).toBe('electrical');
  });

  it('maps alias units from the line without inventing a missing unit', () => {
    expect(
      buildRateCardLearnPayload(
        { name: 'Pipe Repair', unit: 'per foot', unitPriceCents: 4500 },
        [],
      ),
    ).toEqual({
      name: 'Pipe Repair',
      unit: 'foot',
      unitPriceCents: 4500,
      source: 'typed',
    });

    expect(
      buildRateCardLearnPayload(
        { name: 'Mystery', catalogItemId: 'gone', unitPriceCents: 1000 },
        catalog,
      ),
    ).toBeNull();
  });

  it('returns null for blank names and non-positive cents', () => {
    expect(
      buildRateCardLearnPayload(
        { name: '  ', catalogItemId: 'local-pipe', unitPriceCents: 1000 },
        catalog,
      ),
    ).toBeNull();
    expect(
      buildRateCardLearnPayload(
        { name: 'Pipe Repair', catalogItemId: 'local-pipe', unitPriceCents: 0 },
        catalog,
      ),
    ).toBeNull();
  });
});

describe('rateCardQueueEntityId', () => {
  it('is stable for the exact name+unit+trade key', () => {
    expect(
      rateCardQueueEntityId({ name: 'Copper Pipe', unit: 'foot', trade: 'plumbing' }),
    ).toBe('rate-card:copper pipe|foot|plumbing');
    expect(rateCardQueueEntityId({ name: 'Copper Pipe', unit: 'foot' })).toBe(
      'rate-card:copper pipe|foot|',
    );
  });
});
