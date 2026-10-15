import * as FileSystem from 'expo-file-system';
import { parseFeedbackQueue, type FeedbackQueueItem } from './queue';

const QUEUE_FILE = 'feedback-queue.json';

function queueUri(): string | null {
  const base = FileSystem.documentDirectory;
  if (!base) return null;
  return `${base}${QUEUE_FILE}`;
}

export async function loadFeedbackQueueFromDisk(): Promise<FeedbackQueueItem[]> {
  const uri = queueUri();
  if (!uri) return [];
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(uri);
    return parseFeedbackQueue(raw);
  } catch {
    return [];
  }
}

export async function saveFeedbackQueueToDisk(items: FeedbackQueueItem[]): Promise<void> {
  const uri = queueUri();
  if (!uri) return;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(items));
}
