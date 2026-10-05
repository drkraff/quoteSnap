import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  failedVoiceStatusPayload,
  flagPartialMappingLines,
  isVoiceDraftReadable,
  MARK_QUOTE_AI_FAILED_SQL,
  markQuoteAiFailed,
  MAPPING_FAILURE_MAX_CONFIDENCE,
  parseAiFailureStage,
  voiceJobStateIsFailed,
} from "./ai-failure.js";

describe("parseAiFailureStage", () => {
  it("accepts the three FAIL-04/05 stages", () => {
    assert.equal(parseAiFailureStage("asr"), "asr");
    assert.equal(parseAiFailureStage("mapping"), "mapping");
    assert.equal(parseAiFailureStage("timeout"), "timeout");
  });

  it("rejects unknown or empty values", () => {
    assert.equal(parseAiFailureStage("failed_send"), null);
    assert.equal(parseAiFailureStage("ai_failed"), null);
    assert.equal(parseAiFailureStage(""), null);
    assert.equal(parseAiFailureStage(null), null);
    assert.equal(parseAiFailureStage(undefined), null);
  });
});

describe("isVoiceDraftReadable", () => {
  it("blocks only ai_processing so FAIL-05 can return a partial draft", () => {
    assert.equal(isVoiceDraftReadable("ai_processing"), false);
    assert.equal(isVoiceDraftReadable("ai_failed"), true);
    assert.equal(isVoiceDraftReadable("draft_local"), true);
  });
});

describe("failedVoiceStatusPayload", () => {
  it("includes draftId so the poller can fetch partial lines", () => {
    assert.deepEqual(failedVoiceStatusPayload("quote-1", null), {
      status: "failed",
      error: "Processing failed",
      draftId: "quote-1",
    });
  });

  it("forwards a known failure stage and ignores failed_send", () => {
    assert.equal(failedVoiceStatusPayload("q", "asr").failureStage, "asr");
    assert.equal(failedVoiceStatusPayload("q", "mapping").failureStage, "mapping");
    assert.equal(failedVoiceStatusPayload("q", "failed_send").failureStage, undefined);
  });
});

describe("voiceJobStateIsFailed", () => {
  it("treats expired and cancelled jobs as failed without waiting for the reaper", () => {
    assert.equal(voiceJobStateIsFailed("failed"), true);
    assert.equal(voiceJobStateIsFailed("expired"), true);
    assert.equal(voiceJobStateIsFailed("cancelled"), true);
    assert.equal(voiceJobStateIsFailed("completed"), false);
    assert.equal(voiceJobStateIsFailed("active"), false);
    assert.equal(voiceJobStateIsFailed("created"), false);
    assert.equal(voiceJobStateIsFailed("retry"), false);
    assert.equal(voiceJobStateIsFailed(null), false);
    const started = new Date("2026-10-05T00:00:00.000Z");
    assert.equal(
      voiceJobStateIsFailed("active", {
        startedOn: started,
        expireInSeconds: 60,
        now: new Date("2026-10-05T00:01:00.000Z"),
      }),
      true,
    );
    assert.equal(
      voiceJobStateIsFailed("active", {
        startedOn: started,
        expireInSeconds: 60,
        now: new Date("2026-10-05T00:00:30.000Z"),
      }),
      false,
    );
  });

  it("is what GET /voice/status uses instead of only job.state === failed", () => {
    const source = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "../routes/voice.ts"),
      "utf8",
    );
    assert.match(source, /voiceJobStateIsFailed\(\s*job\.state/);
    assert.match(source, /expireInSeconds:\s*job\.expireInSeconds/);
  });
});

describe("flagPartialMappingLines", () => {
  it("caps confidence into the Needs Input tier without changing prices", () => {
    const flagged = flagPartialMappingLines([
      { name: "Pipe", unitPriceCents: 1500, confidence: 0.92 },
      { name: "Adhoc", unitPriceCents: null, confidence: 0.4 },
    ]);
    assert.deepEqual(flagged, [
      { name: "Pipe", unitPriceCents: 1500, confidence: MAPPING_FAILURE_MAX_CONFIDENCE },
      { name: "Adhoc", unitPriceCents: null, confidence: 0.4 },
    ]);
    assert.ok(MAPPING_FAILURE_MAX_CONFIDENCE < 0.6);
  });
});

describe("markQuoteAiFailed", () => {
  it("parameterizes quote id and stage and only updates ai_processing", async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    await markQuoteAiFailed(
      async (sql, params) => {
        calls.push({ sql, params });
        return { rows: [] };
      },
      "quote-1",
      "asr",
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.sql, MARK_QUOTE_AI_FAILED_SQL);
    assert.deepEqual(calls[0]!.params, ["quote-1", "asr"]);
    assert.match(MARK_QUOTE_AI_FAILED_SQL, /status = 'ai_processing'/);
    assert.match(MARK_QUOTE_AI_FAILED_SQL, /ai_failure_stage = \$2/);
    assert.equal(MARK_QUOTE_AI_FAILED_SQL.includes("failed_send"), false);
  });
});
