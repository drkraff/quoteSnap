import { aiFailedRecoveryView, recoverAiFailedPlan } from './ai-failed-recovery';
import { quoteRowDisplay } from './quote-row-display';
import { retryVoiceQuotePlan } from './retry-voice-quote';
import { quotePressTarget } from './status-display';
import {
  failQuoteAfterAudioDeadLetterPlan,
  isDeadLetterAudioUpload,
  resumeQuoteAfterAudioDeadLetterRetryPlan,
  shouldAlertOnVoiceStopError,
  voiceUploadEnqueueParams,
  voiceUploadQueuedAccessibility,
  voiceUploadStillQueued,
} from './voice-upload-queue';

describe('voiceUploadEnqueueParams', () => {
  it('queues the local file on the same quote (VOICE-03 / FAIL-03)', () => {
    expect(voiceUploadEnqueueParams('local-q1', 'file:///docs/audio-local-q1.m4a')).toEqual({
      entityType: 'audio',
      entityId: 'local-q1',
      action: 'create',
      payload: {
        filePath: 'file:///docs/audio-local-q1.m4a',
        quoteLocalId: 'local-q1',
      },
    });
  });
});

describe('voiceUploadStillQueued', () => {
  it('is queued while offline even if a job id already exists', () => {
    expect(
      voiceUploadStillQueued({
        status: 'ai_processing',
        voiceJobId: 'job-1',
        online: false,
      }),
    ).toBe(true);
  });

  it('is queued while online until the server accepts the upload', () => {
    expect(
      voiceUploadStillQueued({
        status: 'ai_processing',
        voiceJobId: null,
        online: true,
      }),
    ).toBe(true);
    expect(
      voiceUploadStillQueued({
        status: 'ai_processing',
        voiceJobId: '  ',
        online: true,
      }),
    ).toBe(true);
  });

  it('is not queued once a voice job id exists and NetInfo is up', () => {
    expect(
      voiceUploadStillQueued({
        status: 'ai_processing',
        voiceJobId: 'job-1',
        online: true,
      }),
    ).toBe(false);
  });

  it('does not treat draft or ai_failed rows as a quiet upload queue', () => {
    expect(
      voiceUploadStillQueued({
        status: 'ai_failed',
        voiceJobId: null,
        online: true,
      }),
    ).toBe(false);
    expect(
      voiceUploadStillQueued({
        status: 'draft_local',
        voiceJobId: null,
        online: false,
      }),
    ).toBe(false);
  });
});

describe('voiceUploadQueuedAccessibility', () => {
  it('uses will-retry copy when NetInfo is up and will-upload when offline', () => {
    expect(voiceUploadQueuedAccessibility(true)).toBe('Quote queued, will retry');
    expect(voiceUploadQueuedAccessibility(false)).toBe('Quote queued, will upload when online');
  });
});

describe('shouldAlertOnVoiceStopError', () => {
  it('does not Alert after the local file is saved (FAIL-03)', () => {
    expect(shouldAlertOnVoiceStopError('after_persist')).toBe(false);
  });

  it('still Alerts when recording or the local move failed', () => {
    expect(shouldAlertOnVoiceStopError('before_persist')).toBe(true);
  });
});

