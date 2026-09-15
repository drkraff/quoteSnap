/**
 * Thin option groups (design §8): one base + one alternate per undecided
 * item. Selected-for-total is encoded as role `base` (swap to pick the
 * other). No option_groups table. Never invent a price.
 */

export const OPTION_ROLES = ["base", "alt"] as const;

export type OptionRole = (typeof OPTION_ROLES)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OPTION_GROUP_ID_ERROR = "optionGroupId must be a UUID or null";
const OPTION_ROLE_ERROR = "optionRole must be base, alt, or null";
export const OPTION_PAIR_ERROR =
  "optionGroupId and optionRole must both be set, or both cleared";

export function isOptionRole(value: unknown): value is OptionRole {
  return typeof value === "string" && (OPTION_ROLES as readonly string[]).includes(value);
}

export function lineContributesToTotal(item: {
  optionRole?: string | null;
}): boolean {
  return item.optionRole !== "alt";
}

export type OptionLineFields = {
  optionGroupId?: string | null;
  optionRole?: string | null;
  quantity?: number | null;
  unitPriceCents?: number | null;
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

export function parseOptionGroupId(value: unknown): string | undefined {
  return typeof value === "string" && UUID_RE.test(value) ? value : undefined;
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
      base: members.find((member) => member.item.optionRole === "base") ?? null,
      alt: members.find((member) => member.item.optionRole === "alt") ?? null,
    };
  });
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
 * Incomplete groups (0–1 members) become ungrouped. Pairs get exactly one
 * `base`. Prices are never rewritten.
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
    const nextRole: OptionRole = index === selectedIndex ? "base" : "alt";
    if (item.optionRole === nextRole && item.optionGroupId === id) {
      return item;
    }
    changed = true;
    return { ...item, optionGroupId: id, optionRole: nextRole };
  });
  return changed ? next : (items as T[]);
}

/**
 * Pick this line as `base`. Empty lists, bad indexes, unpaired lines, and
 * empty groups are no-ops. Does not invent prices.
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
  const baseCount = members.filter((member) => member.item.optionRole === "base").length;
  if (chosen.optionRole === "base" && baseCount === 1) {
    return items as T[];
  }
  let changed = false;
  const next = items.map((item, i) => {
    if (parseOptionGroupId(item.optionGroupId) !== groupId) {
      return item;
    }
    const nextRole: OptionRole = i === index ? "base" : "alt";
    if (item.optionRole === nextRole) {
      return item;
    }
    changed = true;
    return { ...item, optionRole: nextRole };
  });
  return changed ? next : (items as T[]);
}

/**
 * Total from the selected option in each pair (plus ungrouped lines).
 * Empty groups contribute 0. Blank cents stay 0 — never guessed.
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
    const selected = group.base ?? group.members[0] ?? null;
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
    if (item.optionRole === "alt") {
      return;
    }
    sum += lineAmountCents(item);
  });
  return sum;
}

/**
 * Omitted → preserve (undefined). Explicit null/empty clears.
 * Invalid UUID → 400.
 */
export function parseOptionalOptionGroupId(
  value: unknown,
): { ok: true; optionGroupId: string | null | undefined } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, optionGroupId: undefined };
  }
  if (value === null || value === "") {
    return { ok: true, optionGroupId: null };
  }
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    return { ok: false, error: OPTION_GROUP_ID_ERROR };
  }
  return { ok: true, optionGroupId: value };
}

/**
 * Omitted → preserve (undefined). Explicit null/empty clears.
 * Invalid role → 400.
 */
export function parseOptionalOptionRole(
  value: unknown,
): { ok: true; optionRole: OptionRole | null | undefined } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, optionRole: undefined };
  }
  if (value === null || value === "") {
    return { ok: true, optionRole: null };
  }
  if (!isOptionRole(value)) {
    return { ok: false, error: OPTION_ROLE_ERROR };
  }
  return { ok: true, optionRole: value };
}

export type ParsedOptionGroup = {
  optionGroupId: string | null | undefined;
  optionRole: OptionRole | null | undefined;
};

/**
 * Pair must be both present or both cleared when either key is sent.
 * All-omitted is preserve. Mixed (id without role, or the reverse) is 400.
 */
export function parseOptionGroupFields(
  optionGroupId: string | null | undefined,
  optionRole: OptionRole | null | undefined,
  idKeyPresent: boolean,
  roleKeyPresent: boolean,
): { ok: true; fields: ParsedOptionGroup } | { ok: false; error: string } {
  if (!idKeyPresent && !roleKeyPresent) {
    return { ok: true, fields: { optionGroupId: undefined, optionRole: undefined } };
  }

  const id = idKeyPresent ? optionGroupId : undefined;
  const role = roleKeyPresent ? optionRole : undefined;

  const idCleared = idKeyPresent && (id === null || id === undefined);
  const roleCleared = roleKeyPresent && (role === null || role === undefined);
  const idSet = typeof id === "string";
  const roleSet = isOptionRole(role);

  if (idSet && roleSet) {
    return { ok: true, fields: { optionGroupId: id, optionRole: role } };
  }
  if ((idCleared && roleCleared) || (idCleared && !roleKeyPresent) || (roleCleared && !idKeyPresent)) {
    return { ok: true, fields: { optionGroupId: null, optionRole: null } };
  }
  if (idSet && !roleKeyPresent) {
    return { ok: false, error: OPTION_PAIR_ERROR };
  }
  if (roleSet && !idKeyPresent) {
    return { ok: false, error: OPTION_PAIR_ERROR };
  }
  if (idSet !== roleSet) {
    return { ok: false, error: OPTION_PAIR_ERROR };
  }
  return { ok: true, fields: { optionGroupId: null, optionRole: null } };
}
