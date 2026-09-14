/**
 * FAIL-04 / FAIL-05 contractor copy. Distinct from failed_send (SMS).
 */

export type AiFailureStage = 'asr' | 'mapping' | 'timeout';

export type AiFailedRecoveryView = {
  title: string;
  body: string;
  showRetry: boolean;
  showRecordAgain: boolean;
  retryLabel: string;
  manualLabel: string;
  recordAgainLabel: string;
};

const RETRY_LABEL = 'Retry recording';
const MANUAL_LABEL = 'Add items';
const RECORD_AGAIN_LABEL = 'Record again';

export function parseAiFailureStage(value: unknown): AiFailureStage | null {
  if (value === 'asr' || value === 'mapping' || value === 'timeout') {
    return value;
  }
  return null;
}

export function aiFailedRecoveryView(input: {
  audioExists: boolean;
  lineCount: number;
  failureStage?: AiFailureStage | null;
}): AiFailedRecoveryView {
  const showRetry = input.audioExists;
  const showRecordAgain = !input.audioExists;
  const mappingLike =
    input.lineCount > 0 ||
    input.failureStage === 'mapping' ||
    input.failureStage === 'timeout';

  if (mappingLike) {
    return {
      title: "Couldn't finish this quote from the recording",
      body: input.lineCount > 0
        ? 'Review the flagged lines, add catalog items yourself, or retry the original recording.'
        : 'Add items from your catalog, or retry the original recording if it is still on this device.',
      showRetry,
      showRecordAgain,
      retryLabel: RETRY_LABEL,
      manualLabel: MANUAL_LABEL,
      recordAgainLabel: RECORD_AGAIN_LABEL,
    };
  }

  return {
    title: "Couldn't transcribe this recording",
    body: showRetry
      ? 'Your audio is still on this device. Retry the same recording, or add items from your catalog.'
      : 'The original audio is no longer on this device. Record again, or add items from your catalog.',
    showRetry,
    showRecordAgain,
    retryLabel: RETRY_LABEL,
    manualLabel: MANUAL_LABEL,
    recordAgainLabel: RECORD_AGAIN_LABEL,
  };
}
