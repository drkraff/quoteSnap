import {
  aiFailedRecoveryView,
  assignStoredAiFailureStage,
  lineCountFromDraftJson,
  parseAiFailureStage,
  recoverAiFailedPlan,
  resolveAiFailedLineCount,
} from './ai-failed-recovery';

function assertHonestRecoveryCopy(copy: { title: string; body: string }): void {
  const text = `${copy.title} ${copy.body}`;
  expect(text).not.toMatch(/\$/);
  expect(text).not.toMatch(/\d+\.\d{2}/);
  expect(text.toLowerCase()).not.toContain('phone');
  expect(text).not.toMatch(/\+1/);
  expect(text).not.toMatch(/555/);
  expect(text.toLowerCase()).not.toContain('sms');
  expect(text.toLowerCase()).not.toContain('failed_send');
  expect(text).not.toMatch(/unitPrice/i);
  expect(text.toLowerCase()).not.toContain('sku');
}

describe('parseAiFailureStage', () => {
  it('accepts asr, mapping, and timeout', () => {
    expect(parseAiFailureStage('asr')).toBe('asr');
    expect(parseAiFailureStage('mapping')).toBe('mapping');
    expect(parseAiFailureStage('timeout')).toBe('timeout');
  });

  it('does not treat failed_send as a voice failure stage', () => {
    expect(parseAiFailureStage('failed_send')).toBeNull();
    expect(parseAiFailureStage('ai_failed')).toBeNull();
  });
});

describe('assignStoredAiFailureStage', () => {
  it('stores timeout and asr from the API and does not invent a stage when omitted', () => {
    const timeout: { aiFailureStage?: string | null } = {};
    assignStoredAiFailureStage(timeout, 'ai_failed', 'timeout');
    expect(timeout.aiFailureStage).toBe('timeout');

    const asr: { aiFailureStage?: string | null } = {};
    assignStoredAiFailureStage(asr, 'ai_failed', 'asr');
    expect(asr.aiFailureStage).toBe('asr');

    const omitted: { aiFailureStage?: string | null } = {};
    assignStoredAiFailureStage(omitted, 'ai_failed');
    expect(omitted.aiFailureStage).toBeUndefined();
    assignStoredAiFailureStage(omitted, 'ai_failed', 'failed_send');
    expect(omitted.aiFailureStage).toBeUndefined();
  });

  it('clears a stored stage when status leaves ai_failed', () => {
    const record: { aiFailureStage?: string | null } = { aiFailureStage: 'timeout' };
    assignStoredAiFailureStage(record, 'ai_processing');
    expect(record.aiFailureStage).toBeNull();

    record.aiFailureStage = 'mapping';
    assignStoredAiFailureStage(record, 'draft_local');
    expect(record.aiFailureStage).toBeNull();
  });
});

describe('lineCountFromDraftJson / resolveAiFailedLineCount', () => {
  it('treats missing, empty, and junk draft JSON as 0 lines — never invents items', () => {
    expect(lineCountFromDraftJson(null)).toBe(0);
    expect(lineCountFromDraftJson(undefined)).toBe(0);
    expect(lineCountFromDraftJson('')).toBe(0);
    expect(lineCountFromDraftJson('   ')).toBe(0);
    expect(lineCountFromDraftJson('[]')).toBe(0);
    expect(lineCountFromDraftJson('{')).toBe(0);
    expect(lineCountFromDraftJson('{}')).toBe(0);
    expect(lineCountFromDraftJson('not-json')).toBe(0);
    expect(resolveAiFailedLineCount({})).toBe(0);
    expect(resolveAiFailedLineCount({ lineCount: null, lineItemsJson: null })).toBe(0);
  });

  it('counts stored lines without reading prices into the banner', () => {
    const json = JSON.stringify([
      { name: 'Pipe', quantity: 2, unitPriceCents: 1500 },
      { name: 'Valve', quantity: 1, unitPriceCents: null },
    ]);
    expect(lineCountFromDraftJson(json)).toBe(2);
    expect(resolveAiFailedLineCount({ lineItemsJson: json })).toBe(2);
    expect(resolveAiFailedLineCount({ lineCount: 0, lineItemsJson: json })).toBe(0);
    expect(resolveAiFailedLineCount({ lineCount: -3 })).toBe(0);
    expect(resolveAiFailedLineCount({ lineCount: Number.NaN })).toBe(0);
  });
});

