import {
  BUILDING_QUOTE_BODY,
  BUILDING_QUOTE_TITLE,
  showBuildingQuote,
} from './building-quote';

describe('showBuildingQuote', () => {
  it('shows the skeleton only while a voice take has no lines yet', () => {
    expect(showBuildingQuote({ status: 'ai_processing', lineCount: 0 })).toBe(true);
    expect(showBuildingQuote({ status: 'ai_processing', lineCount: 2 })).toBe(false);
    expect(showBuildingQuote({ status: 'draft_local', lineCount: 0 })).toBe(false);
    expect(showBuildingQuote({ status: 'ai_failed', lineCount: 0 })).toBe(false);
  });

  it('uses the building title and does not invent prices or a phone', () => {
    expect(BUILDING_QUOTE_TITLE).toBe('Building your quote...');
    expect(BUILDING_QUOTE_BODY.toLowerCase()).toContain('saved on this phone');
    const copy = `${BUILDING_QUOTE_TITLE} ${BUILDING_QUOTE_BODY}`;
    expect(copy).not.toMatch(/\$|sku|unit price/i);
  });
});
