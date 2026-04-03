export type ConfidenceTier = 'clean' | 'review' | 'needs_input';

export function confidenceTier(confidence: number | undefined): ConfidenceTier {
  if (confidence === undefined) return 'clean';
  if (confidence >= 0.85) return 'clean';
  if (confidence >= 0.60) return 'review';
  return 'needs_input';
}