describe('aiFailedRecoveryView', () => {
  it('FAIL-04: retry original audio when Whisper failed and the file remains', () => {
    const view = aiFailedRecoveryView({
      audioExists: true,
      lineCount: 0,
      failureStage: 'asr',
    });
    expect(view.title).toBe("Couldn't transcribe this recording");
    expect(view.body).toContain('Retry the same recording');
    expect(view.showRetry).toBe(true);
    expect(view.showRecordAgain).toBe(false);
    expect(view.retryLabel).toBe('Retry recording');
    expect(view.manualLabel).toBe('Add items');
    assertHonestRecoveryCopy(view);
  });

  it('FAIL-05: partial mapping shows flagged-line copy and still offers retry', () => {
    const view = aiFailedRecoveryView({
      audioExists: true,
      lineCount: 2,
      failureStage: 'mapping',
    });
    expect(view.title).toBe("Couldn't finish this quote from the recording");
    expect(view.body).toContain('flagged lines');
    expect(view.showRetry).toBe(true);
    expect(view.manualLabel).toBe('Add items');
    assertHonestRecoveryCopy(view);
  });

  it('FAIL-05 timeout with no lines still offers manual add', () => {
    const view = aiFailedRecoveryView({
      audioExists: false,
      lineCount: 0,
      failureStage: 'timeout',
    });
    expect(view.title).toBe("Couldn't finish this quote from the recording");
    expect(view.body.toLowerCase()).not.toContain('flagged');
    expect(view.showRetry).toBe(false);
    expect(view.showRecordAgain).toBe(true);
    expect(view.recordAgainLabel).toBe('Record again');
    assertHonestRecoveryCopy(view);
  });

  it('FAIL-05: stored timeout with 0 lines is not FAIL-04 transcribe copy', () => {
    const view = aiFailedRecoveryView({
      audioExists: true,
      lineCount: 0,
      lineItemsJson: '[]',
      failureStage: parseAiFailureStage('timeout'),
    });
    expect(view.title).toBe("Couldn't finish this quote from the recording");
    expect(view.title).not.toBe("Couldn't transcribe this recording");
    expect(view.body.toLowerCase()).not.toContain('flagged');
    expect(view.showRetry).toBe(true);
    assertHonestRecoveryCopy(view);
  });

  it('FAIL-04: stored asr with 0 lines keeps transcribe copy', () => {
    const view = aiFailedRecoveryView({
      audioExists: true,
      lineCount: 0,
      failureStage: parseAiFailureStage('asr'),
    });
    expect(view.title).toBe("Couldn't transcribe this recording");
    assertHonestRecoveryCopy(view);
  });

  it('empty / missing draft is calm — no flagged-line copy, prices, or phone', () => {
    const missing = aiFailedRecoveryView({ audioExists: false });
    const emptyJson = aiFailedRecoveryView({
      audioExists: false,
      lineItemsJson: '[]',
    });
    const junkJson = aiFailedRecoveryView({
      audioExists: true,
      lineItemsJson: '{',
      failureStage: 'mapping',
    });
    expect(missing.showRetry).toBe(false);
    expect(missing.showRecordAgain).toBe(true);
    expect(missing.body.toLowerCase()).not.toContain('flagged');
    expect(emptyJson.body.toLowerCase()).not.toContain('flagged');
    expect(junkJson.showRetry).toBe(true);
    expect(junkJson.body.toLowerCase()).not.toContain('flagged');
    expect(junkJson.body).toContain('Add items from your catalog');
    assertHonestRecoveryCopy(missing);
    assertHonestRecoveryCopy(emptyJson);
    assertHonestRecoveryCopy(junkJson);
  });

  it('does not promise retry when the original audio is gone', () => {
    const mappingNoAudio = aiFailedRecoveryView({
      audioExists: false,
      lineCount: 2,
      failureStage: 'mapping',
    });
    expect(mappingNoAudio.showRetry).toBe(false);
    expect(mappingNoAudio.body.toLowerCase()).not.toContain('retry');
    expect(mappingNoAudio.body).toContain('flagged lines');
    assertHonestRecoveryCopy(mappingNoAudio);
  });

  it('does not reuse Send failed / failed_send wording', () => {
    const asr = aiFailedRecoveryView({ audioExists: true, lineCount: 0, failureStage: 'asr' });
    const mapping = aiFailedRecoveryView({
      audioExists: true,
      lineCount: 1,
      failureStage: 'mapping',
    });
    expect(asr.title.toLowerCase()).not.toContain('send');
    expect(mapping.title.toLowerCase()).not.toContain('send');
    expect(asr.body.toLowerCase()).not.toContain('sms');
    expect(mapping.body.toLowerCase()).not.toContain('sms');
    assertHonestRecoveryCopy(asr);
    assertHonestRecoveryCopy(mapping);
  });
});

describe('recoverAiFailedPlan', () => {
  it('is a no-op when the quote is missing or not ai_failed — does not invent a draft', () => {
    expect(recoverAiFailedPlan({ quoteId: '', status: 'ai_failed' })).toEqual({
      ok: false,
      reason: 'missing_quote',
    });
    expect(recoverAiFailedPlan({ quoteId: '   ', status: 'ai_failed' })).toEqual({
      ok: false,
      reason: 'missing_quote',
    });
    expect(recoverAiFailedPlan({ quoteId: null, status: 'ai_failed' })).toEqual({
      ok: false,
      reason: 'missing_quote',
    });
    expect(recoverAiFailedPlan({ status: 'ai_failed' })).toEqual({
      ok: false,
      reason: 'missing_quote',
    });
    expect(recoverAiFailedPlan({ quoteId: 'q1', status: 'draft_local' })).toEqual({
      ok: false,
      reason: 'not_ai_failed',
    });
    expect(recoverAiFailedPlan({ quoteId: 'q1', status: 'failed_send' })).toEqual({
      ok: false,
      reason: 'not_ai_failed',
    });
    expect(recoverAiFailedPlan({ quoteId: 'q1', status: null })).toEqual({
      ok: false,
      reason: 'not_ai_failed',
    });
  });

  it('recovers status only — no line items, cents, or phone in the payload', () => {
    const plan = recoverAiFailedPlan({ quoteId: 'q1', status: 'ai_failed' });
    expect(plan).toEqual({
      ok: true,
      nextStatus: 'draft_local',
      enqueue: {
        entityType: 'quote',
        entityId: 'q1',
        action: 'update',
        payload: { status: 'draft_local' },
      },
    });
    if (!plan.ok) {
      throw new Error('expected recover plan');
    }
    expect(Object.keys(plan.enqueue.payload)).toEqual(['status']);
    expect(plan.enqueue.payload).not.toHaveProperty('lineItems');
    expect(plan.enqueue.payload).not.toHaveProperty('totalCents');
    expect(plan.enqueue.payload).not.toHaveProperty('customerPhone');
    expect(JSON.stringify(plan)).not.toMatch(/unitPrice/);
    expect(JSON.stringify(plan)).not.toMatch(/\$/);
  });
});
