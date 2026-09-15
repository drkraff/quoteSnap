import {
  ADD_ROOM_LABEL,
  ADD_ROOM_PLACEHOLDER,
  ROOM_DELETE_CONFIRM_ACTION,
  ROOM_DELETE_CONFIRM_MESSAGE,
  ROOM_DELETE_CONFIRM_TITLE,
  ROOM_DELETE_LABEL,
  ROOM_RENAME_LABEL,
  UNGROUPED_ROOM_LABEL,
  addRoom,
  assignLineRoom,
  draftListRows,
  normalizeRoomName,
  parseRoomId,
  parseRoomsJson,
  removeRoom,
  renameRoom,
  rowIndexForLineIndex,
  sanitizeLineRooms,
  serializeRooms,
  updateRoomPrivateNote,
} from './rooms';
import { recalculateTotal, type LineItem } from '../utils/line-items';

const KITCHEN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BATH = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('parseRoomsJson / serializeRooms', () => {
  it('returns [] for empty or junk (single-memo)', () => {
    expect(parseRoomsJson(null)).toEqual([]);
    expect(parseRoomsJson('')).toEqual([]);
    expect(parseRoomsJson('not-json')).toEqual([]);
    expect(parseRoomsJson('{}')).toEqual([]);
  });

  it('round-trips id, name, and optional contractor-only note', () => {
    const rooms = [
      { id: KITCHEN, name: 'Kitchen', privateNote: "don't touch neighbor pipe" },
      { id: BATH, name: 'Bath' },
    ];
    const parsed = parseRoomsJson(serializeRooms(rooms));
    expect(parsed).toEqual([
      { id: KITCHEN, name: 'Kitchen', privateNote: "don't touch neighbor pipe" },
      { id: BATH, name: 'Bath' },
    ]);
  });

  it('drops non-UUID ids and empty names', () => {
    expect(
      parseRoomsJson(
        JSON.stringify([{ id: 'kitchen', name: 'Kitchen' }, { id: KITCHEN, name: '  ' }]),
      ),
    ).toEqual([]);
  });
});

describe('addRoom / assignLineRoom', () => {
  it('adds a named room and leaves blank names as the single-memo list', () => {
    expect(addRoom([], '  ', KITCHEN)).toEqual([]);
    expect(addRoom([], '  Kitchen  ', KITCHEN)).toEqual([{ id: KITCHEN, name: 'Kitchen' }]);
  });

  it('assigns and clears a line roomId without changing price', () => {
    const items: LineItem[] = [
      { catalogItemId: '', name: 'Cabinets', quantity: 14, unitPriceCents: null },
    ];
    const assigned = assignLineRoom(items, 0, KITCHEN);
    expect(assigned[0]!.roomId).toBe(KITCHEN);
    expect(assigned[0]!.unitPriceCents).toBeNull();
    expect(assignLineRoom(assigned, 0, null)[0]!.roomId).toBeUndefined();
  });

  it('treats empty lists and out-of-range selection as a no-op', () => {
    const items: LineItem[] = [
      { catalogItemId: '', name: 'Labor', quantity: 2, unitPriceCents: 7500 },
    ];
    expect(assignLineRoom([], 0, KITCHEN)).toEqual([]);
    expect(assignLineRoom(items, 99, KITCHEN)).toBe(items);
    expect(assignLineRoom(items, -1, KITCHEN)).toBe(items);
    expect(assignLineRoom(items, 0, null)).toBe(items);
  });
});

