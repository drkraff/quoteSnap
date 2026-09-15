/**
 * Thin option groups (design §8): one base + one alternate per undecided
 * item. Role `base` is selected for the quote total; `alt` stays visible
 * and is excluded from the total. Swap roles to pick the other option.
 * No option_groups table — linkage lives on the line (draft JSON + PUT).
 *
 * Empty groups, missing partners, and out-of-range selection must not
 * throw. Totals use the selected line's stored cents only — never invent
 * a price for a blank alternate.
 */

export const OPTION_ROLES = ['base', 'alt'] as const;

export type OptionRole = (typeof OPTION_ROLES)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OptionLineFields = {
  optionGroupId?: string | null;
  optionRole?: string | null;
  quantity?: number | null;
  unitPriceCents?: number | null;
  name?: string | null;
};

export type OptionGroupMember<T extends OptionLineFields> = {
  index: number;
  item: T;
};

export type OptionGroupView<T extends OptionLineFields> = {
  groupId: string;
  members: OptionGroupMember<T>[];
  base: OptionGroupMember<T> | null;
  alt: OptionGroupMember<T> | null;
};

export type OptionLineChrome = {
  kind: 'none' | 'add' | 'pair';
  badge: string | null;
  badgeIsAlt: boolean;
  showSelect: boolean;
  selectLabel: string | null;
  addLabel: string | null;
  selectedHint: string | null;
  accessibilityLabel: string;
};

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
export const OPTION_SELECTED_HINT = 'This option is in the quote total';
export const OPTION_SWITCH_HINT = 'Use this option for the total. The other stays as an alternate.';

export function optionBadgeLabel(role: string | null | undefined): string | null {
  if (role === 'alt') return OPTION_ALTERNATE_LABEL;
  if (role === 'base') return OPTION_IN_TOTAL_LABEL;
  return null;
}

/** Stored cents × qty. Blank / unknown / junk → 0. Never invents a price. */
export function lineAmountCents(item: {
  quantity?: number | null;
  unitPriceCents?: number | null;
}): number {
  const qty = item.quantity;
  const cents = item.unitPriceCents;
  if (qty == null || !Number.isFinite(qty) || qty <= 0) {
    return 0;
  }
  if (cents == null || !Number.isFinite(cents) || cents <= 0) {
    return 0;
  }
  return qty * cents;
}

export function optionGroupMembers<T extends OptionLineFields>(
  items: readonly T[] | null | undefined,
  groupId: string | null | undefined,
): OptionGroupMember<T>[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }
  const id = parseOptionGroupId(groupId);
  if (!id) {
    return [];
  }
  const members: OptionGroupMember<T>[] = [];
  items.forEach((item, index) => {
    if (parseOptionGroupId(item.optionGroupId) === id) {
      members.push({ index, item });
    }
  });
  return members;
}

export function listOptionGroups<T extends OptionLineFields>(
  items: readonly T[] | null | undefined,
): OptionGroupView<T>[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }
  const order: string[] = [];
  const buckets = new Map<string, OptionGroupMember<T>[]>();
  items.forEach((item, index) => {
    const id = parseOptionGroupId(item.optionGroupId);
    if (!id) return;
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = [];
      buckets.set(id, bucket);
      order.push(id);
    }
    bucket.push({ index, item });
  });
  return order.map((groupId) => {
    const members = buckets.get(groupId) ?? [];
    return {
      groupId,
      members,
      base: members.find((member) => member.item.optionRole === 'base') ?? null,
      alt: members.find((member) => member.item.optionRole === 'alt') ?? null,
    };
  });
}

export function optionPartner<T extends OptionLineFields>(
  items: readonly T[] | null | undefined,
  index: number,
): OptionGroupMember<T> | null {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  const item = items[index];
  if (!item) {
    return null;
  }
  const members = optionGroupMembers(items, item.optionGroupId);
  if (members.length < 2) {
    return null;
  }
  return members.find((member) => member.index !== index) ?? null;
}

function clearOptionPair<T extends OptionLineFields>(item: T): T {
  if (item.optionGroupId == null && item.optionRole == null) {
    return item;
  }
  const next = { ...item };
  delete next.optionGroupId;
  delete next.optionRole;
  return next;
}

/**
 * Incomplete groups (0–1 members) become ungrouped so the draft can show
 * Add alternate instead of a partner-less pair. Groups with 2+ members
 * get exactly one `base` (first existing base, else the first member).
 * Prices are never rewritten.
 */
export function sanitizeOptionGroups<T extends OptionLineFields>(
  items: readonly T[] | null | undefined,
): T[] {
  if (!Array.isArray(items)) {
    return [];
  }
  if (items.length === 0) {
    return items as T[];
  }
  const complete = new Map<string, OptionGroupView<T>>();
  for (const group of listOptionGroups(items)) {
    if (group.members.length >= 2) {
      complete.set(group.groupId, group);
    }
  }
  let changed = false;
  const next = items.map((item, index) => {
    const id = parseOptionGroupId(item.optionGroupId);
    if (!id) {
      if (item.optionRole) {
        changed = true;
        return clearOptionPair(item);
      }
      return item;
    }
    const group = complete.get(id);
    if (!group) {
      changed = true;
      return clearOptionPair(item);
    }
    const selectedIndex = (group.base ?? group.members[0])?.index;
    const nextRole: OptionRole = index === selectedIndex ? 'base' : 'alt';
    if (item.optionRole === nextRole && item.optionGroupId === id) {
      return item;
    }
    changed = true;
    return { ...item, optionGroupId: id, optionRole: nextRole };
  });
  return changed ? next : (items as T[]);
}

