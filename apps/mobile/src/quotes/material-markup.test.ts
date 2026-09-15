import {
  centsToDollarText,
  computeMaterialSellCents,
  isLaborLine,
  parseSignupMarkupPercent,
  resolveDraftPriceEdit,
} from './material-markup';

describe('computeMaterialSellCents / parseSignupMarkupPercent', () => {
  it('rounds integer cents from cost × (1 + markup/100)', () => {
    expect(computeMaterialSellCents(4000, 20)).toBe(4800);
    expect(computeMaterialSellCents(333, 15)).toBe(383);
    expect(computeMaterialSellCents(1000, 0)).toBe(1000);
  });

  it('does not invent a sell price when cost or markup is missing', () => {
    expect(computeMaterialSellCents(null, 20)).toBeNull();
    expect(computeMaterialSellCents(undefined, 20)).toBeNull();
    expect(computeMaterialSellCents(0, 20)).toBeNull();
    expect(computeMaterialSellCents(4000, null)).toBeNull();
    expect(computeMaterialSellCents(4000, undefined)).toBeNull();
    expect(computeMaterialSellCents(4000, -1)).toBeNull();
    expect(computeMaterialSellCents(4000, 101)).toBeNull();
    expect(computeMaterialSellCents(4000, 20.5)).toBeNull();
  });

  it('accepts signup markup 0-100 and rejects anything else', () => {
    expect(parseSignupMarkupPercent(0)).toBe(0);
    expect(parseSignupMarkupPercent(20)).toBe(20);
    expect(parseSignupMarkupPercent(100)).toBe(100);
    expect(parseSignupMarkupPercent(null)).toBeNull();
    expect(parseSignupMarkupPercent(101)).toBeNull();
    expect(parseSignupMarkupPercent(15.5)).toBeNull();
  });
});

describe('isLaborLine', () => {
  it('treats hour-unit lines as labor', () => {
    expect(isLaborLine('hour')).toBe(true);
    expect(isLaborLine('each')).toBe(false);
    expect(isLaborLine('foot')).toBe(false);
    expect(isLaborLine(null)).toBe(false);
  });
});

describe('centsToDollarText', () => {
  it('formats filled cents and leaves blank/zero empty', () => {
    expect(centsToDollarText(4800)).toBe('48.00');
    expect(centsToDollarText(null)).toBe('');
    expect(centsToDollarText(0)).toBe('');
  });
});

describe('resolveDraftPriceEdit', () => {
  const stored = {
    costCents: null as number | null,
    markupPercent: 20 as number | null,
    unitPriceCents: 17500 as number | null,
    unitPriceManuallyEdited: false,
    costOrMarkupEdited: false,
    existingPriceSource: 'catalog' as const,
  };

  it('recalculates displayed unit price when both cost and markup are known', () => {
    expect(
      resolveDraftPriceEdit({
        costCents: 4000,
        markupPercent: 20,
        unitPriceCents: null,
        unitPriceManuallyEdited: false,
        costOrMarkupEdited: true,
      }),
    ).toEqual({ unitPriceCents: 4800, priceSource: 'computed' });
  });

  it('leaves unit price blank/unknown when cost is missing', () => {
    expect(
      resolveDraftPriceEdit({
        costCents: null,
        markupPercent: 20,
        unitPriceCents: 17500,
        unitPriceManuallyEdited: false,
        costOrMarkupEdited: true,
        existingPriceSource: 'catalog',
      }),
    ).toEqual({ unitPriceCents: null, priceSource: 'unknown' });
  });

  it('leaves unit price blank/unknown when markup is missing', () => {
    expect(
      resolveDraftPriceEdit({
        costCents: 4000,
        markupPercent: null,
        unitPriceCents: null,
        unitPriceManuallyEdited: false,
        costOrMarkupEdited: true,
      }),
    ).toEqual({ unitPriceCents: null, priceSource: 'unknown' });
  });

  it('does not treat cost as a sell price without markup', () => {
    const resolved = resolveDraftPriceEdit({
      costCents: 4000,
      markupPercent: null,
      unitPriceCents: null,
      unitPriceManuallyEdited: false,
      costOrMarkupEdited: true,
    });
    expect(resolved.unitPriceCents).toBeNull();
    expect(resolved.priceSource).toBe('unknown');
    expect(resolved.unitPriceCents).not.toBe(4000);
  });

  it('computes with markup 0 as sell = cost', () => {
    expect(
      resolveDraftPriceEdit({
        costCents: 4000,
        markupPercent: 0,
        unitPriceCents: null,
        unitPriceManuallyEdited: false,
        costOrMarkupEdited: true,
      }),
    ).toEqual({ unitPriceCents: 4000, priceSource: 'computed' });
  });

  it('sets known after a manual unit-price edit of a computed line', () => {
    expect(
      resolveDraftPriceEdit({
        costCents: 4000,
        markupPercent: 20,
        unitPriceCents: 5000,
        unitPriceManuallyEdited: true,
        costOrMarkupEdited: true,
        existingPriceSource: 'computed',
      }),
    ).toEqual({ unitPriceCents: 5000, priceSource: 'known' });
  });

  it('does not invent dollars when the manual unit price is cleared', () => {
    expect(
      resolveDraftPriceEdit({
        costCents: 4000,
        markupPercent: 20,
        unitPriceCents: null,
        unitPriceManuallyEdited: true,
        costOrMarkupEdited: false,
        existingPriceSource: 'computed',
      }),
    ).toEqual({ unitPriceCents: null, priceSource: 'unknown' });
  });

  it('keeps a stored catalog/spoken price until cost or markup is edited', () => {
    expect(resolveDraftPriceEdit(stored)).toEqual({
      unitPriceCents: 17500,
      priceSource: 'catalog',
    });
    expect(
      resolveDraftPriceEdit({
        ...stored,
        existingPriceSource: 'spoken',
        unitPriceCents: 850,
      }),
    ).toEqual({ unitPriceCents: 850, priceSource: 'spoken' });
  });

  it('does not apply material markup to labor hour lines', () => {
    expect(
      resolveDraftPriceEdit({
        costCents: 4000,
        markupPercent: 20,
        unitPriceCents: 7500,
        unitPriceManuallyEdited: false,
        costOrMarkupEdited: true,
        existingPriceSource: 'computed',
        isLabor: true,
      }),
    ).toEqual({ unitPriceCents: 7500, priceSource: 'computed' });
  });
});
