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
