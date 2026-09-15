import {
  RESUME_KIND_DRAFT,
  RESUME_KIND_VOICE,
  RESUME_PROMPT_DISMISS,
  RESUME_PROMPT_RESUME,
  RESUME_PROMPT_TITLE,
  beginResumePromptIfNeeded,
  canResumeDraftQuote,
  parseResumeCheckpointRow,
  pickResumeTarget,
  releaseResumePromptSlot,
  resetResumePromptSlotForTests,
  resumeHref,
  resumePromptBody,
  voiceStopAlreadyPersisted,
} from './resume-checkpoint';

describe('parseResumeCheckpointRow', () => {
  it('accepts voice and draft kinds and trims ids', () => {
    expect(
      parseResumeCheckpointRow({
        kind: RESUME_KIND_VOICE,
        quoteId: '  q1  ',
        audioUri: ' file:///cache/rec.m4a ',
      }),
    ).toEqual({
      kind: RESUME_KIND_VOICE,
      quoteId: 'q1',
      audioUri: 'file:///cache/rec.m4a',
    });
    expect(
      parseResumeCheckpointRow({
        kind: RESUME_KIND_DRAFT,
        quoteId: 'draft-1',
        audioUri: null,
      }),
    ).toEqual({
      kind: RESUME_KIND_DRAFT,
      quoteId: 'draft-1',
      audioUri: null,
    });
  });

  it('rejects unknown kinds and empty quote ids', () => {
    expect(parseResumeCheckpointRow({ kind: 'catalog', quoteId: 'q1' })).toBeNull();
    expect(
      parseResumeCheckpointRow({
        kind: RESUME_KIND_DRAFT,
        quoteId: '   ',
        audioUri: '',
      }),
    ).toEqual({
      kind: RESUME_KIND_DRAFT,
      quoteId: null,
      audioUri: null,
    });
  });
});

describe('resumeHref', () => {
  it('routes a draft edit to the editor and a recording to the mic', () => {
    expect(resumeHref({ kind: RESUME_KIND_DRAFT, quoteId: 'q1' })).toBe('/draft/q1');
    expect(resumeHref({ kind: RESUME_KIND_DRAFT, quoteId: null })).toBeNull();
    expect(resumeHref({ kind: RESUME_KIND_VOICE, quoteId: null })).toBe('/voice-record');
    expect(resumeHref({ kind: RESUME_KIND_VOICE, quoteId: 'q1' })).toBe(
      '/voice-record?quoteId=q1',
    );
  });
});

