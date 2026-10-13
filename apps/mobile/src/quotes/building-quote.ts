export const BUILDING_QUOTE_TITLE = 'Building your quote...';

export const BUILDING_QUOTE_BODY =
  'Your recording is saved on this phone. Lines will show up here.';

/** Empty voice take still processing. Lines, once written, replace the skeleton. */
export function showBuildingQuote(input: { status: string; lineCount: number }): boolean {
  return input.status === 'ai_processing' && input.lineCount === 0;
}
