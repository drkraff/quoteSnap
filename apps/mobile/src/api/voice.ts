import { apiClient } from './client';

interface UploadAudioResponse {
  jobId: string;
  quoteId: string;
}

export interface VoiceStatusResponse {
  status: 'processing' | 'complete' | 'failed';
  draftId?: string;
  error?: string;
}

export async function uploadAudio(filePath: string, quoteServerId?: string): Promise<UploadAudioResponse> {
  const formData = new FormData();
  formData.append('audio', {
    uri: filePath,
    type: 'audio/mp4',
    name: 'recording.m4a',
  } as unknown as Blob);

  if (quoteServerId) {
    formData.append('quoteServerId', quoteServerId);
  }

  // FormData goes through apiClient so expired access tokens refresh the same
  // way as JSON resource calls. The client omits Content-Type so the runtime
  // can set multipart/form-data with a boundary (multer requires that).
  return apiClient.post<UploadAudioResponse>('/voice/upload', formData);
}

export interface DraftLineItemsResponse {
  quoteId: string;
  totalCents: number;
  lineItems: Array<{
    catalogItemId: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
    confidence: number | undefined;
  }>;
}

export async function getDraftLineItems(quoteId: string): Promise<DraftLineItemsResponse> {
  return apiClient.get<DraftLineItemsResponse>(`/voice/draft/${quoteId}`);
}

export async function getVoiceStatus(jobId: string): Promise<VoiceStatusResponse> {
  return apiClient.get<VoiceStatusResponse>(`/voice/status/${jobId}`);
}
