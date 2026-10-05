import { flushDraftFieldSyncs, shouldFlushDraftFieldsOnAppState } from './draft-field-flush';

describe('draft field flush', () => {
  it('flushes when the app backgrounds or becomes inactive', () => {
    expect(shouldFlushDraftFieldsOnAppState('background')).toBe(true);
    expect(shouldFlushDraftFieldsOnAppState('inactive')).toBe(true);
    expect(shouldFlushDraftFieldsOnAppState('active')).toBe(false);
  });

  it('flushes phone, note, sentence, and rooms together', async () => {
    const order: string[] = [];
    await flushDraftFieldSyncs([
      { flush: async () => { order.push('phone'); } },
      { flush: async () => { order.push('note'); } },
      { flush: async () => { order.push('sentence'); } },
      { flush: async () => { order.push('rooms'); } },
    ]);
    expect(order.sort()).toEqual(['note', 'phone', 'rooms', 'sentence']);
  });
});