describe('pickResumeTarget', () => {
  const draftCheckpoint = {
    kind: RESUME_KIND_DRAFT,
    quoteId: 'q1',
    audioUri: null,
  } as const;
  const voiceCheckpoint = {
    kind: RESUME_KIND_VOICE,
    quoteId: null,
    audioUri: 'file:///cache/rec.m4a',
  } as const;
  const retryVoiceCheckpoint = {
    kind: RESUME_KIND_VOICE,
    quoteId: 'failed-q',
    audioUri: null,
  } as const;

  it('does not prompt when there is no checkpoint', () => {
    expect(pickResumeTarget({ checkpoint: null })).toBeNull();
  });

  it('resumes a local or ai_failed draft after auth restore', () => {
    expect(
      pickResumeTarget({
        checkpoint: draftCheckpoint,
        quote: { status: 'draft_local', isArchived: false },
      }),
    ).toEqual({
      kind: RESUME_KIND_DRAFT,
      href: '/draft/q1',
      quoteId: 'q1',
    });
    expect(
      pickResumeTarget({
        checkpoint: draftCheckpoint,
        quote: { status: 'ai_failed', isArchived: null },
      }),
    ).toEqual({
      kind: RESUME_KIND_DRAFT,
      href: '/draft/q1',
      quoteId: 'q1',
    });
  });

  it('does not resume archived, missing, sent, or processing drafts', () => {
    expect(
      pickResumeTarget({
        checkpoint: draftCheckpoint,
        quote: { status: 'draft_local', isArchived: true },
      }),
    ).toBeNull();
    expect(pickResumeTarget({ checkpoint: draftCheckpoint, quote: null })).toBeNull();
    expect(
      pickResumeTarget({
        checkpoint: { ...draftCheckpoint, quoteId: null },
        quote: { status: 'draft_local' },
      }),
    ).toBeNull();
    expect(
      pickResumeTarget({
        checkpoint: draftCheckpoint,
        quote: { status: 'sent' },
      }),
    ).toBeNull();
    expect(
      pickResumeTarget({
        checkpoint: draftCheckpoint,
        quote: { status: 'draft_queued' },
      }),
    ).toBeNull();
    expect(
      pickResumeTarget({
        checkpoint: draftCheckpoint,
        quote: { status: 'failed_send' },
      }),
    ).toBeNull();
  });

  it('reopens the recorder after a mid-take crash', () => {
    expect(pickResumeTarget({ checkpoint: voiceCheckpoint })).toEqual({
      kind: RESUME_KIND_VOICE,
      href: '/voice-record',
      quoteId: null,
    });
  });

  it('keeps FAIL-04 retry quoteId when the crashed take was a re-record', () => {
    expect(
      pickResumeTarget({
        checkpoint: retryVoiceCheckpoint,
        quote: { status: 'ai_failed' },
      }),
    ).toEqual({
      kind: RESUME_KIND_VOICE,
      href: '/voice-record?quoteId=failed-q',
      quoteId: 'failed-q',
    });
  });

  it('does not reopen the mic after Stop already persisted ai_processing (FAIL-03)', () => {
    expect(
      pickResumeTarget({
        checkpoint: { ...voiceCheckpoint, quoteId: 'q-new' },
        quote: { status: 'ai_processing' },
      }),
    ).toBeNull();
    expect(
      pickResumeTarget({
        checkpoint: retryVoiceCheckpoint,
        quote: { status: 'ai_processing' },
      }),
    ).toBeNull();
  });

  it('drops a stale retry id when the quote row is gone', () => {
    expect(
      pickResumeTarget({
        checkpoint: retryVoiceCheckpoint,
        quote: null,
      }),
    ).toEqual({
      kind: RESUME_KIND_VOICE,
      href: '/voice-record',
      quoteId: null,
    });
  });
});

describe('canResumeDraftQuote / voiceStopAlreadyPersisted', () => {
  it('allows FAIL-05 manual fallback drafts and not frozen quotes', () => {
    expect(canResumeDraftQuote({ status: 'ai_failed' })).toBe(true);
    expect(canResumeDraftQuote({ status: 'draft_local' })).toBe(true);
    expect(canResumeDraftQuote({ status: 'sent' })).toBe(false);
    expect(canResumeDraftQuote({ status: 'draft_local', isArchived: true })).toBe(false);
  });

  it('treats only ai_processing as an already-stopped take', () => {
    expect(voiceStopAlreadyPersisted({ status: 'ai_processing' })).toBe(true);
    expect(voiceStopAlreadyPersisted({ status: 'ai_failed' })).toBe(false);
    expect(voiceStopAlreadyPersisted(null)).toBe(false);
  });
});

describe('resume prompt copy', () => {
  it('uses the FAIL-07 title and dismissable actions', () => {
    expect(RESUME_PROMPT_TITLE).toBe('Resume where you left off');
    expect(RESUME_PROMPT_RESUME).toBe('Resume');
    expect(RESUME_PROMPT_DISMISS).toBe('Not now');
    expect(resumePromptBody(RESUME_KIND_VOICE)).toContain('recording');
    expect(resumePromptBody(RESUME_KIND_DRAFT)).toContain('draft');
  });
});

describe('beginResumePromptIfNeeded', () => {
  beforeEach(() => {
    resetResumePromptSlotForTests();
  });

  it('fires once per cold start so Quotes remounts do not re-Alert', () => {
    expect(beginResumePromptIfNeeded()).toBe(true);
    expect(beginResumePromptIfNeeded()).toBe(false);
    resetResumePromptSlotForTests();
    expect(beginResumePromptIfNeeded()).toBe(true);
  });

  it('can release a cancelled first pass so Strict Mode still prompts', () => {
    expect(beginResumePromptIfNeeded()).toBe(true);
    releaseResumePromptSlot();
    expect(beginResumePromptIfNeeded()).toBe(true);
  });
});
