import { normalizeScreenshotBase64 } from './payload';

type CaptureScreen = (options: {
  format: 'jpg';
  quality: number;
  result: 'base64';
  width: number;
}) => Promise<string>;

/**
 * react-native-view-shot 4.0.3 works in an Expo 52 dev build (this app keeps
 * the old architecture). Expo Go and a binary that has not been rebuilt yet
 * have no native module; capture then fails closed and the note still sends.
 */
export async function captureCurrentScreen(capture: CaptureScreen | null): Promise<string | null> {
  if (!capture) return null;
  try {
    const raw = await capture({
      format: 'jpg',
      quality: 0.5,
      result: 'base64',
      width: 480,
    });
    return normalizeScreenshotBase64(raw);
  } catch {
    return null;
  }
}

let loaded: CaptureScreen | null | undefined;

export function loadViewShotCapture(): CaptureScreen | null {
  if (loaded !== undefined) return loaded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-view-shot') as { captureScreen?: CaptureScreen };
    loaded = typeof mod.captureScreen === 'function' ? mod.captureScreen : null;
  } catch {
    loaded = null;
  }
  return loaded;
}

export function resetViewShotForTests(): void {
  loaded = undefined;
}
