import {
  canRetryDeadLetter,
  deadLetterBannerMessage,
  deadLetterErrorMessage,
  deadLetterRetryPatch,
  deadLetterSummary,
  deadLetterTitle,
  DEAD_LETTER_EMPTY_BODY,
  DEAD_LETTER_EMPTY_HEADING,
  DEAD_LETTER_LIST_INTRO,
  DEAD_LETTER_RETRY_LABEL,
  listDeadLetterViews,
  SYNC_ISSUES_TITLE,
  syncIssuesHeaderLabel,
  toDeadLetterListItem,
} from './dead-letter';

function source(
  overrides: Partial<{
    id: string;
    entityType: string;
    action: string;
    payloadJson: string;
    lastError: string | null;
  }> = {},
) {
  return {
    id: 'q1',
    entityType: 'catalog_item',
    action: 'create',
    payloadJson: JSON.stringify({ name: 'Pipe Repair', unit: 'ea', unitPriceCents: 4500 }),
    lastError: 'network down',
    ...overrides,
  };
}

describe('dead-letter listing helpers (SYNC-04)', () => {
  it('uses human-readable entity/action titles, including catalog names', () => {
    expect(deadLetterTitle('catalog_item', 'create', source().payloadJson)).toBe(
      'New catalog item: Pipe Repair',
    );
    expect(deadLetterTitle('catalog_item', 'update', '{"name":"Faucet"}')).toBe(
      'Catalog change: Faucet',
    );
    expect(deadLetterTitle('quote', 'create', '{"customerPhone":"+15555550100"}')).toBe(
      'New quote: +15555550100',
    );
    expect(deadLetterTitle('quote', 'update', '{}')).toBe('Quote update');
    expect(deadLetterTitle('draft', 'update', '{}')).toBe('Quote draft');
    expect(deadLetterTitle('audio', 'create', '{"filePath":"/tmp/a.m4a"}')).toBe(
      'Voice recording',
    );
    expect(deadLetterTitle('onboarding', 'seed', '{"trade":"plumbing"}')).toBe('Catalog setup');
    expect(deadLetterTitle('mystery', 'frob', '{}')).toBe('Saved change');
  });

  it('ignores invalid payload JSON and blank names', () => {
    expect(deadLetterTitle('catalog_item', 'create', '{')).toBe('New catalog item');
    expect(deadLetterTitle('catalog_item', 'create', '{"name":"  "}')).toBe('New catalog item');
  });

  it('maps entity/action to a plain-language summary', () => {
    expect(deadLetterSummary('quote', 'create')).toBe("Couldn't save a new quote");
    expect(deadLetterSummary('audio', 'create')).toBe("Couldn't upload this recording");
    expect(deadLetterSummary('onboarding', 'seed')).toBe("Couldn't finish catalog setup");
    expect(deadLetterSummary('nope', 'nope')).toBe("Couldn't sync this change");
  });

  it('maps lastError to plumber-facing copy, never technical internals', () => {
    expect(deadLetterErrorMessage(null)).toBe("Couldn't sync this change. Try again.");
    expect(deadLetterErrorMessage('network down')).toBe(
      "Couldn't reach the server. Check your signal and try again.",
    );
    expect(deadLetterErrorMessage('Cannot sync update: no server ID for catalog item')).toBe(
      "This isn't on the server yet. Try again in a moment.",
    );
    expect(deadLetterErrorMessage('Cannot sync audio: quote not found')).toBe(
      'The quote for this recording is missing on this device.',
    );
    expect(deadLetterErrorMessage('Session expired')).toBe(
      "You're signed out. Log in and try again.",
    );
    expect(deadLetterErrorMessage('Catalog already seeded')).toBe(
      'This change may already be on the server. Retry to confirm.',
    );
    expect(deadLetterErrorMessage('ENOENT: /data/user/0/stack')).toBe(
      "Couldn't sync this change. Try again.",
    );
    expect(deadLetterErrorMessage('Cannot sync update: no server ID for catalog item')).not.toMatch(
      /server ID/,
    );
  });

  it('lists mixed dead-letter rows for the Sync issues screen', () => {
    const views = listDeadLetterViews([
      source({ id: 'a', entityType: 'audio', action: 'create', payloadJson: '{}', lastError: null }),
      source({ id: 'b' }),
    ]);
    expect(views).toHaveLength(2);
    expect(views[0]).toEqual(
      toDeadLetterListItem(
        source({ id: 'a', entityType: 'audio', action: 'create', payloadJson: '{}', lastError: null }),
      ),
    );
    expect(views[1]?.title).toBe('New catalog item: Pipe Repair');
    expect(views[1]?.summary).toBe("Couldn't save a catalog item");
    expect(views[1]?.error).toMatch(/signal/i);
  });

  it('uses empty-state copy that is not catalog Add Item language', () => {
    expect(DEAD_LETTER_EMPTY_HEADING).toBe('All caught up');
    expect(DEAD_LETTER_EMPTY_BODY).toMatch(/signal/i);
    expect(DEAD_LETTER_EMPTY_BODY).not.toMatch(/Add Item/i);
    expect(DEAD_LETTER_LIST_INTRO).toMatch(/Retry/i);
    expect(DEAD_LETTER_RETRY_LABEL).toBe('Retry');
    expect(SYNC_ISSUES_TITLE).toBe('Sync issues');
  });

  it('builds banner and header labels from the dead-letter count', () => {
    expect(deadLetterBannerMessage(0)).toBeNull();
    expect(deadLetterBannerMessage(-1)).toBeNull();
    expect(deadLetterBannerMessage(1)).toBe("1 change didn't sync. Tap to review.");
    expect(deadLetterBannerMessage(3)).toBe("3 changes didn't sync. Tap to review.");
    expect(syncIssuesHeaderLabel(1)).toBe('Sync issues, 1 change could not sync');
    expect(syncIssuesHeaderLabel(4)).toBe('Sync issues, 4 changes could not sync');
  });
});

describe('dead-letter retry helpers (SYNC-04)', () => {
  it('only retries items that reached dead_letter', () => {
    expect(canRetryDeadLetter('dead_letter')).toBe(true);
    expect(canRetryDeadLetter('pending')).toBe(false);
    expect(canRetryDeadLetter('failed')).toBe(false);
    expect(canRetryDeadLetter('in_progress')).toBe(false);
  });

  it('resets status to pending with a fresh retry count so processQueue will run', () => {
    expect(deadLetterRetryPatch()).toEqual({
      status: 'pending',
      retryCount: 0,
      nextRetryAt: null,
    });
  });
});
