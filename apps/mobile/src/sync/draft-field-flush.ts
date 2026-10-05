export type DraftFieldSync = {
  flush: () => Promise<void>;
};

/** Background and inactive can suspend the debounce timer before it fires. */
export function shouldFlushDraftFieldsOnAppState(state: string): boolean {
  return state === 'background' || state === 'inactive';
}

export async function flushDraftFieldSyncs(syncs: DraftFieldSync[]): Promise<void> {
  await Promise.all(syncs.map((sync) => sync.flush()));
}
