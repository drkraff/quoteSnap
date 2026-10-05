/**
 * Estimated OpenAI spend for one voice job.
 *
 * List prices checked 2026-10-05:
 * - whisper-1: $0.006 per minute
 *   https://developers.openai.com/api/docs/models/whisper-1
 * - gpt-4o: $2.50 / 1M input, $1.25 / 1M cached input, $10.00 / 1M output
 *   https://developers.openai.com/api/docs/models/gpt-4o
 *
 * These are estimates to verify against the pricing page and the invoice.
 * They are not billed amounts and are not stored.
 */

export const VOICE_COST_AS_OF = "2026-10-05";

export const VOICE_COST_NOTE =
  "Estimated from published OpenAI list prices as of 2026-10-05 (whisper-1 $0.006/minute; gpt-4o $2.50/1M input, $1.25/1M cached input, $10/1M output). Estimates to verify against the pricing page and the invoice. Not a billed amount and not stored.";

/** Model strings passed to the OpenAI calls. Do not change them here alone. */
export const WHISPER_MODEL = "whisper-1";
export const MAPPING_MODEL = "gpt-4o";

export const VOICE_PRICE_TABLE = {
  asOf: VOICE_COST_AS_OF,
  note: VOICE_COST_NOTE,
  transcriptionUsdPerMinute: {
    [WHISPER_MODEL]: 0.006,
  },
  mappingUsdPerMillionTokens: {
    [MAPPING_MODEL]: {
      input: 2.5,
      cachedInput: 1.25,
      output: 10,
    },
  },
} as const;

const USD_SCALE = 100_000_000;

export type TokenUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cachedPromptTokens: number | null;
};

export type VoiceCostInput = {
  transcriptionModel: string;
  mappingModel: string;
  audioDurationSeconds: number | null;
  transcriptionUsage: TokenUsage | null;
  mappingUsage: TokenUsage | null;
};

export type VoiceCostEstimate = {
  transcriptionUsd: number | null;
  mappingUsd: number | null;
  estimatedCostUsd: number | null;
};

function roundUsd(value: number): number {
  return Math.round(value * USD_SCALE) / USD_SCALE;
}

function finiteCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function firstPresent(
  record: Record<string, unknown>,
  keys: string[],
): number | null | undefined {
  for (const key of keys) {
    if (hasOwn(record, key)) return finiteCount(record[key]);
  }
  return undefined;
}

function readCached(record: Record<string, unknown>): number | null | undefined {
  const details = record["prompt_tokens_details"] ?? record["input_tokens_details"];
  if (!details || typeof details !== "object") return undefined;
  const detail = details as Record<string, unknown>;
  return firstPresent(detail, ["cached_tokens", "cachedTokens"]);
}

function readTokenFields(record: Record<string, unknown>): TokenUsage | null {
  const prompt = firstPresent(record, ["prompt_tokens", "input_tokens", "promptTokens"]);
  const completion = firstPresent(record, [
    "completion_tokens",
    "output_tokens",
    "completionTokens",
  ]);
  const total = firstPresent(record, ["total_tokens", "totalTokens"]);
  const cached = readCached(record);
  if (
    prompt === undefined &&
    completion === undefined &&
    total === undefined &&
    cached === undefined
  ) {
    return null;
  }
  return {
    promptTokens: prompt ?? null,
    completionTokens: completion ?? null,
    totalTokens: total ?? null,
    cachedPromptTokens: cached ?? null,
  };
}

/** Seconds from a transcription payload. Missing or non-numeric values stay null. */
export function readAudioDurationSeconds(transcription: unknown): number | null {
  if (!transcription || typeof transcription !== "object") return null;
  const record = transcription as Record<string, unknown>;
  if (hasOwn(record, "duration")) return finiteCount(record["duration"]);
  const usage = record["usage"];
  if (!usage || typeof usage !== "object") return null;
  const usageRecord = usage as Record<string, unknown>;
  if (usageRecord["type"] === "duration" && hasOwn(usageRecord, "seconds")) {
    return finiteCount(usageRecord["seconds"]);
  }
  return null;
}

/** Token usage on a transcription response. Duration-only usage is null here. */
export function readTranscriptionUsage(transcription: unknown): TokenUsage | null {
  if (!transcription || typeof transcription !== "object") return null;
  const usage = (transcription as Record<string, unknown>)["usage"];
  if (!usage || typeof usage !== "object") return null;
  const record = usage as Record<string, unknown>;
  if (record["type"] === "duration") return null;
  return readTokenFields(record);
}

