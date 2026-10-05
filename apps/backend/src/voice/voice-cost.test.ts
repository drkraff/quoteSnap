import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAPPING_MODEL,
  VOICE_COST_AS_OF,
  VOICE_COST_NOTE,
  VOICE_PRICE_TABLE,
  WHISPER_MODEL,
  buildVoiceCostLog,
  estimateVoiceCost,
  readAudioDurationSeconds,
  readMappingUsage,
  readTranscriptionUsage,
  type TokenUsage,
} from "./voice-cost.js";

const ZERO_USAGE: TokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cachedPromptTokens: null,
};

describe("estimateVoiceCost", () => {
  it("prices whisper-1 by duration and gpt-4o by returned token counts", () => {
    const estimate = estimateVoiceCost({
      transcriptionModel: WHISPER_MODEL,
      mappingModel: MAPPING_MODEL,
      audioDurationSeconds: 90,
      transcriptionUsage: null,
      mappingUsage: {
        promptTokens: 1_000,
        completionTokens: 500,
        totalTokens: 1_500,
        cachedPromptTokens: null,
      },
    });
    assert.equal(estimate.transcriptionUsd, 0.009);
    assert.equal(estimate.mappingUsd, 0.0075);
    assert.equal(estimate.estimatedCostUsd, 0.0165);
  });

  it("prices cached prompt tokens only when the API returned a cached count", () => {
    const withCache = estimateVoiceCost({
      transcriptionModel: WHISPER_MODEL,
      mappingModel: MAPPING_MODEL,
      audioDurationSeconds: 60,
      transcriptionUsage: null,
      mappingUsage: {
        promptTokens: 1_000,
        completionTokens: 100,
        totalTokens: 1_100,
        cachedPromptTokens: 400,
      },
    });
    assert.equal(withCache.transcriptionUsd, 0.006);
    assert.equal(withCache.mappingUsd, 0.003);
    assert.equal(withCache.estimatedCostUsd, 0.009);

    const withoutCache = estimateVoiceCost({
      transcriptionModel: WHISPER_MODEL,
      mappingModel: MAPPING_MODEL,
      audioDurationSeconds: 60,
      transcriptionUsage: null,
      mappingUsage: {
        promptTokens: 1_000,
        completionTokens: 100,
        totalTokens: 1_100,
        cachedPromptTokens: null,
      },
    });
    assert.equal(withoutCache.mappingUsd, 0.0035);
  });

  it("keeps null when duration or token counts were not returned", () => {
    const missing = estimateVoiceCost({
      transcriptionModel: WHISPER_MODEL,
      mappingModel: MAPPING_MODEL,
      audioDurationSeconds: null,
      transcriptionUsage: null,
      mappingUsage: null,
    });
    assert.equal(missing.transcriptionUsd, null);
    assert.equal(missing.mappingUsd, null);
    assert.equal(missing.estimatedCostUsd, null);

    const partial = estimateVoiceCost({
      transcriptionModel: WHISPER_MODEL,
      mappingModel: MAPPING_MODEL,
      audioDurationSeconds: null,
      transcriptionUsage: {
        promptTokens: 10,
        completionTokens: 2,
        totalTokens: 12,
        cachedPromptTokens: null,
      },
      mappingUsage: {
        promptTokens: 1_000_000,
        completionTokens: null,
        totalTokens: null,
        cachedPromptTokens: null,
      },
    });
    assert.equal(partial.transcriptionUsd, null);
    assert.equal(partial.mappingUsd, null);
    assert.equal(partial.estimatedCostUsd, null);
  });

  it("treats an explicit zero as zero and does not invent a price for an unknown model", () => {
    const zeros = estimateVoiceCost({
      transcriptionModel: WHISPER_MODEL,
      mappingModel: MAPPING_MODEL,
      audioDurationSeconds: 0,
      transcriptionUsage: null,
      mappingUsage: ZERO_USAGE,
    });
    assert.equal(zeros.transcriptionUsd, 0);
    assert.equal(zeros.mappingUsd, 0);
    assert.equal(zeros.estimatedCostUsd, 0);

    const unknown = estimateVoiceCost({
      transcriptionModel: "gpt-4o-transcribe",
      mappingModel: "gpt-4o-mini",
      audioDurationSeconds: 60,
      transcriptionUsage: null,
      mappingUsage: {
        promptTokens: 100,
        completionTokens: 100,
        totalTokens: 200,
        cachedPromptTokens: null,
      },
    });
    assert.equal(unknown.transcriptionUsd, null);
    assert.equal(unknown.mappingUsd, null);
    assert.equal(unknown.estimatedCostUsd, null);
  });

  it("returns null when cached tokens are higher than prompt tokens", () => {
    const estimate = estimateVoiceCost({
      transcriptionModel: WHISPER_MODEL,
      mappingModel: MAPPING_MODEL,
      audioDurationSeconds: 60,
      transcriptionUsage: null,
      mappingUsage: {
        promptTokens: 10,
        completionTokens: 1,
        totalTokens: 11,
        cachedPromptTokens: 11,
      },
    });
    assert.equal(estimate.mappingUsd, null);
    assert.equal(estimate.estimatedCostUsd, null);
  });

  it("labels the price table with the check date and that the figures are estimates", () => {
    assert.equal(VOICE_COST_AS_OF, "2026-10-05");
    assert.equal(VOICE_PRICE_TABLE.asOf, "2026-10-05");
    assert.equal(VOICE_PRICE_TABLE.transcriptionUsdPerMinute[WHISPER_MODEL], 0.006);
    assert.equal(VOICE_PRICE_TABLE.mappingUsdPerMillionTokens[MAPPING_MODEL].input, 2.5);
    assert.equal(VOICE_PRICE_TABLE.mappingUsdPerMillionTokens[MAPPING_MODEL].output, 10);
    assert.match(VOICE_COST_NOTE, /2026-10-05/);
    assert.match(VOICE_COST_NOTE, /Estimates to verify/);
    assert.match(VOICE_COST_NOTE, /not stored/i);
  });
});

