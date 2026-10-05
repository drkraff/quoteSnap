import {
  clearDirtyField,
  discardDirtyField,
  isDirtyField,
  markDirtyField,
} from '../sync/local-dirty';

/**
 * Mark the quote dirty, write the local lines, then enqueue.
 * The flag stays set if either step throws, so a pull cannot replace the
 * lines until a later attempt enqueues them or the caller discards the edit.
 * clearDurable drops only this write's token, so a newer edit is kept.
 */
export async function commitDraftLineEdit(input: {
  quoteId: string;
  writeLocal: (token: number) => Promise<void>;
  enqueueEdit: () => Promise<void>;
  clearDurable?: (token: number) => Promise<void>;
}): Promise<void> {
  const token = markDirtyField(input.quoteId, 'lines');
  await input.writeLocal(token);
  if (!isDirtyField(input.quoteId, 'lines')) {
    // Discarded while the local write was in flight.
    return;
  }
  await input.enqueueEdit();
  if (input.clearDurable) {
    await input.clearDurable(token);
    return;
  }
  clearDirtyField(input.quoteId, 'lines', token);
}

export function discardPendingLineEdit(quoteId: string): void {
  discardDirtyField(quoteId, 'lines');
}
