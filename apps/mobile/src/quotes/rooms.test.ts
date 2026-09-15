import {
  ADD_ROOM_LABEL,
  ADD_ROOM_PLACEHOLDER,
  UNGROUPED_ROOM_LABEL,
  addRoom,
  assignLineRoom,
  draftListRows,
  normalizeRoomName,
  parseRoomId,
  parseRoomsJson,
  rowIndexForLineIndex,
  serializeRooms,
  updateRoomPrivateNote,
} from './rooms';
import type { LineItem } from '../utils/line-items';

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

describe('updateRoomPrivateNote / copy', () => {
  it('stores a contractor-only room note and English labels', () => {
    const rooms = addRoom([], 'Kitchen', KITCHEN);
    const noted = updateRoomPrivateNote(rooms, KITCHEN, '  third floor  ');
    expect(noted[0]!.privateNote).toBe('third floor');
    expect(updateRoomPrivateNote(noted, KITCHEN, '')[0]!.privateNote).toBeUndefined();
    expect(ADD_ROOM_LABEL).toBe('Add room');
    expect(ADD_ROOM_PLACEHOLDER.toLowerCase()).toContain('room');
    expect(UNGROUPED_ROOM_LABEL).toBe('Job');
    expect(normalizeRoomName('Bath')).toBe('Bath');
    expect(parseRoomId(KITCHEN)).toBe(KITCHEN);
    expect(parseRoomId('Kitchen')).toBeUndefined();
  });
});
