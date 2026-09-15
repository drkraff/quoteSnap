import {
  draftPriceFlag,
  draftPriceSourceLabel,
  parsePriceSource,
  typedPriceSource,
} from './price-source';

describe('parsePriceSource', () => {
  it('accepts attach and known snapshot values', () => {
    expect(parsePriceSource('spoken')).toBe('spoken');
    expect(parsePriceSource('catalog')).toBe('catalog');
    expect(parsePriceSource('learned')).toBe('learned');
    expect(parsePriceSource('computed')).toBe('computed');
    expect(parsePriceSource('unknown')).toBe('unknown');
    expect(parsePriceSource('known')).toBe('known');
  });

  it('drops guessed or invalid labels', () => {
    expect(parsePriceSource('guessed')).toBeUndefined();
    expect(parsePriceSource('imported')).toBeUndefined();
    expect(parsePriceSource(null)).toBeUndefined();
  });
});

describe('draftPriceFlag', () => {
  it('maps spoken and computed to design §7 labels', () => {
    expect(draftPriceFlag('spoken', 850)).toBe('spoken');
    expect(draftPriceSourceLabel('spoken')).toBe('you said');
    expect(draftPriceFlag('computed', 7500)).toBe('computed');
    expect(draftPriceSourceLabel('computed')).toBe('from your rate');
  });

  it('maps catalog, learned, and typed known to quiet Known', () => {
    expect(draftPriceFlag('catalog', 17500)).toBe('known');
    expect(draftPriceFlag('learned', 5200)).toBe('known');
    expect(draftPriceFlag('known', 2500)).toBe('known');
    expect(draftPriceSourceLabel('known')).toBeNull();
  });

  it('treats blank cents as Unknown even if a filled source leaked through', () => {
    expect(draftPriceFlag('spoken', null)).toBe('unknown');
    expect(draftPriceFlag('computed', 0)).toBe('unknown');
    expect(draftPriceFlag('catalog', null)).toBe('unknown');
    expect(draftPriceFlag(undefined, null)).toBe('unknown');
    expect(draftPriceSourceLabel('unknown')).toBeNull();
  });

  it('treats a filled price with no stored source as Known (pre-migration drafts)', () => {
    expect(draftPriceFlag(undefined, 1500)).toBe('known');
    expect(draftPriceFlag('unknown', 1500)).toBe('known');
  });
});

describe('typedPriceSource', () => {
  it('marks contractor-typed cents as known and blank as unknown', () => {
    expect(typedPriceSource(180000)).toBe('known');
    expect(typedPriceSource(0)).toBe('unknown');
  });
});
