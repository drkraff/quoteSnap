import { aiFailedRecoveryView, parseAiFailureStage } from './ai-failed-recovery';

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
  });

  it('FAIL-05 timeout with no lines still offers manual add', () => {
    const view = aiFailedRecoveryView({
      audioExists: false,
      lineCount: 0,
      failureStage: 'timeout',
    });
    expect(view.title).toBe("Couldn't finish this quote from the recording");
    expect(view.showRetry).toBe(false);
    expect(view.showRecordAgain).toBe(true);
    expect(view.recordAgainLabel).toBe('Record again');
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
  });
});
