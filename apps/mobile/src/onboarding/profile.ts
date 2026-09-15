import type { Trade } from '../api/onboarding';

export type OnboardingContinueAction = 'skip_catalog' | 'load_catalog' | 'import_quotes';

export function dollarsToCents(text: string): number | null {
  const stripped = text.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(stripped)) {
    return null;
  }
  const [whole, frac = ''] = stripped.split('.');
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isInteger(cents) || cents <= 0) {
    return null;
  }
  return cents;
}

/** Empty/omitted markup is null (optional). Non-empty must be an integer 0–100. */
export function parseMarkupPercentInput(
  text: string,
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = text.trim().replace(/%$/, '');
  if (trimmed === '') {
    return { ok: true, value: null };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false };
  }
  const value = Number(trimmed);
  if (value < 0 || value > 100) {
    return { ok: false };
  }
  return { ok: true, value };
}

export function canFinishOnboarding(args: {
  trade: Trade | null;
  hourlyRateCents: number | null;
  markupOk: boolean;
}): boolean {
  return (
    args.trade !== null &&
    args.hourlyRateCents !== null &&
    args.hourlyRateCents > 0 &&
    args.markupOk
  );
}

export function onboardingAfterProfile(
  action: OnboardingContinueAction,
  trade: Trade,
):
  | { kind: 'ready'; trade: Trade; itemCount: 0 }
  | { kind: 'seed'; trade: Trade }
  | { kind: 'import'; trade: Trade; itemCount: 0 } {
  if (action === 'skip_catalog') {
    return { kind: 'ready', trade, itemCount: 0 };
  }
  if (action === 'import_quotes') {
    return { kind: 'import', trade, itemCount: 0 };
  }
  return { kind: 'seed', trade };
}
