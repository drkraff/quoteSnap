import {
  ADD_PHOTO_LABEL,
  PHOTO_PENDING_LABEL,
  PHOTO_PRIVATE_HINT,
  addPhoto,
  assignRoomPhotosToNearestLine,
  ensureLineClientId,
  localPhotoPath,
  mergePhotosOnHydrate,
  parsePhotosJson,
  photoDisplayUri,
  photoStatusLabel,
  photosForLine,
  photosForQuote,
  photosForRoom,
  serializePhotos,
  type QuotePhoto,
} from './photos';
import type { LineItem } from '../utils/line-items';

const PHOTO_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PHOTO_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROOM = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LINE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SERVER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

describe('parsePhotosJson / serializePhotos', () => {
  it('returns [] for empty or junk', () => {
    expect(parsePhotosJson(null)).toEqual([]);
    expect(parsePhotosJson('')).toEqual([]);
    expect(parsePhotosJson('not-json')).toEqual([]);
    expect(parsePhotosJson('{}')).toEqual([]);
  });

  it('round-trips local URI, pending state, and attach targets without inventing prices', () => {
    const photos: QuotePhoto[] = [
      {
        id: PHOTO_A,
        localUri: 'file:///docs/photos/q1/a.jpg',
        mime: 'image/jpeg',
        status: 'pending',
        roomId: ROOM,
      },
      {
        id: PHOTO_B,
        localUri: 'file:///docs/photos/q1/b.jpg',
        mime: 'image/png',
        status: 'uploaded',
        serverId: SERVER,
        lineClientId: LINE,
      },
    ];
    const parsed = parsePhotosJson(serializePhotos(photos));
    expect(parsed).toEqual(photos);
    expect(JSON.stringify(parsed)).not.toContain('unitPrice');
  });

  it('drops non-UUID ids', () => {
    expect(
      parsePhotosJson(JSON.stringify([{ id: 'shot-1', localUri: 'file:///x.jpg', mime: 'image/jpeg' }])),
    ).toEqual([]);
  });
});

describe('addPhoto / grouping', () => {
  it('adds a job-level still as pending', () => {
    const next = addPhoto([], { id: PHOTO_A, localUri: 'file:///a.jpg', mime: 'image/jpeg' });
    expect(next).toEqual([
      {
        id: PHOTO_A,
        localUri: 'file:///a.jpg',
        mime: 'image/jpeg',
        status: 'pending',
      },
    ]);
    expect(photosForQuote(next)).toHaveLength(1);
    expect(photosForRoom(next, ROOM)).toHaveLength(0);
  });

  it('groups room vs line vs job photos', () => {
    const photos = addPhoto(
      addPhoto(
        addPhoto([], { id: PHOTO_A, localUri: 'file:///job.jpg' }),
        { id: PHOTO_B, localUri: 'file:///room.jpg', roomId: ROOM },
      ),
      {
        id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        localUri: 'file:///line.jpg',
        lineClientId: LINE,
      },
    );
    expect(photosForQuote(photos).map((p) => p.id)).toEqual([PHOTO_A]);
    expect(photosForRoom(photos, ROOM).map((p) => p.id)).toEqual([PHOTO_B]);
    expect(photosForLine(photos, LINE)).toHaveLength(1);
  });
});

describe('assignRoomPhotosToNearestLine', () => {
  it('attaches a room still to the first line in that room and stamps a clientId', () => {
    const items: LineItem[] = [
      { catalogItemId: '', name: 'Labor', quantity: 2, unitPriceCents: 7500 },
      {
        catalogItemId: '',
        name: 'Cabinets',
        quantity: 14,
        unitPriceCents: null,
        roomId: ROOM,
      },
    ];
    const photos = addPhoto([], {
      id: PHOTO_A,
      localUri: 'file:///kitchen.jpg',
      roomId: ROOM,
    });
    const result = assignRoomPhotosToNearestLine(photos, items);
    expect(result.items[1]!.clientId).toBeTruthy();
    expect(result.items[1]!.unitPriceCents).toBeNull();
    expect(result.photos[0]!.lineClientId).toBe(result.items[1]!.clientId);
    expect(result.items[0]!.clientId).toBeUndefined();
  });

  it('leaves ungrouped room photos alone when no line matches', () => {
    const items: LineItem[] = [
      { catalogItemId: '', name: 'Labor', quantity: 1, unitPriceCents: 0 },
    ];
    const photos = addPhoto([], { id: PHOTO_A, localUri: 'file:///x.jpg', roomId: ROOM });
    const result = assignRoomPhotosToNearestLine(photos, items);
    expect(result.photos[0]!.lineClientId).toBeUndefined();
    expect(result.items[0]!.unitPriceCents).toBe(0);
  });
});

describe('ensureLineClientId / mergePhotosOnHydrate', () => {
  it('does not overwrite an existing line clientId', () => {
    const items: LineItem[] = [
      { catalogItemId: '', name: 'X', quantity: 1, unitPriceCents: 1, clientId: LINE },
    ];
    expect(ensureLineClientId(items, 0, PHOTO_A)[0]!.clientId).toBe(LINE);
  });

  it('keeps local pending stills and stamps uploaded when the server knows the client id', () => {
    const local = addPhoto([], { id: PHOTO_A, localUri: 'file:///a.jpg' });
    const pending = addPhoto(local, { id: PHOTO_B, localUri: 'file:///b.jpg' });
    const merged = mergePhotosOnHydrate(pending, [
      {
        id: SERVER,
        clientId: PHOTO_A,
        mime: 'image/jpeg',
        roomId: null,
        lineClientId: null,
      },
    ]);
    expect(merged[0]).toMatchObject({
      id: PHOTO_A,
      localUri: 'file:///a.jpg',
      status: 'uploaded',
      serverId: SERVER,
    });
    expect(merged[1]).toMatchObject({
      id: PHOTO_B,
      localUri: 'file:///b.jpg',
      status: 'pending',
    });
  });

  it('adds server-only metadata without a local URI (new device)', () => {
    const merged = mergePhotosOnHydrate([], [
      {
        id: SERVER,
        clientId: PHOTO_A,
        mime: 'image/jpeg',
        lineClientId: LINE,
      },
    ]);
    expect(photoDisplayUri(merged[0]!)).toBeNull();
    expect(photoStatusLabel(merged[0]!)).toBe('On server');
    expect(merged[0]!.serverId).toBe(SERVER);
  });
});

describe('local path / labels', () => {
  it('copies into documentDirectory photos/{quoteId}/{id}.jpg like voice audio', () => {
    expect(localPhotoPath('q1', PHOTO_A, 'image/jpeg', 'file:///docs/')).toBe(
      `file:///docs/photos/q1/${PHOTO_A}.jpg`,
    );
    expect(ADD_PHOTO_LABEL).toBe('Add photo');
    expect(PHOTO_PRIVATE_HINT).toContain('not on the customer PDF');
    expect(photoStatusLabel({
      id: PHOTO_A,
      localUri: 'file:///a.jpg',
      mime: 'image/jpeg',
      status: 'pending',
    })).toBe(PHOTO_PENDING_LABEL);
  });
});
