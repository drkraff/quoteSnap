/**
 * Draft/quote line edits that are written locally before the sync queue has
 * them. Hydrate must not replace those lines or the total until the edit is
 * enqueued (flag cleared) or explicitly discarded. Process death drops the
 * flag; the queue row is what protects an edit after that.
 */

const pendingLineEdits = new Set<string>();

export function markPendingLineEdit(quoteId: string): void {
  const id = quoteId.trim();
  if (id === '') return;
  pendingLineEdits.add(id);
}

export function clearPendingLineEdit(quoteId: string): void {
  pendingLineEdits.delete(quoteId.trim());
}

export function hasPendingLineEdit(quoteId: string): boolean {
  return pendingLineEdits.has(quoteId);
}

export function resetPendingLineEditsForTests(): void {
  pendingLineEdits.clear();
}