describe('draftListRows', () => {
  const cabinets: LineItem = {
    catalogItemId: '',
    name: 'Cabinets',
    quantity: 14,
    unitPriceCents: null,
    roomId: KITCHEN,
  };
  const labor: LineItem = {
    catalogItemId: '',
    name: 'Labor',
    quantity: 2,
    unitPriceCents: 7500,
  };
  const rooms = [
    { id: KITCHEN, name: 'Kitchen' },
    { id: BATH, name: 'Bath' },
  ];

  it('is a flat line list when there are no rooms (single-memo)', () => {
    const rows = draftListRows([], [labor, cabinets]);
    expect(rows).toEqual([
      { kind: 'line', index: 0, item: labor },
      { kind: 'line', index: 1, item: cabinets },
    ]);
  });

  it('groups lines under rooms and keeps empty rooms plus ungrouped Job', () => {
    const rows = draftListRows(rooms, [labor, cabinets]);
    expect(rows.map((row) => row.kind)).toEqual([
      'room',
      'line',
      'room',
      'ungrouped',
      'line',
    ]);
    expect(rows[0]).toMatchObject({ kind: 'room', room: { name: 'Kitchen' } });
    expect(rows[1]).toMatchObject({ kind: 'line', index: 1, item: cabinets });
    expect(rows[2]).toMatchObject({ kind: 'room', room: { name: 'Bath' } });
    expect(rows[3]).toEqual({ kind: 'ungrouped' });
    expect(rows[4]).toMatchObject({ kind: 'line', index: 0, item: labor });
    expect(rowIndexForLineIndex(rows, 1)).toBe(1);
    expect(rowIndexForLineIndex(rows, 0)).toBe(4);
  });
});

describe('empty room list / single-memo', () => {
  it('stays a valid ungrouped memo and clears stale roomIds without inventing a price', () => {
    const items: LineItem[] = [
      { catalogItemId: '', name: 'Labor', quantity: 2, unitPriceCents: 7500 },
      {
        catalogItemId: '',
        name: 'Cabinets',
        quantity: 14,
        unitPriceCents: null,
        roomId: KITCHEN,
      },
    ];
    const rows = draftListRows([], items);
    expect(rows).toEqual([
      { kind: 'line', index: 0, item: items[0] },
      { kind: 'line', index: 1, item: items[1] },
    ]);
    expect(sanitizeLineRooms([], null)).toEqual([]);
    expect(sanitizeLineRooms([], [])).toEqual([]);
    const sanitized = sanitizeLineRooms([], items);
    expect(sanitized[0]!.roomId).toBeUndefined();
    expect(sanitized[1]!.roomId).toBeUndefined();
    expect(sanitized[1]!.unitPriceCents).toBeNull();
    expect(recalculateTotal(sanitized)).toBe(15000);
    expect(recalculateTotal(sanitized)).toBe(recalculateTotal(items));
  });
});

describe('removeRoom', () => {
  it('ungroups lines and leaves totals unchanged', () => {
    const rooms = [
      { id: KITCHEN, name: 'Kitchen' },
      { id: BATH, name: 'Bath' },
    ];
    const items: LineItem[] = [
      {
        catalogItemId: '',
        name: 'Cabinets',
        quantity: 14,
        unitPriceCents: null,
        roomId: KITCHEN,
      },
      {
        catalogItemId: '',
        name: 'Labor',
        quantity: 2,
        unitPriceCents: 7500,
        roomId: KITCHEN,
      },
      {
        catalogItemId: '',
        name: 'Vanity',
        quantity: 1,
        unitPriceCents: 80000,
        roomId: BATH,
      },
    ];
    const beforeTotal = recalculateTotal(items);
    const removed = removeRoom(rooms, items, KITCHEN);
    expect(removed.rooms).toEqual([{ id: BATH, name: 'Bath' }]);
    expect(removed.items[0]!.roomId).toBeUndefined();
    expect(removed.items[1]!.roomId).toBeUndefined();
    expect(removed.items[2]!.roomId).toBe(BATH);
    expect(removed.items[0]!.unitPriceCents).toBeNull();
    expect(recalculateTotal(removed.items)).toBe(beforeTotal);
    expect(recalculateTotal(removed.items)).toBe(95000);

    const rows = draftListRows(removed.rooms, removed.items);
    expect(rows.map((row) => row.kind)).toEqual(['room', 'line', 'ungrouped', 'line', 'line']);
  });

  it('deleting the last room returns a single-memo list without crashing', () => {
    const rooms = [{ id: KITCHEN, name: 'Kitchen' }];
    const items: LineItem[] = [
      {
        catalogItemId: '',
        name: 'Cabinets',
        quantity: 14,
        unitPriceCents: null,
        roomId: KITCHEN,
      },
    ];
    const removed = removeRoom(rooms, items, KITCHEN);
    expect(removed.rooms).toEqual([]);
    expect(removed.items[0]!.roomId).toBeUndefined();
    expect(draftListRows(removed.rooms, removed.items)).toEqual([
      { kind: 'line', index: 0, item: removed.items[0] },
    ]);
    expect(removeRoom([], items, KITCHEN).rooms).toEqual([]);
    expect(removeRoom([], items, KITCHEN).items[0]!.roomId).toBeUndefined();
    expect(removeRoom(rooms, [], BATH)).toEqual({ rooms, items: [] });
    expect(removeRoom(rooms, items, BATH)).toEqual({ rooms, items });
  });
});

