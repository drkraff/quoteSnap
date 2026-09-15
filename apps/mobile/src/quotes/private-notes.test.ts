import {
  LINE_PRIVATE_NOTE_ADD,
  PRIVATE_NOTE_INTERNAL_HINT,
  PRIVATE_NOTE_LABEL,
  PRIVATE_NOTE_MAX_LENGTH,
  normalizePrivateNote,
} from './private-notes';

describe('normalizePrivateNote', () => {
  it('trims and clears whitespace', () => {
    expect(normalizePrivateNote('  moisture from neighbor  ')).toBe(
      'moisture from neighbor',
    );
    expect(normalizePrivateNote('')).toBeNull();
    expect(normalizePrivateNote('   ')).toBeNull();
    expect(normalizePrivateNote(null)).toBeNull();
  });

  it('caps length so a transcript cannot dump into the column', () => {
    const tooLong = 'x'.repeat(PRIVATE_NOTE_MAX_LENGTH + 8);
    expect(normalizePrivateNote(tooLong)?.length).toBe(PRIVATE_NOTE_MAX_LENGTH);
  });
});

describe('private note copy', () => {
  it('labels notes as internal-only English, never customer-facing', () => {
    expect(PRIVATE_NOTE_LABEL).toBe('Private note');
    expect(PRIVATE_NOTE_INTERNAL_HINT.toLowerCase()).toContain('internal');
    expect(PRIVATE_NOTE_INTERNAL_HINT.toLowerCase()).toContain('pdf');
    expect(LINE_PRIVATE_NOTE_ADD).toBe('Add private note');
  });
});
