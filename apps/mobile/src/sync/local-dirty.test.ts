import {
  assignPulledQuoteTextFields,
  clearDirtyField,
  durableClearsForSuccessfulPush,
  durableDirtyResumePlan,
  fieldHeld,
  localDirtyWith,
  localDirtyWithout,
  markDirtyField,
  quoteDetailPreserve,
  resetLocalDirtyForTests,
  unsyncedLinesProtected,
} from './local-dirty';
import { serializeRooms } from '../quotes/rooms';

const KITCHEN = [{ id: '11111111-1111-4111-8111-111111111111', name: 'Kitchen', privateNote: null }];

describe('local dirty tokens', () => {
  beforeEach(() => {
    resetLocalDirtyForTests();
  });

  it('keeps a newer token when an older enqueue clears', () => {
    const first = markDirtyField('q1', 'phone');
    const second = markDirtyField('q1', 'phone');
    expect(clearDirtyField('q1', 'phone', first)).toBe(false);
    expect(fieldHeld('q1', null, 'phone')).toBe(true);
    expect(clearDirtyField('q1', 'phone', second)).toBe(true);
    expect(fieldHeld('q1', null, 'phone')).toBe(false);
  });

  it('stores each field token and clears only the matching one', () => {
    const phone = localDirtyWith(null, 'phone', 2);
    const both = localDirtyWith(phone, 'privateNote', 3);
    expect(localDirtyWithout(both, 'phone', 1)).toBe(both);
    expect(JSON.parse(localDirtyWithout(both, 'phone', 2) ?? '{}')).toEqual({ privateNote: 3 });
    expect(localDirtyWithout(both, 'privateNote', 3)).toBe(JSON.stringify({ phone: 2 }));
  });

  it.each(['phone', 'privateNote', 'clientSentence', 'rooms', 'lines'] as const)(
    'holds %s from the column after the in-memory flag is gone',
    (field) => {
      const raw = localDirtyWith(null, field, 4);
      resetLocalDirtyForTests();
      expect(fieldHeld('q1', raw, field)).toBe(true);
      expect(fieldHeld('q1', localDirtyWithout(raw, field, 4), field)).toBe(false);
    },
  );
});

describe('quote detail preserve', () => {
  beforeEach(() => {
    resetLocalDirtyForTests();
  });

  it('preserves each dirty text field and unsynced lines', () => {
    markDirtyField('q1', 'phone');
    const preserve = quoteDetailPreserve({
      quoteId: 'q1',
      localDirty: localDirtyWith(localDirtyWith(null, 'privateNote', 1), 'rooms', 2),
      draftIds: ['d1'],
      queue: [{ entityType: 'draft', entityId: 'd1', status: 'pending' }],
    });
    expect(preserve.phone).toBe(true);
    expect(preserve.privateNote).toBe(true);
    expect(preserve.rooms).toBe(true);
    expect(preserve.clientSentence).toBe(false);
    expect(preserve.lines).toBe(true);
  });

  it('holds lines for a queued draft update after the memory flag is cleared', () => {
    expect(
      unsyncedLinesProtected({
        quoteId: 'q1',
        draftIds: ['d1'],
        queue: [{ entityType: 'draft', entityId: 'd1', status: 'pending' }],
      }),
    ).toBe(true);
    expect(
      unsyncedLinesProtected({
        quoteId: 'q1',
        draftIds: ['d1'],
        queue: [{ entityType: 'draft', entityId: 'd1', status: 'dead_letter' }],
      }),
    ).toBe(true);
    expect(
      unsyncedLinesProtected({
        quoteId: 'q1',
        draftIds: ['d1'],
        queue: [{ entityType: 'quote', entityId: 'q1', status: 'dead_letter' }],
      }),
    ).toBe(false);
  });
});

describe('assignPulledQuoteTextFields', () => {
  beforeEach(() => {
    resetLocalDirtyForTests();
  });

  it('leaves each dirty field alone and still applies the clean ones', () => {
    const record = {
      id: 'q1',
      localDirty: JSON.stringify({ phone: 1, privateNote: 2, clientSentence: 3, rooms: 4 }),
      customerPhone: '555',
      privateNote: 'keep note',
      clientSentence: 'keep sentence',
      roomsJson: serializeRooms(KITCHEN),
    };
    assignPulledQuoteTextFields(record, {
      customerPhone: '+1999',
      privateNote: 'server note',
      clientSentence: 'server sentence',
      rooms: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Bath', privateNote: null }],
    });
    expect(record.customerPhone).toBe('555');
    expect(record.privateNote).toBe('keep note');
    expect(record.clientSentence).toBe('keep sentence');
    expect(record.roomsJson).toBe(serializeRooms(KITCHEN));
  });
});

describe('durable resume and push clear', () => {
  beforeEach(() => {
    resetLocalDirtyForTests();
  });

  it('plans an enqueue for each durable field and skips a live edit or a frozen quote', () => {
    const localDirty = JSON.stringify({
      phone: 1,
      privateNote: 2,
      clientSentence: 3,
      rooms: 4,
      lines: 5,
    });
    const plan = durableDirtyResumePlan({
      quoteId: 'q1',
      localDirty,
      customerPhone: '555',
      privateNote: 'note',
      clientSentence: 'scope',
      roomsJson: serializeRooms(KITCHEN),
      draftId: 'd1',
      lineItemsJson: '[{"name":"Valve"}]',
      totalCents: 3400,
      frozen: false,
    });
    expect(plan.map((action) => action.field)).toEqual([
      'phone',
      'privateNote',
      'clientSentence',
      'rooms',
      'lines',
    ]);
    markDirtyField('q1', 'lines');
    const live = durableDirtyResumePlan({
      quoteId: 'q1',
      localDirty,
      customerPhone: '555',
      privateNote: null,
      clientSentence: null,
      roomsJson: null,
      draftId: 'd1',
      lineItemsJson: '[]',
      totalCents: 0,
      frozen: false,
    });
    expect(live.some((action) => action.field === 'lines')).toBe(false);
    expect(
      durableDirtyResumePlan({
        quoteId: 'q1',
        localDirty,
        customerPhone: '555',
        privateNote: null,
        clientSentence: null,
        roomsJson: null,
        draftId: 'd1',
        lineItemsJson: '[]',
        totalCents: 0,
        frozen: true,
      }),
    ).toEqual([]);
  });

  it('clears a pushed field only when the stored value still matches', () => {
    const localDirty = JSON.stringify({ phone: 1, lines: 2, rooms: 3 });
    const roomsJson = serializeRooms(KITCHEN);
    expect(
      durableClearsForSuccessfulPush({
        localDirty,
        customerPhone: '555',
        privateNote: null,
        clientSentence: null,
        roomsJson,
        lineItemsJson: '[{"name":"Valve"}]',
        payload: {
          customerPhone: '555',
          rooms: KITCHEN,
          lineItemsJson: '[{"name":"Valve"}]',
        },
      }).map((clear) => clear.field),
    ).toEqual(['phone', 'rooms', 'lines']);
    expect(
      durableClearsForSuccessfulPush({
        localDirty,
        customerPhone: '5551',
        privateNote: null,
        clientSentence: null,
        roomsJson,
        lineItemsJson: '[{"name":"Pipe"}]',
        payload: {
          customerPhone: '555',
          lineItemsJson: '[{"name":"Valve"}]',
        },
      }),
    ).toEqual([]);
  });
});
