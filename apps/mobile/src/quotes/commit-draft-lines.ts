import {
  clearPendingLineEdit,
  hasPendingLineEdit,
  markPendingLineEdit,
} from '../sync/pending-local-edit';

/**
 * Mark the quote dirty, write the local lines, then enqueue.
 * The flag stays set if either step throws, so a pull cannot replace the
 * lines until a later attempt enqueues them or the caller discards the edit.
 */
export async function commitDraftLineEdit(input: {
  quoteId: string;
  writeLocal: () => Promise<void>;
  enqueueEdit: () => Promise<void>;
}): Promise<void> {
  markPendingLineEdit(input.quoteId);
  await input.writeLocal();
  if (!hasPendingLineEdit(input.quoteId)) {
    // Discarded while the local write was in flight.
    return;
  }
  await input.enqueueEdit();
  clearPendingLineEdit(input.quoteId);
}

export function discardPendingLineEdit(quoteId: string): void {
  clearPendingLineEdit(quoteId);
}
