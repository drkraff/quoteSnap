/**
 * What has to finish before the first screen.
 *
 * SecureStore is on-device. Refresh and hydrate are network. The quotes list
 * reads WatermelonDB and does not wait for either. Sync queue processing is
 * the same class of work as hydrate: it starts after the first screen lays out.
 *
 * The millisecond table is a model with the delays below, not a phone trace.
 * A release build logs real `startup_trace` lines (see trace.ts). This file
 * is the before/after control flow those lines are meant to show.
 */
export const BOOT_MODEL_MS = {
  /** Local keystore read. Stand-in, not a measured Android SecureStore call. */
  secureStore: 80,
  /**
   * Stand-in for an expired access token hitting a sleeping API: container
   * wake, Postgres wake, then migrate-before-listen. Not a live Railway trace.
   */
  railwayRefresh: 8_000,
  /** Stand-in for GET /catalog + both quote lists on a cold API. */
  hydrate: 1_500,
} as const;

export type BootDelays = {
  secureStore: number;
  railwayRefresh: number;
  hydrate: number;
};

export type BootScenario = 'valid_access' | 'expired_access';

/**
 * A still-valid access token already flipped `isLoading` before hydrate.
 * An expired one used to await refresh before that flip. Hydrate stayed
 * after the flip in both cases. `after` paints on the cached session either way.
 */
export function modelledFirstPaintMs(
  mode: 'before' | 'after',
  scenario: BootScenario,
  delays: BootDelays = BOOT_MODEL_MS,
): number {
  if (mode === 'after' || scenario === 'valid_access') return delays.secureStore;
  return delays.secureStore + delays.railwayRefresh;
}

/** When refresh (if needed) and hydrate have both finished. */
export function modelledNetworkSettledMs(
  _mode: 'before' | 'after',
  scenario: BootScenario,
  delays: BootDelays = BOOT_MODEL_MS,
): number {
  if (scenario === 'valid_access') return delays.secureStore + delays.hydrate;
  return delays.secureStore + delays.railwayRefresh + delays.hydrate;
}
