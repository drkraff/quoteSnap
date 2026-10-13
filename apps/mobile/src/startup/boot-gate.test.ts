import {
  BOOT_MODEL_MS,
  modelledFirstPaintMs,
  modelledNetworkSettledMs,
} from './boot-gate';
import { noteStartup, resetStartupTraceForTests, startupTraceMarks } from './trace';

describe('modelledFirstPaintMs', () => {
  it('paints after the keystore read and does not add refresh or hydrate', () => {
    expect(modelledFirstPaintMs('after', 'expired_access')).toBe(BOOT_MODEL_MS.secureStore);
    expect(modelledFirstPaintMs('after', 'valid_access')).toBe(BOOT_MODEL_MS.secureStore);
    expect(modelledFirstPaintMs('before', 'valid_access')).toBe(BOOT_MODEL_MS.secureStore);
    expect(modelledFirstPaintMs('before', 'expired_access')).toBe(
      BOOT_MODEL_MS.secureStore + BOOT_MODEL_MS.railwayRefresh,
    );
  });

  it('still finishes refresh and hydrate, after the first paint', () => {
    expect(modelledNetworkSettledMs('after', 'expired_access')).toBe(
      modelledNetworkSettledMs('before', 'expired_access'),
    );
    expect(modelledNetworkSettledMs('after', 'expired_access')).toBeGreaterThan(
      modelledFirstPaintMs('after', 'expired_access'),
    );
    expect(modelledNetworkSettledMs('before', 'valid_access')).toBe(
      BOOT_MODEL_MS.secureStore + BOOT_MODEL_MS.hydrate,
    );
  });
});

describe('noteStartup', () => {
  beforeEach(() => {
    resetStartupTraceForTests();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as { __QUOTESNAP_JS_EVAL_START_MS__?: number }).__QUOTESNAP_JS_EVAL_START_MS__;
  });

  it('counts milliseconds from the eval stamp and logs no secrets', () => {
    (globalThis as { __QUOTESNAP_JS_EVAL_START_MS__?: number }).__QUOTESNAP_JS_EVAL_START_MS__ = 1_000;
    noteStartup('session_ready', { kind: 'local' }, 1_080);
    const line = JSON.stringify(startupTraceMarks());
    expect(startupTraceMarks()).toEqual([{ name: 'session_ready', ms: 80, kind: 'local' }]);
    expect(line).not.toMatch(/token|password|bearer|phone/i);
  });
});