/**
 * Pick this line as the selected (`base`) option. Empty lists, bad
 * indexes, unpaired lines, and empty groups are no-ops — no throw.
 * Does not invent or copy prices.
 */
export function selectOptionForTotal<T extends OptionLineFields>(
  items: readonly T[] | null | undefined,
  index: number,
): T[] {
  if (!Array.isArray(items)) {
    return [];
  }
  if (items.length === 0) {
    return items as T[];
  }
  const chosen = items[index];
  if (!chosen) {
    return items as T[];
  }
  const groupId = parseOptionGroupId(chosen.optionGroupId);
  if (!groupId) {
    return items as T[];
  }
  const members = optionGroupMembers(items, groupId);
  if (members.length === 0) {
    return items as T[];
  }
  if (members.length === 1) {
    return sanitizeOptionGroups(items);
  }
  const baseCount = members.filter((member) => member.item.optionRole === 'base').length;
  if (chosen.optionRole === 'base' && baseCount === 1) {
    return items as T[];
  }
  let changed = false;
  const next = items.map((item, i) => {
    if (parseOptionGroupId(item.optionGroupId) !== groupId) {
      return item;
    }
    const nextRole: OptionRole = i === index ? 'base' : 'alt';
    if (item.optionRole === nextRole) {
      return item;
    }
    changed = true;
    return { ...item, optionRole: nextRole };
  });
  return changed ? next : (items as T[]);
}

/**
 * Quote total from the selected option in each pair (plus ungrouped
 * lines). Empty groups contribute 0. Blank cents stay 0 — never guessed.
 */
export function selectedOptionTotalCents(
  items: readonly OptionLineFields[] | null | undefined,
): number {
  if (!Array.isArray(items) || items.length === 0) {
    return 0;
  }
  let sum = 0;
  const counted = new Set<number>();
  for (const group of listOptionGroups(items)) {
    const selected = group.base ?? (group.members[0] ?? null);
    if (!selected) {
      continue;
    }
    sum += lineAmountCents(selected.item);
    counted.add(selected.index);
  }
  items.forEach((item, index) => {
    if (counted.has(index)) {
      return;
    }
    if (parseOptionGroupId(item.optionGroupId)) {
      return;
    }
    if (item.optionRole === 'alt') {
      return;
    }
    sum += lineAmountCents(item);
  });
  return sum;
}

export function canSelectOptionForTotal(
  items: readonly OptionLineFields[] | null | undefined,
  index: number,
): boolean {
  if (!Array.isArray(items) || items.length === 0) {
    return false;
  }
  const item = items[index];
  if (!item || item.optionRole !== 'alt') {
    return false;
  }
  return optionGroupMembers(items, item.optionGroupId).length >= 2;
}

/**
 * Draft chrome for picking base vs alternate. Empty / orphan groups do
 * not assume a partner exists (no crash, no "Use for total" on a ghost).
 */
export function optionLineChrome(
  items: readonly OptionLineFields[] | null | undefined,
  index: number,
): OptionLineChrome {
  const empty: OptionLineChrome = {
    kind: 'none',
    badge: null,
    badgeIsAlt: false,
    showSelect: false,
    selectLabel: null,
    addLabel: null,
    selectedHint: null,
    accessibilityLabel: '',
  };
  if (!Array.isArray(items) || items.length === 0) {
    return empty;
  }
  const item = items[index];
  if (!item) {
    return empty;
  }
  const name = typeof item.name === 'string' && item.name.trim() !== '' ? item.name.trim() : 'this item';
  const groupId = parseOptionGroupId(item.optionGroupId);
  const members = groupId ? optionGroupMembers(items, groupId) : [];
  if (!groupId || members.length < 2) {
    return {
      kind: 'add',
      badge: null,
      badgeIsAlt: false,
      showSelect: false,
      selectLabel: null,
      addLabel: ADD_ALTERNATE_LABEL,
      selectedHint: null,
      accessibilityLabel: `${ADD_ALTERNATE_LABEL} for ${name}`,
    };
  }
  const isAlt = item.optionRole === 'alt';
  return {
    kind: 'pair',
    badge: isAlt ? OPTION_ALTERNATE_LABEL : OPTION_IN_TOTAL_LABEL,
    badgeIsAlt: isAlt,
    showSelect: isAlt,
    selectLabel: isAlt ? OPTION_USE_FOR_TOTAL_LABEL : null,
    addLabel: null,
    selectedHint: isAlt ? null : OPTION_SELECTED_HINT,
    accessibilityLabel: isAlt
      ? `${OPTION_USE_FOR_TOTAL_LABEL}. ${name}. ${OPTION_SWITCH_HINT}`
      : `${name}. ${OPTION_IN_TOTAL_LABEL}. ${OPTION_SELECTED_HINT}`,
  };
}
