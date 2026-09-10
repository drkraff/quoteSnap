import {
  pollOneAiProcessingQuote,
  shouldPollAiProcessing,
  type PollableAiQuote,
} from './poll-ai-processing';

function quote(overrides: Partial<PollableAiQuote> = {}): PollableAiQuote {
  return {
    id: 'local-1',
    status: 'ai_processing',
    serverId: null,
    voiceJobId: null,
    ...overrides,
  };
}

type TestDeps = {
  getVoiceStatus: jest.Mock;
  fetchQuote: jest.Mock;
  getDraftLineItems: jest.Mock;
  markDraftReady: jest.Mock;
  markFailed: jest.Mock;
  stampVoiceJobId: jest.Mock;
};

function deps(overrides: Partial<TestDeps> = {}): TestDeps {
  return {
    getVoiceStatus: jest.fn(),
    fetchQuote: jest.fn(),
    getDraftLineItems: jest.fn(),
    markDraftReady: jest.fn(async () => undefined),
    markFailed: jest.fn(async () => undefined),
    stampVoiceJobId: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('shouldPollAiProcessing', () => {
  it('polls when a voiceJobId exists', () => {
    expect(
      shouldPollAiProcessing(quote({ voiceJobId: 'job-1' })),
    ).toBe(true);
  });

  it('polls when a serverId exists without a voiceJobId', () => {
    expect(
      shouldPollAiProcessing(quote({ serverId: 'srv-1' })),
    ).toBe(true);
  });

  it('does not poll when both ids are missing', () => {
    expect(shouldPollAiProcessing(quote())).toBe(false);
  });

  it('does not poll blank ids', () => {
    expect(
      shouldPollAiProcessing(quote({ serverId: '  ', voiceJobId: '' })),
    ).toBe(false);
  });

  it('does not poll non-processing statuses', () => {
    expect(
      shouldPollAiProcessing(quote({ status: 'draft_local', voiceJobId: 'job-1' })),
    ).toBe(false);
  });
});

describe('pollOneAiProcessingQuote', () => {
  it('with voiceJobId uses GET /voice/status and does not fetch by quote id', async () => {
    const api = deps({
      getVoiceStatus: jest.fn(async () => ({ status: 'processing' as const })),
    });

    await expect(
      pollOneAiProcessingQuote(quote({ voiceJobId: 'job-1', serverId: 'srv-1' }), api),
    ).resolves.toBe('still_processing');

    expect(api.getVoiceStatus).toHaveBeenCalledTimes(1);
    expect(api.getVoiceStatus).toHaveBeenCalledWith('job-1');
    expect(api.fetchQuote).not.toHaveBeenCalled();
    expect(api.markFailed).not.toHaveBeenCalled();
    expect(api.stampVoiceJobId).not.toHaveBeenCalled();
  });

  it('with voiceJobId marks ai_failed when status is failed', async () => {
    const api = deps({
      getVoiceStatus: jest.fn(async () => ({
        status: 'failed' as const,
        error: 'Processing failed',
      })),
    });
    const row = quote({ voiceJobId: 'job-1' });

    await expect(pollOneAiProcessingQuote(row, api)).resolves.toBe('ai_failed');
    expect(api.markFailed).toHaveBeenCalledWith(row);
    expect(api.fetchQuote).not.toHaveBeenCalled();
  });

  it('with voiceJobId applies a draft when status is complete', async () => {
    const api = deps({
      getVoiceStatus: jest.fn(async () => ({
        status: 'complete' as const,
        draftId: 'srv-1',
      })),
      getDraftLineItems: jest.fn(async () => ({
        quoteId: 'srv-1',
        totalCents: 1500,
        lineItems: [
          {
            catalogItemId: 'cat-1',
            name: 'Pipe',
            quantity: 1,
            unitPriceCents: 1500,
            confidence: 0.9,
          },
        ],
      })),
    });
    const row = quote({ voiceJobId: 'job-1' });

    await expect(pollOneAiProcessingQuote(row, api)).resolves.toBe('draft_ready');
    expect(api.getDraftLineItems).toHaveBeenCalledWith('srv-1');
    expect(api.markDraftReady).toHaveBeenCalledWith(
      row,
      JSON.stringify([
        {
          catalogItemId: 'cat-1',
          name: 'Pipe',
          quantity: 1,
          unitPriceCents: 1500,
          confidence: 0.9,
        },
      ]),
    );
  });

  it('with serverId and no voiceJobId recovers a job id then uses the status poll', async () => {
    const api = deps({
      fetchQuote: jest.fn(async () => ({
        quote: { status: 'ai_processing', voiceJobId: 'job-recovered' },
        lineItems: [],
      })),
      getVoiceStatus: jest.fn(async () => ({ status: 'processing' as const })),
    });
    const row = quote({ serverId: 'srv-1' });

    await expect(pollOneAiProcessingQuote(row, api)).resolves.toBe('recovered_job');
    expect(api.fetchQuote).toHaveBeenCalledWith('srv-1');
    expect(api.stampVoiceJobId).toHaveBeenCalledWith(row, 'job-recovered');
    expect(api.getVoiceStatus).toHaveBeenCalledWith('job-recovered');
    expect(api.markFailed).not.toHaveBeenCalled();
  });

  it('with serverId and no voiceJobId applies ai_failed from server truth', async () => {
    const api = deps({
      fetchQuote: jest.fn(async () => ({
        quote: { status: 'ai_failed', voiceJobId: null },
        lineItems: [],
      })),
    });
    const row = quote({ serverId: 'srv-1' });

    await expect(pollOneAiProcessingQuote(row, api)).resolves.toBe('ai_failed');
    expect(api.markFailed).toHaveBeenCalledWith(row);
    expect(api.getVoiceStatus).not.toHaveBeenCalled();
    expect(api.stampVoiceJobId).not.toHaveBeenCalled();
  });

  it('with serverId and no voiceJobId applies a draft when the server already finished', async () => {
    const api = deps({
      fetchQuote: jest.fn(async () => ({
        quote: { status: 'draft_local', voiceJobId: 'job-1' },
        lineItems: [],
      })),
      getDraftLineItems: jest.fn(async () => ({
        quoteId: 'srv-1',
        totalCents: 0,
        lineItems: [],
      })),
    });
    const row = quote({ serverId: 'srv-1' });

    await expect(pollOneAiProcessingQuote(row, api)).resolves.toBe('draft_ready');
    expect(api.getDraftLineItems).toHaveBeenCalledWith('srv-1');
    expect(api.markDraftReady).toHaveBeenCalled();
    expect(api.getVoiceStatus).not.toHaveBeenCalled();
  });

  it('with serverId and no voiceJobId stays processing when the server has no job yet', async () => {
    const api = deps({
      fetchQuote: jest.fn(async () => ({
        quote: { status: 'ai_processing', voiceJobId: null },
        lineItems: [],
      })),
    });

    await expect(
      pollOneAiProcessingQuote(quote({ serverId: 'srv-1' }), api),
    ).resolves.toBe('still_processing');

    expect(api.markFailed).not.toHaveBeenCalled();
    expect(api.getVoiceStatus).not.toHaveBeenCalled();
    expect(api.stampVoiceJobId).not.toHaveBeenCalled();
  });

  it('with neither id does not call the network or mark failed', async () => {
    const api = deps();

    await expect(pollOneAiProcessingQuote(quote(), api)).resolves.toBe('skipped');
    expect(api.fetchQuote).not.toHaveBeenCalled();
    expect(api.getVoiceStatus).not.toHaveBeenCalled();
    expect(api.markFailed).not.toHaveBeenCalled();
    expect(api.markDraftReady).not.toHaveBeenCalled();
  });

  it('does not mark failed when GET /quotes/:id fails (retry next tick)', async () => {
    const api = deps({
      fetchQuote: jest.fn(async () => {
        throw new Error('offline');
      }),
    });

    await expect(
      pollOneAiProcessingQuote(quote({ serverId: 'srv-1' }), api),
    ).resolves.toBe('still_processing');
    expect(api.markFailed).not.toHaveBeenCalled();
  });

  it('does not mark failed when GET /voice/status fails (retry next tick)', async () => {
    const api = deps({
      getVoiceStatus: jest.fn(async () => {
        throw new Error('offline');
      }),
    });

    await expect(
      pollOneAiProcessingQuote(quote({ voiceJobId: 'job-1' }), api),
    ).resolves.toBe('still_processing');
    expect(api.markFailed).not.toHaveBeenCalled();
  });

  it('does not poll a no-id quote while recovering a serverId quote in the same list', async () => {
    const waitingOnUpload = quote({ id: 'local-upload' });
    const stampedNoJob = quote({ id: 'local-stamped', serverId: 'srv-1' });
    const withJob = quote({ id: 'local-job', voiceJobId: 'job-1' });
    const api = deps({
      fetchQuote: jest.fn(async () => ({
        quote: { status: 'ai_failed', voiceJobId: null },
        lineItems: [],
      })),
      getVoiceStatus: jest.fn(async () => ({ status: 'processing' as const })),
    });

    const toPoll = [waitingOnUpload, stampedNoJob, withJob].filter(shouldPollAiProcessing);
    expect(toPoll.map((row) => row.id)).toEqual(['local-stamped', 'local-job']);

    const outcomes = [];
    for (const row of toPoll) {
      outcomes.push(await pollOneAiProcessingQuote(row, api));
    }

    expect(outcomes).toEqual(['ai_failed', 'still_processing']);
    expect(api.markFailed).toHaveBeenCalledTimes(1);
    expect(api.markFailed).toHaveBeenCalledWith(stampedNoJob);
    expect(api.fetchQuote).toHaveBeenCalledTimes(1);
    expect(api.getVoiceStatus).toHaveBeenCalledTimes(1);
    expect(api.getVoiceStatus).toHaveBeenCalledWith('job-1');
  });
});
