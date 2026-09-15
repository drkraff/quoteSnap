import {
  capOldQuoteFiles,
  classifyOldQuoteDocument,
  extractTextFromOldQuoteDocument,
  IMAGE_OCR_STUB_REASON,
  mergePickedOldQuoteFiles,
  PDF_OCR_STUB_REASON,
  PHOTO_PERMISSION_DENIED,
  pickOldQuoteImages,
} from './import-files';
import { MAX_OLD_QUOTE_FILES } from './import-parse';

describe('classifyOldQuoteDocument / extract stub', () => {
  it('classifies files and does not OCR images or PDFs', () => {
    expect(classifyOldQuoteDocument({ mime: 'image/jpeg' })).toBe('image');
    expect(classifyOldQuoteDocument({ filename: 'old.pdf' })).toBe('pdf');
    expect(
      extractTextFromOldQuoteDocument({ filename: 'scan.jpg', mime: 'image/jpeg' }),
    ).toEqual({
      status: 'needs_paste',
      reason: IMAGE_OCR_STUB_REASON,
      filename: 'scan.jpg',
    });
    expect(
      extractTextFromOldQuoteDocument({ filename: 'old.pdf', mime: 'application/pdf' }),
    ).toEqual({
      status: 'needs_paste',
      reason: PDF_OCR_STUB_REASON,
      filename: 'old.pdf',
    });
    expect(
      extractTextFromOldQuoteDocument({
        filename: 'lines.txt',
        mime: 'text/plain',
        text: 'Replace outlet each $85',
      }).status,
    ).toBe('text');
  });
});

describe('cap / merge old quote files', () => {
  it('keeps at most three unique files', () => {
    expect(MAX_OLD_QUOTE_FILES).toBe(3);
    expect(capOldQuoteFiles(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
    const merged = mergePickedOldQuoteFiles(
      [{ uri: 'file://a', filename: 'a.jpg', mime: 'image/jpeg' }],
      [
        { uri: 'file://a', filename: 'a.jpg', mime: 'image/jpeg' },
        { uri: 'file://b', filename: 'b.jpg', mime: 'image/jpeg' },
        { uri: 'file://c', filename: 'c.jpg', mime: 'image/jpeg' },
        { uri: 'file://d', filename: 'd.jpg', mime: 'image/jpeg' },
      ],
    );
    expect(merged.map((file) => file.uri)).toEqual(['file://a', 'file://b', 'file://c']);
  });
});

describe('pickOldQuoteImages', () => {
  it('returns permission-denied without launching the library', async () => {
    const launch = jest.fn();
    const result = await pickOldQuoteImages({
      requestMediaLibraryPermissionsAsync: async () => ({ granted: false }),
      launchImageLibraryAsync: launch,
      MediaTypeOptions: { Images: 'images' },
    });
    expect(result).toEqual({ ok: false, reason: PHOTO_PERMISSION_DENIED });
    expect(launch).not.toHaveBeenCalled();
  });

  it('maps library assets and respects the remaining slot count', async () => {
    const result = await pickOldQuoteImages(
      {
        requestMediaLibraryPermissionsAsync: async () => ({ granted: true }),
        launchImageLibraryAsync: async (options) => {
          expect(options.selectionLimit).toBe(2);
          expect(options.allowsMultipleSelection).toBe(true);
          return {
            canceled: false,
            assets: [
              { uri: 'file://one', fileName: 'one.jpg', mimeType: 'image/jpeg' },
              { uri: 'file://two', fileName: 'two.png', mimeType: 'image/png' },
            ],
          };
        },
        MediaTypeOptions: { Images: 'images' },
      },
      1,
    );
    expect(result).toEqual({
      ok: true,
      files: [
        { uri: 'file://one', filename: 'one.jpg', mime: 'image/jpeg' },
        { uri: 'file://two', filename: 'two.png', mime: 'image/png' },
      ],
    });
  });
});
