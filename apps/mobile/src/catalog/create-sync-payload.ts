import { parseCatalogUnit } from './units';

export type CatalogCreateSyncFields = {
  name: string;
  unit: string;
  unitPriceCents: number;
};

export type CatalogCreateSyncPayload = CatalogCreateSyncFields & {
  tradeCategory?: string;
};

/**
 * Queue payload for POST /catalog (A-15). Local create already stamps
 * `tradeCategory` (contractor trade); omitting it here stored NULL on the
 * server and hydrate grouped the item under "Other".
 */
export function catalogCreateSyncPayload(
  data: CatalogCreateSyncFields,
  tradeCategory: string | null,
): CatalogCreateSyncPayload {
  const payload: CatalogCreateSyncPayload = {
    name: data.name,
    unit: data.unit,
    unitPriceCents: data.unitPriceCents,
  };
  if (typeof tradeCategory === 'string') {
    const trimmed = tradeCategory.trim();
    if (trimmed !== '') {
      payload.tradeCategory = trimmed;
    }
  }
  return payload;
}

/**
 * PUT body from a catalog_item update queue item. Omits `tradeCategory` unless
 * the queued payload included it so name/unit/price edits cannot SET NULL (A-15).
 */
export function catalogUpdateFromQueuePayload(payload: Record<string, unknown>): {
  name?: string;
  unit?: string;
  unitPriceCents?: number;
  tradeCategory?: string;
} {
  const body: {
    name?: string;
    unit?: string;
    unitPriceCents?: number;
    tradeCategory?: string;
  } = {
    name: payload.name as string | undefined,
    unit:
      payload.unit === undefined
        ? undefined
        : (parseCatalogUnit(payload.unit) ?? (payload.unit as string)),
    unitPriceCents: payload.unitPriceCents as number | undefined,
  };
  if (typeof payload.tradeCategory === 'string') {
    const trimmed = payload.tradeCategory.trim();
    if (trimmed !== '') {
      body.tradeCategory = trimmed;
    }
  }
  return body;
}