/** Token usage on a chat completion. Absent `usage` stays null. */
export function readMappingUsage(completion: unknown): TokenUsage | null {
  if (!completion || typeof completion !== "object") return null;
  const usage = (completion as Record<string, unknown>)["usage"];
  if (!usage || typeof usage !== "object") return null;
  return readTokenFields(usage as Record<string, unknown>);
}

function transcriptionUsd(
  model: string,
  audioDurationSeconds: number | null,
): number | null {
  const table = VOICE_PRICE_TABLE.transcriptionUsdPerMinute as Record<string, number>;
  const perMinute = table[model];
  if (perMinute === undefined) return null;
  if (audioDurationSeconds === null) return null;
  if (!Number.isFinite(audioDurationSeconds) || audioDurationSeconds < 0) return null;
  return roundUsd((audioDurationSeconds / 60) * perMinute);
}

function mappingUsd(model: string, usage: TokenUsage | null): number | null {
  const table = VOICE_PRICE_TABLE.mappingUsdPerMillionTokens as Record<
    string,
    { input: number; cachedInput: number; output: number }
  >;
  const prices = table[model];
  if (!prices || !usage) return null;
  const { promptTokens, completionTokens, cachedPromptTokens } = usage;
  if (promptTokens === null || completionTokens === null) return null;
  if (cachedPromptTokens === null) {
    return roundUsd(
      (promptTokens * prices.input + completionTokens * prices.output) / 1_000_000,
    );
  }
  if (cachedPromptTokens > promptTokens) return null;
  const uncached = promptTokens - cachedPromptTokens;
  return roundUsd(
    (uncached * prices.input +
      cachedPromptTokens * prices.cachedInput +
      completionTokens * prices.output) /
      1_000_000,
  );
}

/**
 * Dollar estimate from known duration and known token counts.
 * A missing input stays null. Zero is kept when the caller passed zero.
 * `estimatedCostUsd` is null unless both components can be priced.
 */
export function estimateVoiceCost(input: VoiceCostInput): VoiceCostEstimate {
  const transcription = transcriptionUsd(input.transcriptionModel, input.audioDurationSeconds);
  const mapping = mappingUsd(input.mappingModel, input.mappingUsage);
  const estimatedCostUsd =
    transcription === null || mapping === null ? null : roundUsd(transcription + mapping);
  return {
    transcriptionUsd: transcription,
    mappingUsd: mapping,
    estimatedCostUsd,
  };
}

export type VoiceCostLog = {
  msg: "voice_cost";
  quoteId: string;
  jobId: string | null;
  audioDurationSeconds: number | null;
  models: { transcription: typeof WHISPER_MODEL; mapping: typeof MAPPING_MODEL };
  usage: { transcription: TokenUsage | null; mapping: TokenUsage | null };
  estimatedCostUsd: number | null;
  estimate: {
    asOf: typeof VOICE_COST_AS_OF;
    note: typeof VOICE_COST_NOTE;
    transcriptionUsd: number | null;
    mappingUsd: number | null;
    prices: typeof VOICE_PRICE_TABLE;
  };
};

/** One structured line per voice job attempt. Usage objects are passed through. */
export function buildVoiceCostLog(input: {
  quoteId: string;
  jobId: string | null;
  audioDurationSeconds: number | null;
  transcriptionUsage: TokenUsage | null;
  mappingUsage: TokenUsage | null;
}): VoiceCostLog {
  const estimate = estimateVoiceCost({
    transcriptionModel: WHISPER_MODEL,
    mappingModel: MAPPING_MODEL,
    audioDurationSeconds: input.audioDurationSeconds,
    transcriptionUsage: input.transcriptionUsage,
    mappingUsage: input.mappingUsage,
  });
  return {
    msg: "voice_cost",
    quoteId: input.quoteId,
    jobId: input.jobId,
    audioDurationSeconds: input.audioDurationSeconds,
    models: { transcription: WHISPER_MODEL, mapping: MAPPING_MODEL },
    usage: {
      transcription: input.transcriptionUsage,
      mapping: input.mappingUsage,
    },
    estimatedCostUsd: estimate.estimatedCostUsd,
    estimate: {
      asOf: VOICE_COST_AS_OF,
      note: VOICE_COST_NOTE,
      transcriptionUsd: estimate.transcriptionUsd,
      mappingUsd: estimate.mappingUsd,
      prices: VOICE_PRICE_TABLE,
    },
  };
}
