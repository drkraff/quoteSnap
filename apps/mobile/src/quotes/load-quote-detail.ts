import type { QuoteLineItemResponse, QuoteResponse } from '../api/quotes';
import { parseLineItems, serializeLineItems, type LineItem } from '../utils/line-items';

export const QUOTE_DETAIL_OFFLINE_ERROR =
  'Connect to the internet to view full details';

export const QUOTE_DETAIL_NOT_FOUND = 'Quote not found';

export type LocalQuoteRecord = {
  id: string;
  serverId: string | null;
  status: string;
  customerPhone: string | null;
  totalCents: number;
  createdAt: Date;
  sentAt: Date | null;
  voiceJobId?: string | null;
};

export type QuoteDetailSnapshot = {
  status: string;
  customerPhone: string | null;
  totalCents: number;
  createdAt: string;
  sentAt: string | null;
};

export type QuoteDetailSource = 'local' | 'network' | 'none';

export type LoadQuoteDetailResult = {
  found: boolean;
  quote: QuoteDetailSnapshot | null;
  lineItems: QuoteLineItemResponse[];
  source: QuoteDetailSource;
  error: string | null;
};

type RemoteOk = {
  ok: true;
  quote: QuoteResponse;
  lineItems: QuoteLineItemResponse[];
};

type RemoteMiss = { ok: false } | { skipped: true };

/**
 * Map A-02 draft JSON (name, qty, cents, optional confidence / catalogItemId)
 * onto the quote-detail display rows.
 */
export function lineItemsFromDraftJson(json: string): QuoteLineItemResponse[] {
  return parseLineItems(json).map((item, index) => {
    const row: QuoteLineItemResponse = {
      id: String(index),
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    };
    if (item.confidence != null) {
      row.confidence = item.confidence;
    }
    if (item.catalogItemId) {
      row.catalogItemId = item.catalogItemId;
    }
    return row;
  });
}

/** Persist a network refresh in the same draft JSON shape hydrate writes. */
export function remoteLineItemsToDraftJson(
  items: QuoteLineItemResponse[],
): string {
  const lines: LineItem[] = items.map((item) => {
    const line: LineItem = {
      catalogItemId: item.catalogItemId ?? '',
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    };
    if (item.confidence != null) {
      line.confidence = item.confidence;
    }
    return line;
  });
  return serializeLineItems(lines);
}

function snapshotFromLocal(quote: LocalQuoteRecord): QuoteDetailSnapshot {
  return {
    status: quote.status,
    customerPhone: quote.customerPhone,
    totalCents: quote.totalCents,
    createdAt: quote.createdAt.toISOString(),
    sentAt: quote.sentAt?.toISOString() ?? null,
  };
}

function snapshotFromRemote(quote: QuoteResponse): QuoteDetailSnapshot {
  return {
    status: quote.status,
    customerPhone: quote.customerPhone,
    totalCents: quote.totalCents,
    createdAt: quote.createdAt,
    sentAt: quote.sentAt,
  };
}

/**
 * Pure merge of local Watermelon snapshot vs optional GET /quotes/:id.
 * Local draft JSON is enough to render; network is refresh or fallback.
 */
export function resolveQuoteDetailView(input: {
  localQuote: LocalQuoteRecord | null;
  localDraftJson: string | null;
  remote: RemoteOk | RemoteMiss;
}): LoadQuoteDetailResult {
  if (!input.localQuote) {
    return {
      found: false,
      quote: null,
      lineItems: [],
      source: 'none',
      error: QUOTE_DETAIL_NOT_FOUND,
    };
  }

  const localItems =
    input.localDraftJson != null
      ? lineItemsFromDraftJson(input.localDraftJson)
      : [];
  const hasLocalSnapshot = input.localDraftJson != null;

  if ('ok' in input.remote && input.remote.ok) {
    return {
      found: true,
      quote: snapshotFromRemote(input.remote.quote),
      lineItems: input.remote.lineItems,
      source: 'network',
      error: null,
    };
  }

  if (hasLocalSnapshot) {
    return {
      found: true,
      quote: snapshotFromLocal(input.localQuote),
      lineItems: localItems,
      source: 'local',
      error: null,
    };
  }

  if ('skipped' in input.remote) {
    return {
      found: true,
      quote: snapshotFromLocal(input.localQuote),
      lineItems: [],
      source: 'local',
      error: null,
    };
  }

  return {
    found: true,
    quote: snapshotFromLocal(input.localQuote),
    lineItems: [],
    source: 'none',
    error: QUOTE_DETAIL_OFFLINE_ERROR,
  };
}

export type LoadQuoteDetailDeps = {
  findQuote: () => Promise<LocalQuoteRecord>;
  findDrafts: () => Promise<{ lineItemsJson: string }[]>;
  fetchRemote?: (
    serverId: string,
  ) => Promise<{ quote: QuoteResponse; lineItems: QuoteLineItemResponse[] }>;
  isOnline?: () => boolean;
  onLocalSnapshot?: (result: LoadQuoteDetailResult) => void;
  persistRemoteLineItems?: (
    lineItems: QuoteLineItemResponse[],
  ) => Promise<void>;
};

/**
 * Load quote history detail: local draft first (HIST-04), then optional
 * network refresh when a serverId exists. Fetch is skipped when we already
 * have a local snapshot and the device is known offline.
 */
export async function loadQuoteDetail(
  deps: LoadQuoteDetailDeps,
): Promise<LoadQuoteDetailResult> {
  let localQuote: LocalQuoteRecord;
  try {
    localQuote = await deps.findQuote();
  } catch {
    return resolveQuoteDetailView({
      localQuote: null,
      localDraftJson: null,
      remote: { skipped: true },
    });
  }

  const drafts = await deps.findDrafts();
  const localDraftJson = drafts[0]?.lineItemsJson ?? null;
  const hasLocalSnapshot = localDraftJson != null;
  const serverId = localQuote.serverId?.trim() ?? '';

  const localView = resolveQuoteDetailView({
    localQuote,
    localDraftJson,
    remote: { skipped: true },
  });
  if (hasLocalSnapshot) {
    deps.onLocalSnapshot?.(localView);
  }

  const knownOffline = deps.isOnline ? !deps.isOnline() : false;
  const shouldFetch =
    Boolean(serverId) &&
    Boolean(deps.fetchRemote) &&
    !(hasLocalSnapshot && knownOffline);

  if (!shouldFetch) {
    return localView;
  }

  try {
    const remote = await deps.fetchRemote!(serverId);
    const refreshed = resolveQuoteDetailView({
      localQuote,
      localDraftJson,
      remote: { ok: true, quote: remote.quote, lineItems: remote.lineItems },
    });
    try {
      await deps.persistRemoteLineItems?.(remote.lineItems);
    } catch {
      // In-memory refresh still wins; next offline open keeps the prior draft.
    }
    return refreshed;
  } catch {
    return resolveQuoteDetailView({
      localQuote,
      localDraftJson,
      remote: { ok: false },
    });
  }
}
