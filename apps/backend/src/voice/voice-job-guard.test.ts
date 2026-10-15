import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  READ_VOICE_JOB_GATE_SQL,
  REOPEN_VOICE_ATTEMPT_SQL,
  readVoiceJobGate,
  reopenCurrentVoiceAttempt,
} from "./voice-job-guard.js";

const QUOTE_ID = "quote-1";
const JOB_ID = "job-current";

describe("readVoiceJobGate", () => {
  it("treats the stored job as the current generation while the quote is still processing", async () => {
    const gate = await readVoiceJobGate(
      async () => ({ rows: [{ status: "ai_processing", voice_job_id: JOB_ID }] }),
      QUOTE_ID,
      JOB_ID,
    );
    assert.equal(gate, "current");
  });

  it("treats a missing job id as unassigned so the first pass can still finish", async () => {
    const gate = await readVoiceJobGate(
      async () => ({ rows: [{ status: "ai_processing", voice_job_id: null }] }),
      QUOTE_ID,
      JOB_ID,
    );
    assert.equal(gate, "unassigned");
  });

  it("discards a previous job after a re-record stored a newer id", async () => {
    const calls: string[] = [];
    const gate = await readVoiceJobGate(
      async (sql) => {
        calls.push(sql);
        return { rows: [{ status: "ai_processing", voice_job_id: "job-new" }] };
      },
      QUOTE_ID,
      "job-old",
    );
    assert.equal(gate, "stale");
    assert.equal(calls[0], READ_VOICE_JOB_GATE_SQL);
  });

  it("discards a late job once the quote was marked sent or saved as a draft", async () => {
    assert.equal(
      await readVoiceJobGate(
        async () => ({ rows: [{ status: "sent", voice_job_id: JOB_ID }] }),
        QUOTE_ID,
        JOB_ID,
      ),
      "stale",
    );
    assert.equal(
      await readVoiceJobGate(
        async () => ({ rows: [{ status: "draft_local", voice_job_id: JOB_ID }] }),
        QUOTE_ID,
        JOB_ID,
      ),
      "stale",
    );
    assert.equal(
      await readVoiceJobGate(async () => ({ rows: [] }), QUOTE_ID, JOB_ID),
      "stale",
    );
  });

  it("keeps a same-job retry that is still ai_failed", async () => {
    assert.equal(
      await readVoiceJobGate(
        async () => ({ rows: [{ status: "ai_failed", voice_job_id: JOB_ID }] }),
        QUOTE_ID,
        JOB_ID,
      ),
      "current",
    );
  });
});

describe("reopenCurrentVoiceAttempt", () => {
  it("reopens only the same job's ai_failed row", async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    await reopenCurrentVoiceAttempt(
      async (sql, params) => {
        calls.push({ sql, params });
        return { rows: [] };
      },
      QUOTE_ID,
      JOB_ID,
    );
    assert.equal(calls[0]!.sql, REOPEN_VOICE_ATTEMPT_SQL);
    assert.deepEqual(calls[0]!.params, [QUOTE_ID, JOB_ID]);
    assert.match(REOPEN_VOICE_ATTEMPT_SQL, /status = 'ai_failed'/);
    assert.match(REOPEN_VOICE_ATTEMPT_SQL, /voice_job_id = \$2/);
  });

  it("does nothing for a blank job id", async () => {
    let called = false;
    await reopenCurrentVoiceAttempt(
      async () => {
        called = true;
        return { rows: [] };
      },
      QUOTE_ID,
      "  ",
    );
    assert.equal(called, false);
  });
});
