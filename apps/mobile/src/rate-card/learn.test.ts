import { buildRateCardLearnPayload, rateCardQueueEntityId } from './learn';
import { updatePrice, type LineItem } from '../utils/line-items';

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

  it('upserts an adhoc draft price-edit under the exact line name', () => {
    expect(
      buildRateCardLearnPayload(
        {
          name: '  Copper   Pipe  ',
          unit: 'foot',
          unitPriceCents: 5200,
          trade: 'plumbing',
        },
        catalog,
      ),
    ).toEqual({
      name: 'Copper Pipe',
      unit: 'foot',
      unitPriceCents: 5200,
      trade: 'plumbing',
      source: 'typed',
    });
  });

  it('does not borrow a similar catalog name when the line is adhoc', () => {
    const payload = buildRateCardLearnPayload(
      { name: 'Copper Pipes', unit: 'foot', unitPriceCents: 9900, trade: 'plumbing' },
      [{ id: 'local-pipe', serverId: 'srv-pipe', unit: 'each', tradeCategory: 'electrical' }],
    );
    expect(payload).toEqual({
      name: 'Copper Pipes',
      unit: 'foot',
      unitPriceCents: 9900,
      trade: 'plumbing',
      source: 'typed',
    });
    expect(payload?.name).not.toBe('Pipe Repair');
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
    expect(rateCardQueueEntityId({ name: '  COPPER   PIPE  ', unit: 'foot', trade: 'plumbing' })).toBe(
      'rate-card:copper pipe|foot|plumbing',
    );
    expect(
      rateCardQueueEntityId({ name: 'Copper Pipes', unit: 'foot', trade: 'plumbing' }),
    ).toBe('rate-card:copper pipes|foot|plumbing');
    expect(
      rateCardQueueEntityId({ name: 'Copper Pipe', unit: 'foot', trade: 'plumbing' }),
    ).not.toBe(rateCardQueueEntityId({ name: 'Copper Pipes', unit: 'foot', trade: 'plumbing' }));
  });
});

describe('draft price-edit → rate-card learn', () => {
  it('learns the exact adhoc line name after a typed price confirm', () => {
    const items: LineItem[] = [
      {
        catalogItemId: '',
        name: 'Copper Pipe',
        quantity: 14,
        unitPriceCents: null,
        unit: 'foot',
        priceSource: 'unknown',
      },
    ];
    const priced = updatePrice(items, 0, 5200);
    expect(priced[0]!.unitPriceCents).toBe(5200);
    expect(priced[0]!.priceSource).toBe('known');

    const payload = buildRateCardLearnPayload(
      {
        name: priced[0]!.name,
        unitPriceCents: priced[0]!.unitPriceCents!,
        catalogItemId: priced[0]!.catalogItemId,
        unit: priced[0]!.unit,
        trade: 'plumbing',
      },
      catalog,
    );
    expect(payload).toEqual({
      name: 'Copper Pipe',
      unit: 'foot',
      unitPriceCents: 5200,
      trade: 'plumbing',
      source: 'typed',
    });
    expect(rateCardQueueEntityId(payload!)).toBe('rate-card:copper pipe|foot|plumbing');
  });
});
