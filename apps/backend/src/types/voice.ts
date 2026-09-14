export interface VoiceJobData {
  quoteId: string;
  contractorId: string;
  r2Key: string;
}

export interface AILineItem {
  catalogItemId?: string | null;
  name?: string;
  quantity?: number;
  unit?: string;
  /** Integer cents the contractor said. Omit/null if they did not say a price. */
  spokenUnitPriceCents?: number | null;
  confidence?: number;
}

export interface VoiceStatusResponse {
  status: 'processing' | 'complete' | 'failed';
  draftId?: string;
  error?: string;
}
