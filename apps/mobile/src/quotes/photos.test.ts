import {
  ADD_PHOTO_LABEL,
  PHOTO_EMPTY_LABEL,
  PHOTO_MISSING_LOCAL_LABEL,
  PHOTO_PENDING_LABEL,
  PHOTO_PRIVATE_HINT,
  PHOTO_REMOVE_CONFIRM_ACTION,
  PHOTO_REMOVE_CONFIRM_MESSAGE,
  PHOTO_REMOVE_CONFIRM_TITLE,
  PHOTO_REMOVE_LABEL,
  addPhoto,
  assignRoomPhotosToNearestLine,
  ensureLineClientId,
  localPhotoPath,
  mergePhotosOnHydrate,
  mergeStoredPhotosWithServer,
  parsePhotosJson,
  photoDisplayUri,
  photoStatusLabel,
  photosForLine,
  photosForQuote,
  photosForRoom,
  removePhoto,
  serializePhotos,
  shouldIncludeServerOnlyPhotos,
  shouldUploadQueuedPhoto,
  type QuotePhoto,
} from './photos';
import { recalculateTotal, type LineItem } from '../utils/line-items';

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

  it('does not resurrect a last-remove empty strip from server-only metadata', () => {
    const server = [
      {
        id: SERVER,
        clientId: PHOTO_A,
        mime: 'image/jpeg',
        roomId: null,
        lineClientId: null,
      },
    ];
    expect(shouldIncludeServerOnlyPhotos(null)).toBe(true);
    expect(shouldIncludeServerOnlyPhotos('')).toBe(true);
    expect(shouldIncludeServerOnlyPhotos('[]')).toBe(false);
    expect(mergePhotosOnHydrate([], server, { includeServerOnly: false })).toEqual([]);
    expect(mergeStoredPhotosWithServer('[]', server)).toEqual([]);
    expect(JSON.stringify(mergeStoredPhotosWithServer('[]', server))).not.toContain('unitPrice');
  });

  it('keeps remaining local stills after one remove without re-adding the dropped id', () => {
    const local = addPhoto([], { id: PHOTO_B, localUri: 'file:///b.jpg' });
    const merged = mergePhotosOnHydrate(
      local,
      [
        { id: SERVER, clientId: PHOTO_A, mime: 'image/jpeg' },
        {
          id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          clientId: PHOTO_B,
          mime: 'image/jpeg',
        },
      ],
      { includeServerOnly: false },
    );
    expect(merged.map((photo) => photo.id)).toEqual([PHOTO_B]);
    expect(merged[0]).toMatchObject({
      id: PHOTO_B,
      localUri: 'file:///b.jpg',
      status: 'uploaded',
      serverId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    });
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

function assertHonestPhotoCopy(text: string): void {
  expect(text).not.toMatch(/\$/);
  expect(text).not.toMatch(/\d+\.\d{2}/);
  expect(text.toLowerCase()).not.toContain('sku');
  expect(text.toLowerCase()).not.toContain('ocr');
  expect(text.toLowerCase()).not.toMatch(/caption/);
}

describe('empty strip / grouping', () => {
  it('keeps quote, room, and line strips honestly empty — no placeholder stills', () => {
    expect(photosForQuote([])).toEqual([]);
    expect(photosForRoom([], ROOM)).toEqual([]);
    expect(photosForLine([], LINE)).toEqual([]);
    expect(PHOTO_EMPTY_LABEL).toBe('No photos');
    assertHonestPhotoCopy(`${PHOTO_EMPTY_LABEL} ${PHOTO_PRIVATE_HINT}`);
  });
});

describe('removePhoto', () => {
  it('returns an empty strip when the last still is removed and does not invent a replacement', () => {
    const photos = addPhoto([], { id: PHOTO_A, localUri: 'file:///a.jpg' });
    expect(removePhoto(photos, PHOTO_A)).toEqual([]);
    expect(photosForQuote(removePhoto(photos, PHOTO_A))).toEqual([]);
    expect(JSON.stringify(removePhoto(photos, PHOTO_A))).not.toContain('unitPrice');
  });

  it('treats empty lists and missing ids as no-ops', () => {
    const photos = addPhoto([], { id: PHOTO_A, localUri: 'file:///a.jpg' });
    expect(removePhoto([], PHOTO_A)).toEqual([]);
    expect(removePhoto(photos, PHOTO_B)).toBe(photos);
    expect(removePhoto(photos, PHOTO_A)).not.toBe(photos);
  });

  it('drops the last room or line still without touching other scopes or prices', () => {
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
    const items: LineItem[] = [
      {
        catalogItemId: '',
        name: 'Cabinets',
        quantity: 14,
        unitPriceCents: null,
        clientId: LINE,
      },
    ];
    const withoutRoom = removePhoto(photos, PHOTO_B);
    expect(photosForRoom(withoutRoom, ROOM)).toEqual([]);
    expect(photosForQuote(withoutRoom).map((p) => p.id)).toEqual([PHOTO_A]);
    expect(photosForLine(withoutRoom, LINE)).toHaveLength(1);
    expect(items[0]!.unitPriceCents).toBeNull();
    expect(recalculateTotal(items)).toBe(0);

    const withoutLine = removePhoto(withoutRoom, 'ffffffff-ffff-4fff-8fff-ffffffffffff');
    expect(photosForLine(withoutLine, LINE)).toEqual([]);
    expect(photosForQuote(withoutLine).map((p) => p.id)).toEqual([PHOTO_A]);
    expect(items[0]!.unitPriceCents).toBeNull();

    const empty = removePhoto(withoutLine, PHOTO_A);
    expect(empty).toEqual([]);
    expect(photosForQuote(empty)).toEqual([]);
    expect(photosForRoom(empty, ROOM)).toEqual([]);
    expect(photosForLine(empty, LINE)).toEqual([]);
    expect(recalculateTotal(items)).toBe(0);
  });

  it('uses confirm copy that does not invent a price, caption, or SKU', () => {
    expect(PHOTO_REMOVE_LABEL).toBe('Remove');
    expect(PHOTO_REMOVE_CONFIRM_TITLE).toBe('Remove this photo?');
    expect(PHOTO_REMOVE_CONFIRM_ACTION).toBe('Remove');
    expect(PHOTO_REMOVE_CONFIRM_MESSAGE.toLowerCase()).toContain('price');
    assertHonestPhotoCopy(
      `${PHOTO_REMOVE_CONFIRM_TITLE} ${PHOTO_REMOVE_CONFIRM_MESSAGE} ${PHOTO_REMOVE_LABEL}`,
    );
  });
});

describe('shouldUploadQueuedPhoto / missing local URI', () => {
  it('skips a queued upload after the still was removed from the strip', () => {
    const photos = addPhoto([], { id: PHOTO_A, localUri: 'file:///a.jpg' });
    expect(shouldUploadQueuedPhoto(photos, PHOTO_A)).toBe(true);
    expect(shouldUploadQueuedPhoto(removePhoto(photos, PHOTO_A), PHOTO_A)).toBe(false);
    expect(shouldUploadQueuedPhoto([], PHOTO_A)).toBe(false);
  });

  it('labels a stale local URI as On server and does not invent a download path', () => {
    const onServer: QuotePhoto = {
      id: PHOTO_A,
      localUri: '   ',
      mime: 'image/jpeg',
      status: 'uploaded',
      serverId: SERVER,
    };
    expect(photoDisplayUri(onServer)).toBeNull();
    expect(photoStatusLabel(onServer)).toBe(PHOTO_MISSING_LOCAL_LABEL);
    expect(JSON.stringify(onServer)).not.toMatch(/https?:\/\//);
    expect(JSON.stringify(onServer)).not.toContain('unitPrice');
  });
});