describe('dead-letter audio quote recovery (FAIL-03 after SYNC-03)', () => {
  it('recognizes exhausted voice uploads and ignores other dead letters', () => {
    expect(
      isDeadLetterAudioUpload({
        entityType: 'audio',
        action: 'create',
        status: 'dead_letter',
      }),
    ).toBe(true);
    expect(
      isDeadLetterAudioUpload({
        entityType: 'audio',
        action: 'create',
        status: 'pending',
      }),
    ).toBe(false);
    expect(
      isDeadLetterAudioUpload({
        entityType: 'catalog_item',
        action: 'create',
        status: 'dead_letter',
      }),
    ).toBe(false);
  });

  it('flips inert Queued / ai_processing onto FAIL-04/05 recovery without inventing money', () => {
    const queued = quoteRowDisplay({
      status: 'ai_processing',
      totalCents: 0,
      customerPhone: null,
      online: true,
      voiceJobId: null,
    });
    expect(quotePressTarget('ai_processing')).toBe('none');
    expect(queued.processingCaption).toBe('Queued');

    const plan = failQuoteAfterAudioDeadLetterPlan({
      quoteId: 'local-q1',
      status: 'ai_processing',
    });
    expect(plan).toEqual({ ok: true, nextStatus: 'ai_failed' });
    expect(JSON.stringify(plan)).not.toMatch(/unitPrice|customerPhone|sku|lineItems|totalCents|\$/i);

    if (!plan.ok) {
      throw new Error('expected fail plan');
    }

    expect(quotePressTarget(plan.nextStatus)).toBe('draft');
    const recovered = quoteRowDisplay({
      status: plan.nextStatus,
      totalCents: 0,
      customerPhone: null,
      online: true,
      voiceJobId: null,
    });
    expect(recovered.processingCaption).toBeNull();
    expect(recovered.statusLabel).toBe("Couldn't process audio");
    expect(recovered.accessibilityLabel).toContain('retry the recording or continue as a draft');

    const banner = aiFailedRecoveryView({ audioExists: true, lineCount: 0 });
    expect(banner.showRetry).toBe(true);
    expect(banner.manualLabel).toBe('Add items');
    expect(banner.title).toBe("Couldn't transcribe this recording");

    const retry = retryVoiceQuotePlan({
      quoteId: 'local-q1',
      status: plan.nextStatus,
      filePath: 'file:///docs/audio-local-q1.m4a',
      audioExists: true,
    });
    expect(retry.ok).toBe(true);

    const addItems = recoverAiFailedPlan({ quoteId: 'local-q1', status: plan.nextStatus });
    expect(addItems.ok).toBe(true);
    if (!addItems.ok) {
      throw new Error('expected recover plan');
    }
    expect(addItems.enqueue.payload).toEqual({ status: 'draft_local' });
  });

  it('is a no-op when the quote is missing or already off the quiet upload loop', () => {
    expect(failQuoteAfterAudioDeadLetterPlan({ quoteId: '', status: 'ai_processing' })).toEqual({
      ok: false,
      reason: 'missing_quote',
    });
    expect(
      failQuoteAfterAudioDeadLetterPlan({ quoteId: 'local-q1', status: 'draft_local' }),
    ).toEqual({ ok: false, reason: 'not_ai_processing' });
    expect(
      failQuoteAfterAudioDeadLetterPlan({ quoteId: 'local-q1', status: 'ai_failed' }),
    ).toEqual({ ok: false, reason: 'not_ai_processing' });
    expect(
      failQuoteAfterAudioDeadLetterPlan({ quoteId: 'local-q1', status: 'failed_send' }),
    ).toEqual({ ok: false, reason: 'not_ai_processing' });
  });

  it('resumes ai_processing on Sync issues retry, and leaves a manual draft alone', () => {
    expect(
      resumeQuoteAfterAudioDeadLetterRetryPlan({ quoteId: 'local-q1', status: 'ai_failed' }),
    ).toEqual({ ok: true, nextStatus: 'ai_processing' });
    expect(
      resumeQuoteAfterAudioDeadLetterRetryPlan({ quoteId: 'local-q1', status: 'draft_local' }),
    ).toEqual({ ok: false, reason: 'not_ai_failed' });
    expect(
      resumeQuoteAfterAudioDeadLetterRetryPlan({ quoteId: '', status: 'ai_failed' }),
    ).toEqual({ ok: false, reason: 'missing_quote' });
    const plan = resumeQuoteAfterAudioDeadLetterRetryPlan({
      quoteId: 'local-q1',
      status: 'ai_failed',
    });
    expect(JSON.stringify(plan)).not.toMatch(/unitPrice|customerPhone|sku|\$/i);
  });
});
