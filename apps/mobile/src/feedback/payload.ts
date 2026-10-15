import { FEEDBACK_MESSAGE_MAX, FEEDBACK_SCREENSHOT_MAX_BYTES } from './copy';
import { isFeedbackUuid } from './screen';

export type FeedbackRequestBody = {
  message: string;
  rating?: number;
  screen?: string;
  quoteId?: string;
  appVersion?: string;
  platform?: string;
  screenshotBase64?: string;
};

export type FeedbackDraft = {
  message: string;
  rating: number | null;
  screen: string | null;
  quoteId: string | null;
  appVersion: string;
  platform: string;
  screenshotBase64: string | null;
};

function decodeBase64(raw: string): Uint8Array | null {
  try {
    const binary = globalThis.atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function isPngOrJpeg(bytes: Uint8Array): boolean {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return true;
  }
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Drop a shot the API would reject so the note itself can still send. */
export function normalizeScreenshotBase64(value: string | null | undefined): string | null {
  if (!value) return null;
  let raw = value.trim().replace(/\s+/g, '');
  const prefix = /^data:image\/[a-z0-9.+-]+;base64,/i.exec(raw);
  if (prefix) raw = raw.slice(prefix[0].length);
  if (raw.length === 0 || raw.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return null;
  const bytes = decodeBase64(raw);
  if (!bytes || bytes.length === 0 || bytes.length > FEEDBACK_SCREENSHOT_MAX_BYTES) return null;
  if (!isPngOrJpeg(bytes)) return null;
  return raw;
}

export function readAppVersion(version: unknown): string {
  if (typeof version !== 'string') return 'unknown';
  const trimmed = version.trim();
  if (trimmed.length === 0) return 'unknown';
  return trimmed.slice(0, 32);
}

export function readPlatform(os: string): string {
  if (os === 'ios' || os === 'android') return os;
  return 'unknown';
}

export function buildFeedbackRequest(draft: FeedbackDraft): FeedbackRequestBody | null {
  const message = draft.message.split('\0').join('').trim();
  if (message.length === 0 || message.length > FEEDBACK_MESSAGE_MAX) return null;
  const body: FeedbackRequestBody = { message };
  if (draft.rating !== null && Number.isInteger(draft.rating) && draft.rating >= 1 && draft.rating <= 5) {
    body.rating = draft.rating;
  }
  const screen = draft.screen?.trim() ?? '';
  if (screen.length > 0) body.screen = screen.slice(0, 64);
  if (draft.quoteId && isFeedbackUuid(draft.quoteId)) body.quoteId = draft.quoteId.trim();
  const appVersion = readAppVersion(draft.appVersion);
  if (appVersion !== 'unknown') body.appVersion = appVersion;
  else body.appVersion = 'unknown';
  body.platform = readPlatform(draft.platform);
  const screenshot = normalizeScreenshotBase64(draft.screenshotBase64);
  if (screenshot) body.screenshotBase64 = screenshot;
  return body;
}
