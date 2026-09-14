import type { DraftLineItemsResponse, VoiceStatusResponse } from '../api/voice';

export type PollableAiQuote = {
  id: string;
  status: string;
  serverId: string | null;
  voiceJobId: string | null;
};

export type PollAiProcessingOutcome =
  | 'skipped'
  | 'still_processing'
  | 'recovered_job'
  | 'draft_ready'
  | 'ai_failed';

export type RemoteQuoteLineItem = {
  catalogItemId?: string | null;
  name: string;
  quantity: number;
  unitPriceCents: number | null;
  unit?: string | null;
  confidence?: number | null;
};

export type RemoteQuoteForPoll = {
  quote: {
    status: string;
    voiceJobId: string | null;
  };
  lineItems?: RemoteQuoteLineItem[];
};

export type PollAiProcessingDeps = {
  getVoiceStatus: (jobId: string) => Promise<VoiceStatusResponse>;
  fetchQuote: (serverId: string) => Promise<RemoteQuoteForPoll>;
  getDraftLineItems: (quoteId: string) => Promise<DraftLineItemsResponse>;
  markDraftReady: (quote: PollableAiQuote, lineItemsJson: string) => Promise<void>;
  markFailed: (quote: PollableAiQuote, lineItemsJson: string) => Promise<void>;
  stampVoiceJobId: (quote: PollableAiQuote, jobId: string) => Promise<void>;
};

export type PollAiProcessingOptions = {
  /** FAIL-04: a re-upload of the same quote is still queued. */
  audioRetryInFlight?: boolean;
};

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function lineItemsJsonFromUnknown(items: unknown): string {
  return JSON.stringify(Array.isArray(items) ? items : []);
}

/** Quotes list poller: need a job id (status poll) or a server id (quote lookup). */
export function shouldPollAiProcessing(quote: {
  status: string;
  serverId: string | null;
  voiceJobId: string | null;
}): boolean {
  if (quote.status !== 'ai_processing') {
    return false;
  }
  return hasText(quote.voiceJobId) || hasText(quote.serverId);
}

/** Start the 1.5s poll loop only when online — reconnect must re-enter this. */
export function shouldRunQuotesAiPoller(
  quotes: {
    status: string;
    serverId: string | null;
    voiceJobId: string | null;
  }[],
  online: boolean,
): boolean {
  return online && quotes.some(shouldPollAiProcessing);
}

async function applyComplete(
  quote: PollableAiQuote,
  draftId: string,
  deps: PollAiProcessingDeps,
): Promise<PollAiProcessingOutcome> {
  try {
    const draftData = await deps.getDraftLineItems(draftId);
    await deps.markDraftReady(quote, lineItemsJsonFromUnknown(draftData.lineItems));
  } catch {
    // Same as the existing quotes-list poller: do not stay in ai_processing
    // if the draft fetch fails after the server already finished.
    await deps.markDraftReady(quote, '[]');
  }
  return 'draft_ready';
}

async function applyFailed(
  quote: PollableAiQuote,
  deps: PollAiProcessingDeps,
  options: PollAiProcessingOptions,
  seed: { draftId?: string | null; lineItems?: RemoteQuoteLineItem[] },
): Promise<PollAiProcessingOutcome> {
  if (options.audioRetryInFlight) {
    return 'still_processing';
  }

  if (seed.lineItems && seed.lineItems.length > 0) {
    await deps.markFailed(quote, lineItemsJsonFromUnknown(seed.lineItems));
    return 'ai_failed';
  }

  const draftId = hasText(seed.draftId)
    ? seed.draftId
    : hasText(quote.serverId)
      ? quote.serverId
      : null;
  if (hasText(draftId)) {
    try {
      const draftData = await deps.getDraftLineItems(draftId);
      await deps.markFailed(quote, lineItemsJsonFromUnknown(draftData.lineItems));
      return 'ai_failed';
    } catch {
      // FAIL-04 ASR: no draft yet. Still mark failed so Retry can surface.
    }
  }

  await deps.markFailed(quote, '[]');
  return 'ai_failed';
}

async function pollByVoiceJobId(
  quote: PollableAiQuote,
  jobId: string,
  deps: PollAiProcessingDeps,
  options: PollAiProcessingOptions,
): Promise<PollAiProcessingOutcome> {
  try {
    const result = await deps.getVoiceStatus(jobId);
    if (result.status === 'complete' && result.draftId) {
      return applyComplete(quote, result.draftId, deps);
    }
    if (result.status === 'failed') {
      return applyFailed(quote, deps, options, { draftId: result.draftId });
    }
    return 'still_processing';
  } catch {
    return 'still_processing';
  }
}

/**
 * One tick of the quotes-list AI poller.
 *
 * - `voiceJobId` → existing GET /voice/status/:jobId path.
 * - `serverId` only → GET /quotes/:id to recover a job id, ai_failed, or a draft.
 * - neither → skip (upload/sync still in flight; do not mark failed).
 */
export async function pollOneAiProcessingQuote(
  quote: PollableAiQuote,
  deps: PollAiProcessingDeps,
  options: PollAiProcessingOptions = {},
): Promise<PollAiProcessingOutcome> {
  if (quote.status !== 'ai_processing') {
    return 'skipped';
  }

  if (hasText(quote.voiceJobId)) {
    return pollByVoiceJobId(quote, quote.voiceJobId, deps, options);
  }

  if (!hasText(quote.serverId)) {
    return 'skipped';
  }

  let remote: RemoteQuoteForPoll;
  try {
    remote = await deps.fetchQuote(quote.serverId);
  } catch {
    return 'still_processing';
  }

  if (remote.quote.status === 'ai_failed') {
    return applyFailed(quote, deps, options, {
      draftId: quote.serverId,
      lineItems: remote.lineItems,
    });
  }

  if (remote.quote.status !== 'ai_processing') {
    return applyComplete(quote, quote.serverId, deps);
  }

  if (hasText(remote.quote.voiceJobId)) {
    await deps.stampVoiceJobId(quote, remote.quote.voiceJobId);
    const withJob: PollableAiQuote = {
      ...quote,
      voiceJobId: remote.quote.voiceJobId,
    };
    const statusOutcome = await pollByVoiceJobId(
      withJob,
      remote.quote.voiceJobId,
      deps,
      options,
    );
    return statusOutcome === 'still_processing' ? 'recovered_job' : statusOutcome;
  }

  // Server row is still ai_processing and has no job yet (e.g. upload 500
  // stamped quoteId before enqueue). Keep spinning; do not invent ai_failed.
  return 'still_processing';
}