describe('renameRoom', () => {
  it('renames in place and does not invent a spoken room on lines', () => {
    const rooms = addRoom([{ id: BATH, name: 'Bath' }], 'Kitchen', KITCHEN);
    const items: LineItem[] = [
      {
        catalogItemId: '',
        name: 'Cabinets',
        quantity: 14,
        unitPriceCents: null,
        roomId: KITCHEN,
      },
    ];
    const renamed = renameRoom(rooms, KITCHEN, '  Kitchen upstairs  ');
    expect(renamed[1]!.id).toBe(KITCHEN);
    expect(renamed[1]!.name).toBe('Kitchen upstairs');
    expect(renamed[0]!.name).toBe('Bath');
    expect(items[0]!.roomId).toBe(KITCHEN);
    expect((items[0] as { roomName?: string }).roomName).toBeUndefined();
    expect(items[0]!.unitPriceCents).toBeNull();
    expect(renameRoom(rooms, KITCHEN, '   ')).toBe(rooms);
    expect(renameRoom([], KITCHEN, 'Kitchen')).toEqual([]);
    expect(renameRoom(rooms, BATH, 'Bath')).toBe(rooms);
  });
});

describe('updateRoomPrivateNote / copy', () => {
  it('stores a contractor-only room note and English labels', () => {
    const rooms = addRoom([], 'Kitchen', KITCHEN);
    const noted = updateRoomPrivateNote(rooms, KITCHEN, '  third floor  ');
    expect(noted[0]!.privateNote).toBe('third floor');
    const cleared = updateRoomPrivateNote(noted, KITCHEN, '');
    expect(cleared[0]!.privateNote).toBeNull();
    expect(JSON.parse(serializeRooms(cleared))[0].privateNote).toBeNull();
    expect(updateRoomPrivateNote(cleared, KITCHEN, '   ')).toBe(cleared);
    expect(updateRoomPrivateNote(noted, BATH, 'nope')).toBe(noted);
    expect(ADD_ROOM_LABEL).toBe('Add room');
    expect(ADD_ROOM_PLACEHOLDER.toLowerCase()).toContain('room');
    expect(UNGROUPED_ROOM_LABEL).toBe('Job');
    expect(ROOM_DELETE_LABEL).toBe('Remove');
    expect(ROOM_DELETE_CONFIRM_TITLE).toBe('Remove this room?');
    expect(ROOM_DELETE_CONFIRM_MESSAGE.toLowerCase()).toContain('ungrouped');
    expect(ROOM_DELETE_CONFIRM_MESSAGE.toLowerCase()).toContain('total');
    expect(ROOM_DELETE_CONFIRM_ACTION).toBe('Remove');
    expect(ROOM_RENAME_LABEL).toBe('Rename');
    expect(normalizeRoomName('Bath')).toBe('Bath');
    expect(parseRoomId(KITCHEN)).toBe(KITCHEN);
    expect(parseRoomId('Kitchen')).toBeUndefined();
  });
});
