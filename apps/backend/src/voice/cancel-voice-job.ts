import { errorSummary, log } from "../log/logger.js";

export const VOICE_PROCESS_QUEUE = "voice-process";

export type CancelVoiceJobFn = (queue: string, jobId: string) => Promise<unknown>;

/**
 * Best-effort cancel of the job a re-record replaced. An in-flight worker
 * keeps running; the commit guard drops that result when the job id no longer
 * matches. A cancel error must not fail the new upload.
 */
export async function cancelSupersededVoiceJob(
  cancel: CancelVoiceJobFn,
  jobId: string | null | undefined,
): Promise<void> {
  const id = typeof jobId === "string" ? jobId.trim() : "";
  if (id === "") return;
  try {
    await cancel(VOICE_PROCESS_QUEUE, id);
  } catch (err) {
    log("info", {
      msg: "voice_job_cancel_skipped",
      jobId: id,
      error: errorSummary(err),
    });
  }
}
