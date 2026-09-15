import type { SkippedImportedLine, SkippedImportedLineReason } from './import-parse';
import { clipSkippedLineRaw, skippedLinesForDisplay } from './import-parse';

export const IMPORT_OLD_QUOTES_TITLE = 'Import old quotes';

export const IMPORT_OLD_QUOTES_BODY =
  'Paste priced lines (name, unit, and $ amount) so quote #1 can use your prices. Photos and PDFs are a reminder only — they are not read yet, and we will not guess prices from a picture. Skip anytime and quote with blanks.';

export const IMPORT_PLACEHOLDER =
  'Replace outlet    each    $85\nCopper pipe    per foot    $12.50';

export const IMPORT_CTA_LABEL = 'Import into rate card';
export const IMPORT_PICK_PHOTOS_LABEL = 'Choose photos or screenshots (up to 3)';
export const IMPORT_SKIP_ONBOARDING_LABEL = 'Skip and start quoting';
export const IMPORT_SKIP_SETTINGS_LABEL = 'Not now';

export const IMPORT_PHOTO_HINT =
  'Those photos are not read yet. Paste the priced lines — we will not guess prices from a picture.';

export const IMPORT_PASTE_HINT =
  'Paste priced lines from the old quote. Photos and PDFs are not read yet — we will not guess prices from a picture.';

export const IMPORT_EMPTY_HEADING = 'Nothing to import yet';

export const IMPORT_EMPTY_BODY =
  'Paste lines from an old quote, or skip and start quoting. We will not invent prices or catalog items.';

export const IMPORT_OCR_STUB_HEADING = 'Photos are not read yet';

export const IMPORT_NO_PRICES_HEADING = 'No prices found on those lines';

export const IMPORT_NO_PRICES_BODY =
  'Paste name, unit, and price (for example: Replace outlet    each    $85). Skipped lines stay skipped — we will not invent dollars. You can skip and quote with blanks.';

export const IMPORT_PARTIAL_SKIP_HEADING = 'Some lines were skipped';

export const SKIPPED_LINE_REASON_LABEL: Record<SkippedImportedLineReason, string> = {
  empty: 'blank',
  header: 'header or total',
  no_price: 'no price',
  no_name: 'no item name',
  ambiguous_total: 'looks like a total, not a unit price',
  invalid_price: 'not a unit price',
};

export function formatSkippedImportedLine(line: SkippedImportedLine): string {
  const raw = clipSkippedLineRaw(line.raw);
  const label = SKIPPED_LINE_REASON_LABEL[line.reason];
  return raw === '' ? label : `${raw} (${label})`;
}

export function skippedImportedLineLabels(skipped: SkippedImportedLine[]): string[] {
  return skippedLinesForDisplay(skipped).map(formatSkippedImportedLine);
}