describe("OpenAI usage readers", () => {
  it("returns null when the response has no duration or usage", () => {
    assert.equal(readAudioDurationSeconds({ text: "hello" }), null);
    assert.equal(readTranscriptionUsage({ text: "hello" }), null);
    assert.equal(readMappingUsage({ choices: [] }), null);
    assert.equal(readMappingUsage(null), null);
    assert.equal(readAudioDurationSeconds({ duration: "12" }), null);
  });

  it("reads duration and token fields that are present and leaves the rest null", () => {
    assert.equal(readAudioDurationSeconds({ text: "hello", duration: 12.5 }), 12.5);
    assert.equal(
      readAudioDurationSeconds({ text: "hello", usage: { type: "duration", seconds: 8 } }),
      8,
    );
    assert.equal(
      readTranscriptionUsage({ usage: { type: "duration", seconds: 8 } }),
      null,
    );
    assert.deepEqual(
      readMappingUsage({
        usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
      }),
      {
        promptTokens: 3,
        completionTokens: 4,
        totalTokens: 7,
        cachedPromptTokens: null,
      },
    );
    assert.deepEqual(
      readTranscriptionUsage({
        usage: { type: "tokens", input_tokens: 5, output_tokens: 6, total_tokens: 11 },
      }),
      {
        promptTokens: 5,
        completionTokens: 6,
        totalTokens: 11,
        cachedPromptTokens: null,
      },
    );
    assert.deepEqual(readMappingUsage({ usage: { prompt_tokens: "10" } }), {
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      cachedPromptTokens: null,
    });
    assert.deepEqual(
      readMappingUsage({
        usage: {
          prompt_tokens: 20,
          completion_tokens: 2,
          total_tokens: 22,
          prompt_tokens_details: { cached_tokens: 4 },
        },
      })?.cachedPromptTokens,
      4,
    );
  });
});

describe("buildVoiceCostLog", () => {
  it("emits one voice_cost line and does not fill usage the API omitted", () => {
    const line = buildVoiceCostLog({
      quoteId: "quote-1",
      jobId: "job-1",
      audioDurationSeconds: null,
      transcriptionUsage: null,
      mappingUsage: {
        promptTokens: 1_000_000,
        completionTokens: 0,
        totalTokens: 1_000_000,
        cachedPromptTokens: null,
      },
    });
    assert.equal(line.msg, "voice_cost");
    assert.equal(line.quoteId, "quote-1");
    assert.equal(line.jobId, "job-1");
    assert.equal(line.audioDurationSeconds, null);
    assert.deepEqual(line.models, { transcription: "whisper-1", mapping: "gpt-4o" });
    assert.equal(line.usage.transcription, null);
    assert.equal(line.usage.mapping?.promptTokens, 1_000_000);
    assert.equal(line.estimate.transcriptionUsd, null);
    assert.equal(line.estimate.mappingUsd, 2.5);
    assert.equal(line.estimatedCostUsd, null);
    assert.equal(line.estimate.asOf, "2026-10-05");
    assert.equal("stack" in line, false);
  });
});
