import {
  pollOneAiProcessingQuote,
  shouldPollAiProcessing,
  shouldRunQuotesAiPoller,
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

describe('shouldRunQuotesAiPoller', () => {
  it('does not run while offline even if a processing quote exists', () => {
    expect(
      shouldRunQuotesAiPoller([quote({ voiceJobId: 'job-1' })], false),
    ).toBe(false);
  });

  it('starts on reconnect when a processing quote is already on the list', () => {
    const rows = [quote({ voiceJobId: 'job-1' })];
    expect(shouldRunQuotesAiPoller(rows, false)).toBe(false);
    expect(shouldRunQuotesAiPoller(rows, true)).toBe(true);
  });

  it('does not run when online but nothing is ai_processing', () => {
    expect(
      shouldRunQuotesAiPoller([quote({ status: 'draft_local', voiceJobId: 'job-1' })], true),
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
    expect(api.markFailed).toHaveBeenCalledWith(row, '[]');
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
      null,
      null,
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
    expect(api.markFailed).toHaveBeenCalledWith(row, '[]');
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

  it('prefills clientSentence from voice draft assumptions', async () => {
    const api = deps({
      getVoiceStatus: jest.fn(async () => ({
        status: 'complete' as const,
        draftId: 'srv-1',
      })),
      getDraftLineItems: jest.fn(async () => ({
        quoteId: 'srv-1',
        totalCents: 0,
        clientSentence: 'appliances not included',
        lineItems: [],
      })),
    });
    const row = quote({ voiceJobId: 'job-1' });

    await expect(pollOneAiProcessingQuote(row, api)).resolves.toBe('draft_ready');
    expect(api.markDraftReady).toHaveBeenCalledWith(row, '[]', 'appliances not included', null);
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
    expect(api.markFailed).toHaveBeenCalledWith(stampedNoJob, '[]');
    expect(api.fetchQuote).toHaveBeenCalledTimes(1);
    expect(api.getVoiceStatus).toHaveBeenCalledTimes(1);
    expect(api.getVoiceStatus).toHaveBeenCalledWith('job-1');
  });

  it('FAIL-05: failed voice status with draftId pulls partial line items', async () => {
    const partial = [
      {
        catalogItemId: null,
        name: 'Mystery work',
        quantity: 1,
        unitPriceCents: null,
        unit: 'job',
        confidence: 0.59,
      },
    ];
    const api = deps({
      getVoiceStatus: jest.fn(async () => ({
        status: 'failed' as const,
        draftId: 'srv-1',
        failureStage: 'mapping' as const,
      })),
      getDraftLineItems: jest.fn(async () => ({
        quoteId: 'srv-1',
        totalCents: 0,
        lineItems: partial,
      })),
    });
    const row = quote({ voiceJobId: 'job-1', serverId: 'srv-1' });

    await expect(pollOneAiProcessingQuote(row, api)).resolves.toBe('ai_failed');
    expect(api.getDraftLineItems).toHaveBeenCalledWith('srv-1');
    expect(api.markFailed).toHaveBeenCalledWith(row, JSON.stringify(partial), null, null);
    expect(api.markDraftReady).not.toHaveBeenCalled();
  });

  it('FAIL-05: server ai_failed with nested lines does not wait on GET /voice/draft', async () => {
    const partial = [
      {
        catalogItemId: null,
        name: 'Elbow',
        quantity: 1,
        unitPriceCents: null,
        confidence: 0.5,
      },
    ];
    const api = deps({
      fetchQuote: jest.fn(async () => ({
        quote: { status: 'ai_failed', voiceJobId: null },
        lineItems: partial,
      })),
    });
    const row = quote({ serverId: 'srv-1' });

    await expect(pollOneAiProcessingQuote(row, api)).resolves.toBe('ai_failed');
    expect(api.markFailed).toHaveBeenCalledWith(row, JSON.stringify(partial));
    expect(api.getDraftLineItems).not.toHaveBeenCalled();
  });

  it('FAIL-04: does not mark failed while the same quote has a pending audio retry', async () => {
    const api = deps({
      getVoiceStatus: jest.fn(async () => ({
        status: 'failed' as const,
        draftId: 'srv-1',
      })),
    });
    const row = quote({ voiceJobId: 'job-1', serverId: 'srv-1' });

    await expect(
      pollOneAiProcessingQuote(row, api, { audioRetryInFlight: true }),
    ).resolves.toBe('still_processing');
    expect(api.markFailed).not.toHaveBeenCalled();
    expect(api.getDraftLineItems).not.toHaveBeenCalled();
  });

  it('does not invent an empty draft_local when GET /voice/draft fails after complete', async () => {
    const api = deps({
      getVoiceStatus: jest.fn(async () => ({
        status: 'complete' as const,
        draftId: 'srv-1',
      })),
      getDraftLineItems: jest.fn(async () => {
        throw new Error('draft fetch failed');
      }),
    });
    const row = quote({ voiceJobId: 'job-1', serverId: 'srv-1' });

    await expect(pollOneAiProcessingQuote(row, api)).resolves.toBe('still_processing');
    expect(api.getDraftLineItems).toHaveBeenCalledWith('srv-1');
    expect(api.markDraftReady).not.toHaveBeenCalled();
    expect(api.markFailed).not.toHaveBeenCalled();
  });

  it('uses nested GET /quotes lines when GET /voice/draft fails — blank prices stay blank', async () => {
    const nested = [
      {
        catalogItemId: null,
        name: 'Mystery assembly',
        quantity: 1,
        unitPriceCents: null,
        unit: 'job',
        confidence: 0.8,
      },
    ];
    const api = deps({
      fetchQuote: jest.fn(async () => ({
        quote: {
          status: 'draft_local',
          voiceJobId: 'job-1',
          clientSentence: 'appliances not included',
          rooms: [{ id: 'room-1', name: 'Kitchen' }],
        },
        lineItems: nested,
      })),
      getDraftLineItems: jest.fn(async () => {
        throw new Error('draft fetch failed');
      }),
    });
    const row = quote({ serverId: 'srv-1' });

    await expect(pollOneAiProcessingQuote(row, api)).resolves.toBe('draft_ready');
    expect(api.markDraftReady).toHaveBeenCalledWith(
      row,
      JSON.stringify(nested),
      'appliances not included',
      JSON.stringify([{ id: 'room-1', name: 'Kitchen' }]),
    );
    expect(JSON.stringify(api.markDraftReady.mock.calls[0])).not.toMatch(/\$/);
    expect(api.markFailed).not.toHaveBeenCalled();
  });

  it('keeps spinning when GET /quotes is already finished but has no lines and GET /voice/draft fails', async () => {
    const api = deps({
      fetchQuote: jest.fn(async () => ({
        quote: { status: 'draft_local', voiceJobId: 'job-1' },
        lineItems: [],
      })),
      getDraftLineItems: jest.fn(async () => {
        throw new Error('draft fetch failed');
      }),
    });

    await expect(
      pollOneAiProcessingQuote(quote({ serverId: 'srv-1' }), api),
    ).resolves.toBe('still_processing');
    expect(api.markDraftReady).not.toHaveBeenCalled();
    expect(api.markFailed).not.toHaveBeenCalled();
  });
});
