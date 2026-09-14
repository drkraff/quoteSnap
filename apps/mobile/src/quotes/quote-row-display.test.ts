import { quoteRowDisplay } from './quote-row-display';

describe('quoteRowDisplay', () => {
  it('shows Queued when an ai_processing row is offline', () => {
    const view = quoteRowDisplay({
      status: 'ai_processing',
      totalCents: 0,
      customerPhone: null,
      online: false,
    });

    expect(view.isAiProcessing).toBe(true);
    expect(view.phone).toBe('New job');
    expect(view.processingCaption).toBe('Queued');
    expect(view.accessibilityLabel).toBe('Quote queued, will upload when online');
  });

  it('shows Processing when an ai_processing row is online', () => {
    const view = quoteRowDisplay({
      status: 'ai_processing',
      totalCents: 0,
      customerPhone: null,
      online: true,
    });

    expect(view.processingCaption).toBe('Processing...');
    expect(view.accessibilityLabel).toBe('Quote processing');
  });

  it('shows Draft status and dollar total once the quote is ready', () => {
    const view = quoteRowDisplay({
      status: 'draft_local',
      totalCents: 69500,
      customerPhone: null,
      online: true,
    });

    expect(view.isAiProcessing).toBe(false);
    expect(view.processingCaption).toBeNull();
    expect(view.statusLabel).toBe('Draft');
    expect(view.totalDisplay).toBe('$695.00');
    expect(view.phone).toBe('No phone');
    expect(view.accessibilityLabel).toBe(
      'Quote status Draft, total $695.00. Double tap to open.',
    );
  });

  it('offers recovery on ai_failed, distinct from send failed', () => {
    const view = quoteRowDisplay({
      status: 'ai_failed',
      totalCents: 0,
      customerPhone: null,
      online: true,
    });
    expect(view.statusLabel).toBe("Couldn't process audio");
    expect(view.accessibilityLabel).toContain('retry the recording or continue as a draft');
    expect(view.accessibilityLabel.toLowerCase()).not.toContain('send failed');
  });

  it('does not keep Processing copy after status leaves ai_processing', () => {
    const wasProcessing = quoteRowDisplay({
      status: 'ai_processing',
      totalCents: 0,
      customerPhone: null,
      online: true,
    });
    const afterReady = quoteRowDisplay({
      status: 'draft_local',
      totalCents: 69500,
      customerPhone: null,
      online: true,
    });

    expect(wasProcessing.processingCaption).toBe('Processing...');
    expect(afterReady.processingCaption).toBeNull();
    expect(afterReady.totalDisplay).not.toBe(wasProcessing.totalDisplay);
  });
});
