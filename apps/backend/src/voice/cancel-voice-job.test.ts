import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { VOICE_PROCESS_QUEUE, cancelSupersededVoiceJob } from "./cancel-voice-job.js";

describe("cancelSupersededVoiceJob", () => {
  it("cancels the previous voice-process job", async () => {
    const calls: Array<{ queue: string; jobId: string }> = [];
    await cancelSupersededVoiceJob(async (queue, jobId) => {
      calls.push({ queue, jobId });
    }, "job-old");
    assert.deepEqual(calls, [{ queue: VOICE_PROCESS_QUEUE, jobId: "job-old" }]);
  });

  it("skips a blank id and ignores a cancel failure", async () => {
    let calls = 0;
    await cancelSupersededVoiceJob(async () => {
      calls += 1;
    }, "  ");
    assert.equal(calls, 0);

    await cancelSupersededVoiceJob(async () => {
      throw new Error("already finished");
    }, "job-old");
  });
});
