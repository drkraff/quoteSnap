/**
 * Thin option groups (design §8): one base + one alternate per undecided
 * item. Role `base` is selected for the quote total; `alt` stays visible
 * and is excluded from the total. Swap roles to pick the other option.
 * No option_groups table — linkage lives on the line (draft JSON + PUT).
 */

export const OPTION_ROLES = ['base', 'alt'] as const;

export type OptionRole = (typeof OPTION_ROLES)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOptionRole(value: unknown): value is OptionRole {
  return typeof value === 'string' && (OPTION_ROLES as readonly string[]).includes(value);
}

export function parseOptionRole(value: unknown): OptionRole | undefined {
  return isOptionRole(value) ? value : undefined;
}

export function parseOptionGroupId(value: unknown): string | undefined {
  return typeof value === 'string' && UUID_RE.test(value) ? value : undefined;
}

export function lineContributesToTotal(item: {
  optionRole?: string | null;
}): boolean {
  return item.optionRole !== 'alt';
}

export function newOptionGroupId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const ADD_ALTERNATE_LABEL = 'Add alternate';
export const OPTION_IN_TOTAL_LABEL = 'In total';
export const OPTION_ALTERNATE_LABEL = 'Alternate';
export const OPTION_USE_FOR_TOTAL_LABEL = 'Use for total';
