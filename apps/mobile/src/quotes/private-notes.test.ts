import {
  LINE_PRIVATE_NOTE_ADD,
  PRIVATE_NOTE_INTERNAL_HINT,
  PRIVATE_NOTE_LABEL,
  PRIVATE_NOTE_MAX_LENGTH,
  PRIVATE_NOTE_PLACEHOLDER,
  assignNormalizedPrivateNote,
  hasPrivateNote,
  normalizePrivateNote,
  privateNoteFieldValue,
} from './private-notes';

describe('normalizePrivateNote', () => {
  it('trims and clears whitespace', () => {
    expect(normalizePrivateNote('  moisture from neighbor  ')).toBe(
      'moisture from neighbor',
    );
    expect(normalizePrivateNote('')).toBeNull();
    expect(normalizePrivateNote('   ')).toBeNull();
    expect(normalizePrivateNote(null)).toBeNull();
    expect(normalizePrivateNote(undefined)).toBeNull();
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
    expect(PRIVATE_NOTE_PLACEHOLDER.toLowerCase()).toContain('visible only');
    expect(PRIVATE_NOTE_PLACEHOLDER.toLowerCase()).not.toContain('subcontractor');
    expect(PRIVATE_NOTE_PLACEHOLDER.toLowerCase()).not.toContain('moisture');
  });

  it('keeps empty fields blank — placeholder is hint-only, never persisted', () => {
    expect(hasPrivateNote('')).toBe(false);
    expect(hasPrivateNote('   ')).toBe(false);
    expect(hasPrivateNote(null)).toBe(false);
    expect(privateNoteFieldValue('   ')).toBe('');
    expect(privateNoteFieldValue(null)).toBe('');
    expect(privateNoteFieldValue('  moisture  ')).toBe('moisture');
    expect(privateNoteFieldValue('')).not.toBe(PRIVATE_NOTE_PLACEHOLDER);
    expect(privateNoteFieldValue('')).not.toBe(LINE_PRIVATE_NOTE_ADD);
  });
});

describe('assignNormalizedPrivateNote', () => {
  it('persists explicit null on clear and omits when the key was never set', () => {
    const cleared: { privateNote?: string | null } = { privateNote: 'old' };
    assignNormalizedPrivateNote(cleared, '   ');
    expect(cleared.privateNote).toBeNull();
    assignNormalizedPrivateNote(cleared, null);
    expect(cleared.privateNote).toBeNull();

    const omitted: { privateNote?: string | null } = {};
    assignNormalizedPrivateNote(omitted, undefined);
    expect(omitted.privateNote).toBeUndefined();
  });
});
