import { commitDraftLineEdit, discardPendingLineEdit } from './commit-draft-lines';
import {
  hasPendingLineEdit,
  resetPendingLineEditsForTests,
} from '../sync/pending-local-edit';

describe('commitDraftLineEdit', () => {
  beforeEach(() => {
    resetPendingLineEditsForTests();
  });

  it('holds the dirty flag across the local write and clears it after enqueue', async () => {
    const order: string[] = [];
    await commitDraftLineEdit({
      quoteId: 'local-quote-1',
      writeLocal: async () => {
        order.push('write');
        expect(hasPendingLineEdit('local-quote-1')).toBe(true);
      },
      enqueueEdit: async () => {
        order.push('enqueue');
        expect(hasPendingLineEdit('local-quote-1')).toBe(true);
      },
    });
    expect(order).toEqual(['write', 'enqueue']);
    expect(hasPendingLineEdit('local-quote-1')).toBe(false);
  });

  it('keeps the flag when enqueue throws so a pull cannot replace the lines', async () => {
    await expect(
      commitDraftLineEdit({
        quoteId: 'local-quote-1',
        writeLocal: async () => undefined,
        enqueueEdit: async () => {
          throw new Error('queue down');
        },
      }),
    ).rejects.toThrow('queue down');
    expect(hasPendingLineEdit('local-quote-1')).toBe(true);
  });

  it('does not enqueue a line edit that was discarded during the local write', async () => {
    let enqueued = false;
    await commitDraftLineEdit({
      quoteId: 'local-quote-1',
      writeLocal: async () => {
        discardPendingLineEdit('local-quote-1');
      },
      enqueueEdit: async () => {
        enqueued = true;
      },
    });
    expect(enqueued).toBe(false);
    expect(hasPendingLineEdit('local-quote-1')).toBe(false);
  });
});
