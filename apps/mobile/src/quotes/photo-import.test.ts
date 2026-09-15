import { recalculateTotal, type LineItem } from '../utils/line-items';
import {
  IMPORT_FROM_PHOTO_LABEL,
  IMPORTED_ITEM_FALLBACK_NAME,
  NAME_HINT_MAX_LENGTH,
  PHOTO_IMPORT_BLANK_PRICE_HINT,
  captionFromStill,
  filenameStemFromPicker,
  importLineFromPhoto,
  importedPhotoLine,
  nameHintFromPhoto,
} from './photo-import';
import { addPhoto, photosForLine, type QuotePhoto } from './photos';

const PHOTO_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LINE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ROOM = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('captionFromStill (Vision stub)', () => {
  it('returns null when OCR is not wired — does not invent a caption or price', () => {
    expect(
      captionFromStill({ localUri: 'file:///docs/photos/q1/a.jpg', mime: 'image/jpeg' }),
    ).toBeNull();
  });

  it('passes through a later Vision caption as a name hint only', () => {
    expect(
      captionFromStill({
        localUri: 'file:///a.jpg',
        mime: 'image/jpeg',
        ocrText: 'Kohler faucet $125.00',
      }),
    ).toBe('Kohler faucet $125.00');
  });
});

describe('filenameStemFromPicker / nameHintFromPhoto', () => {
  it('uses the filename stem, including from a file:// URI', () => {
    expect(filenameStemFromPicker('Kohler-faucet.jpg')).toBe('Kohler-faucet');
    expect(filenameStemFromPicker('file:///cache/ImagePicker/IMG_1234.JPG?w=1')).toBe(
      'IMG_1234',
    );
  });

  it('ignores UUID dest copies so we do not name the line after the photo id', () => {
    expect(filenameStemFromPicker(`${PHOTO_A}.jpg`)).toBeNull();
    expect(nameHintFromPhoto({ filename: `${PHOTO_A}.jpg` })).toBe(
      IMPORTED_ITEM_FALLBACK_NAME,
    );
  });

  it('falls back to Imported item when there is no filename or caption', () => {
    expect(nameHintFromPhoto({})).toBe(IMPORTED_ITEM_FALLBACK_NAME);
    expect(nameHintFromPhoto({ filename: '  ', caption: '\n' })).toBe(
      IMPORTED_ITEM_FALLBACK_NAME,
    );
  });

  it('prefers caption/OCR text as the name hint over filename', () => {
    expect(
      nameHintFromPhoto({
        filename: 'IMG_1234.jpg',
        caption: 'Delta valve\n$89 each',
      }),
    ).toBe('Delta valve');
  });

  it('clamps a long OCR dump so the line name stays a hint', () => {
    const caption = `Faucet ${'x'.repeat(200)}`;
    expect(nameHintFromPhoto({ caption })).toHaveLength(NAME_HINT_MAX_LENGTH);
  });
});

describe('importedPhotoLine / importLineFromPhoto', () => {
  it('creates an adhoc line with blank price and filename name', () => {
    const line = importedPhotoLine({ filename: 'brass-nipple.png', clientId: LINE });
    expect(line).toMatchObject({
      catalogItemId: '',
      name: 'brass-nipple',
      quantity: 1,
      unitPriceCents: null,
      priceSource: 'unknown',
      clientId: LINE,
    });
    expect(line).not.toHaveProperty('unit');
  });

  it('never invents unitPriceCents from OCR or a money-looking filename', () => {
    const fromOcr = importedPhotoLine({
      caption: 'Kohler faucet $125.00 ea — total $1,250',
      filename: '12500-faucet.jpg',
    });
    expect(fromOcr.unitPriceCents).toBeNull();
    expect(fromOcr.priceSource).toBe('unknown');
    expect(fromOcr.name).toBe('Kohler faucet $125.00 ea — total $1,250');
    expect(JSON.stringify(fromOcr)).not.toMatch(/"unitPriceCents":\s*[1-9]/);

    const fromFile = importedPhotoLine({ filename: 'old-quote-$89.50.jpg' });
    expect(fromFile.unitPriceCents).toBeNull();
    expect(fromFile.name).toBe('old-quote-$89.50');
    expect(recalculateTotal([fromFile])).toBe(0);
  });

  it('attaches the still onto the new line via existing photo-on-line', () => {
    const existing: QuotePhoto[] = addPhoto([], {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      localUri: 'file:///job.jpg',
    });
    const items: LineItem[] = [
      { catalogItemId: '', name: 'Labor', quantity: 1, unitPriceCents: 7500 },
    ];
    const result = importLineFromPhoto({
      items,
      photos: existing,
      localUri: 'file:///docs/photos/q1/a.jpg',
      mime: 'image/jpeg',
      photoId: PHOTO_A,
      filename: 'rate-card.jpg',
      roomId: ROOM,
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[1]!.unitPriceCents).toBeNull();
    expect(result.items[1]!.priceSource).toBe('unknown');
    expect(result.items[1]!.name).toBe('rate-card');
    expect(result.items[1]!.roomId).toBe(ROOM);
    expect(result.items[1]!.clientId).toBeTruthy();
    expect(result.items[0]!.unitPriceCents).toBe(7500);
    expect(photosForLine(result.photos, result.line.clientId!)).toEqual([
      expect.objectContaining({
        id: PHOTO_A,
        localUri: 'file:///docs/photos/q1/a.jpg',
        lineClientId: result.line.clientId,
        roomId: ROOM,
        status: 'pending',
      }),
    ]);
    expect(recalculateTotal(result.items)).toBe(7500);
  });

  it('still leaves price blank when a later Vision caption contains dollars', () => {
    const result = importLineFromPhoto({
      items: [],
      photos: [],
      localUri: 'file:///a.jpg',
      mime: 'image/jpeg',
      photoId: PHOTO_A,
      caption: '2" copper $45',
    });
    expect(result.line.name).toBe('2" copper $45');
    expect(result.line.unitPriceCents).toBeNull();
    expect(result.line.priceSource).toBe('unknown');
  });

  it('exposes contractor-facing copy for the stub', () => {
    expect(IMPORT_FROM_PHOTO_LABEL).toBe('Import from photo');
    expect(IMPORTED_ITEM_FALLBACK_NAME).toBe('Imported item');
    expect(PHOTO_IMPORT_BLANK_PRICE_HINT).toMatch(/blank/i);
  });
});
