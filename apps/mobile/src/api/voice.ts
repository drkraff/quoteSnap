import Constants from 'expo-constants';

const API_BASE_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://10.0.2.2:3000';

interface UploadAudioResponse {
  jobId: string;
  quoteId: string;
}

export interface VoiceStatusResponse {
  status: 'processing' | 'complete' | 'failed';
  draftId?: string;
  error?: string;
}

export async function uploadAudio(filePath: string, quoteServerId: string): Promise<UploadAudioResponse> {
  // Lazy import to avoid circular dependency
  const { useAuthStore } = await import('../store/auth-store');
  const accessToken = useAuthStore.getState().accessToken;

  const formData = new FormData();
  formData.append('audio', {
    uri: filePath,
    type: 'audio/mp4',
    name: 'recording.m4a',
  } as unknown as Blob);

  formData.append('quoteServerId', quoteServerId);

  const response = await fetch(`${API_BASE_URL}/voice/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken ?? ''}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Upload failed: ${response.status} ${errorBody}`);
  }

  return response.json() as Promise<UploadAudioResponse>;
}

export async function getVoiceStatus(jobId: string): Promise<VoiceStatusResponse> {
  const { useAuthStore } = await import('../store/auth-store');
  const accessToken = useAuthStore.getState().accessToken;

  const response = await fetch(`${API_BASE_URL}/voice/status/${jobId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken ?? ''}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Status check failed: ${response.status}`);
  }

  return response.json() as Promise<VoiceStatusResponse>;
}
