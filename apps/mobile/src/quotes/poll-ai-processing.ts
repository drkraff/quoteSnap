import type { DraftLineItemsResponse, VoiceStatusResponse } from '../api/voice';
import { parseAiFailureStage, type AiFailureStage } from './ai-failed-recovery';

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
  priceSource?: string | null;
};

export type RemoteQuoteForPoll = {
  quote: {
    status: string;
    voiceJobId: string | null;
    clientSentence?: string | null;
    rooms?: unknown;
    failureStage?: AiFailureStage;
  };
  lineItems?: RemoteQuoteLineItem[];
};

export type PollAiProcessingDeps = {
  getVoiceStatus: (jobId: string) => Promise<VoiceStatusResponse>;
  fetchQuote: (serverId: string) => Promise<RemoteQuoteForPoll>;
  getDraftLineItems: (quoteId: string) => Promise<DraftLineItemsResponse>;
  markDraftReady: (
    quote: PollableAiQuote,
    lineItemsJson: string,
    clientSentence?: string | null,
    roomsJson?: string | null,
  ) => Promise<void>;
  markFailed: (
    quote: PollableAiQuote,
    lineItemsJson: string,
    clientSentence?: string | null,
    roomsJson?: string | null,
    failureStage?: AiFailureStage | null,
  ) => Promise<void>;
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

function roomsJsonFromUnknown(rooms: unknown): string | null {
  return Array.isArray(rooms) && rooms.length > 0 ? JSON.stringify(rooms) : null;
}

type CompleteDraftSeed = {
  lineItems?: RemoteQuoteLineItem[];
  clientSentence?: string | null;
  rooms?: unknown;
};

function hasSeededLineItems(seed: CompleteDraftSeed | undefined): boolean {
  return Array.isArray(seed?.lineItems) && seed.lineItems.length > 0;
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
  seed: CompleteDraftSeed = {},
): Promise<PollAiProcessingOutcome> {
  try {
    const draftData = await deps.getDraftLineItems(draftId);
    await deps.markDraftReady(
      quote,
      lineItemsJsonFromUnknown(draftData.lineItems),
      draftData.clientSentence ?? null,
      roomsJsonFromUnknown(draftData.rooms),
    );
    return 'draft_ready';
  } catch {
    // GET /voice/status complete (or GET /quotes already left ai_processing)
    // does not mean we may invent an empty draft. A flaky GET /voice/draft
    // used to mark draft_local + `[]`, which stopped the poller and looked
    // like the contractor described nothing. Prefer lines we already have
    // from GET /quotes/:id; otherwise keep spinning.
    if (hasSeededLineItems(seed)) {
      await deps.markDraftReady(
        quote,
        lineItemsJsonFromUnknown(seed.lineItems),
        seed.clientSentence ?? null,
        roomsJsonFromUnknown(seed.rooms),
      );
      return 'draft_ready';
    }
    return 'still_processing';
  }
}

async function markFailedFromSeed(
  quote: PollableAiQuote,
  deps: PollAiProcessingDeps,
  lineItemsJson: string,
  seed: {
    clientSentence?: string | null;
    roomsJson?: string | null;
    failureStage?: unknown;
  } = {},
): Promise<void> {
  const failureStage = parseAiFailureStage(seed.failureStage);
  if (seed.clientSentence !== undefined || seed.roomsJson !== undefined) {
    if (failureStage) {
      await deps.markFailed(
        quote,
        lineItemsJson,
        seed.clientSentence,
        seed.roomsJson,
        failureStage,
      );
      return;
    }
    await deps.markFailed(quote, lineItemsJson, seed.clientSentence, seed.roomsJson);
    return;
  }
  if (failureStage) {
    await deps.markFailed(quote, lineItemsJson, undefined, undefined, failureStage);
    return;
  }
  await deps.markFailed(quote, lineItemsJson);
}

async function applyFailed(
  quote: PollableAiQuote,
  deps: PollAiProcessingDeps,
  options: PollAiProcessingOptions,
  seed: {
    draftId?: string | null;
    lineItems?: RemoteQuoteLineItem[];
    failureStage?: unknown;
  },
): Promise<PollAiProcessingOutcome> {
  if (options.audioRetryInFlight) {
    return 'still_processing';
  }

  if (seed.lineItems && seed.lineItems.length > 0) {
    await markFailedFromSeed(quote, deps, lineItemsJsonFromUnknown(seed.lineItems), {
      failureStage: seed.failureStage,
    });
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
      await markFailedFromSeed(
        quote,
        deps,
        lineItemsJsonFromUnknown(draftData.lineItems),
        {
          clientSentence: draftData.clientSentence ?? null,
          roomsJson: roomsJsonFromUnknown(draftData.rooms),
          failureStage: seed.failureStage,
        },
      );
      return 'ai_failed';
    } catch {
      // FAIL-04 ASR: no draft yet. Still mark failed so Retry can surface.
    }
  }

  await markFailedFromSeed(quote, deps, '[]', { failureStage: seed.failureStage });
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
      return applyFailed(quote, deps, options, {
        draftId: result.draftId,
        failureStage: result.failureStage,
      });
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
      failureStage: remote.quote.failureStage,
    });
  }

  if (remote.quote.status !== 'ai_processing') {
    return applyComplete(quote, quote.serverId, deps, {
      lineItems: remote.lineItems,
      clientSentence: remote.quote.clientSentence ?? null,
      rooms: remote.quote.rooms,
    });
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
