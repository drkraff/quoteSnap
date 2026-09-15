import fs from 'fs';
import path from 'path';
import { AUTHENTICATED_ENTRY_HREF } from '../navigation/authenticated-entry';
import { onboardingAfterProfile } from '../onboarding/profile';
import { draftReadyLocalFields } from './quote-list-observe';

const quotesScreen = fs.readFileSync(
  path.join(__dirname, '../../app/(app)/quotes.tsx'),
  'utf8',
);
const readyScreen = fs.readFileSync(
  path.join(__dirname, '../../app/(auth)/onboarding/ready.tsx'),
  'utf8',
);

describe('skippable catalog does not block quote create', () => {
  it('skip_catalog lands on Quotes with zero catalog items', () => {
    expect(onboardingAfterProfile('skip_catalog', 'plumbing')).toEqual({
      kind: 'ready',
      trade: 'plumbing',
      itemCount: 0,
    });
    expect(AUTHENTICATED_ENTRY_HREF).toBe('/(app)/quotes');
  });

  it('ready Start Quoting goes to Quotes and does not seed catalog', () => {
    expect(readyScreen).toContain('AUTHENTICATED_ENTRY_HREF');
    expect(readyScreen).toContain('skippedCatalog');
    expect(readyScreen).toContain('No starter catalog');
    expect(readyScreen).not.toMatch(/seedCatalog/);
    expect(readyScreen).not.toMatch(/load_catalog/);
  });

  it('Manual Quote create payload does not require catalog items', () => {
    expect(quotesScreen).toContain("payload: { status: 'draft_local', totalCents: 0 }");
    expect(quotesScreen).toMatch(/r\.status = 'draft_local'/);
    expect(quotesScreen).toMatch(/r\.lineItemsJson = '\[\]'/);
    expect(quotesScreen).not.toMatch(/catalogItems\.length/);
    expect(quotesScreen).not.toMatch(/itemCount/);
    expect(draftReadyLocalFields('[]')).toEqual({ status: 'draft_local', totalCents: 0 });
  });
});
