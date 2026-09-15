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
  /** Integer cents the contractor said as a sell/charge price. Omit/null if they did not say a sell price. */
  spokenUnitPriceCents?: number | null;
  /**
   * Integer cents the contractor said (or typed in capture notes) as a
   * supplier/material cost — not the sell price. Omit/null if they did not
   * name a cost. Attach may compute sell = cost × (1 + markup/100).
   */
  spokenMaterialCostCents?: number | null;
  confidence?: number;
  /** Spoken room/zone for this line. Omit if they did not name a room. */
  room?: string | null;
}

export interface VoiceExtractResult {
  items: AILineItem[];
  /** Integer hours spoken for the job. Omit/null if they did not say hours. */
  spokenHours?: number | null;
  /** Client-facing scope / exclusions. Joined into quotes.client_sentence. */
  assumptions?: string[] | string | null;
}

export interface VoiceStatusResponse {
  status: 'processing' | 'complete' | 'failed';
  draftId?: string;
  error?: string;
  /** FAIL-04/05: asr | mapping | timeout when status is failed. */
  failureStage?: 'asr' | 'mapping' | 'timeout';
}
