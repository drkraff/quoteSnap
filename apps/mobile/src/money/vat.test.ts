import { quoteVatTotals, vatCents } from './vat';

describe('VAT math', () => {
  it('adds Israel 18% half-up on the line subtotal', () => {
    expect(vatCents(11500, 18)).toBe(2070);
    expect(quoteVatTotals(11500, 18)).toEqual({
      subtotalCents: 11500,
      vatPercent: 18,
      vatCents: 2070,
      totalCents: 13570,
    });
  });

  it('shows a zero VAT line when the rate is 0 and does not invent tax', () => {
    expect(quoteVatTotals(11500, 0)).toEqual({
      subtotalCents: 11500,
      vatPercent: 0,
      vatCents: 0,
      totalCents: 11500,
    });
  });

  it('rounds half-up and refuses a rate that is out of range', () => {
    expect(vatCents(3, 18)).toBe(1);
    expect(vatCents(1, 18)).toBe(0);
    expect(vatCents(2, 18)).toBe(0);
    expect(vatCents(-1, 18)).toBeNull();
    expect(vatCents(11500, 18.5)).toBe(2128);
    expect(vatCents(19500, 8)).toBe(1560);
    expect(vatCents(2147483647, 18)).toBeNull();
    expect(quoteVatTotals(11500, 101)).toBeNull();
    expect(vatCents(112500, 8.2555)).toBeNull();
  });

  it('charges 8.25% of $1,125.00 as $92.81', () => {
    expect(quoteVatTotals(112500, 8.25)).toEqual({
      subtotalCents: 112500,
      vatPercent: 8.25,
      vatCents: 9281,
      totalCents: 121781,
    });
    expect(vatCents(1000, 8.25)).toBe(83);
  });
});
