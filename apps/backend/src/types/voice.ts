export interface VoiceJobData {
  quoteId: string;
  contractorId: string;
  r2Key: string;
}

export interface AILineItem {
  catalogItemId: string;
  quantity: number;
  confidence: number;
}

export interface VoiceStatusResponse {
  status: 'processing' | 'complete' | 'failed';
  draftId?: string;
  error?: string;
}
