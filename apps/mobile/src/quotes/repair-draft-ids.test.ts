import fs from 'fs';
import path from 'path';
import { lineItemsForQuotePut, repairDraftLineItemsJson } from './repair-draft-ids';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ids(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `99999999-9999-4999-8999-${n.toString(16).padStart(12, '0')}`;
  };
}

const CATALOG = '55555555-5555-4555-8555-555555555555';

describe('repairDraftLineItemsJson', () => {
  it('repairs line-0 ids without dropping lines or prices, and a second pass is a no-op', () => {
    const stuck = JSON.stringify([
      {
        catalogItemId: 'line-0',
        name: 'Double socket',
        quantity: 2,
        unitPriceCents: 8000,
        clientId: 'line-0',
        priceSource: 'computed',
        unit: 'each',
      },
      {
        catalogItemId: '',
        name: 'Labor',
        quantity: 3,
        unitPriceCents: 1500,
        clientId: 'line-0',
        priceSource: 'computed',
        unit: 'hour',
      },
    ]);

    const once = repairDraftLineItemsJson(stuck, ids());
    const twice = repairDraftLineItemsJson(once.json, ids());

    expect(once.changed).toBe(true);
    expect(once.items).toHaveLength(2);
    expect(once.items[0]).toMatchObject({
      name: 'Double socket',
      quantity: 2,
      unitPriceCents: 8000,
      priceSource: 'computed',
      catalogItemId: '',
    });
    expect(once.items[1]).toMatchObject({
      name: 'Labor',
      quantity: 3,
      unitPriceCents: 1500,
      priceSource: 'computed',
      catalogItemId: '',
    });
    expect(once.items[0]?.clientId).toMatch(UUID_RE);
    expect(once.items[1]?.clientId).toMatch(UUID_RE);
    expect(once.items[0]?.clientId).not.toBe(once.items[1]?.clientId);
    expect(twice.changed).toBe(false);
    expect(twice.items.map((item) => item.clientId)).toEqual(
      once.items.map((item) => item.clientId),
    );

    const body = lineItemsForQuotePut(once.items);
    expect(body[0]?.catalogItemId).toBeNull();
    expect(body[1]?.catalogItemId).toBeNull();
    expect(body[0]?.clientId).toBe(once.items[0]?.clientId);
    expect(body[0]?.unitPriceCents).toBe(8000);
    expect(body[1]?.priceSource).toBe('computed');
  });

  it('keeps a real catalog UUID and does not rewrite it to null', () => {
    const json = JSON.stringify([
      {
        catalogItemId: CATALOG,
        name: 'Cable',
        quantity: 2,
        unitPriceCents: 3000,
        clientId: '44444444-4444-4444-8444-444444444444',
        priceSource: 'catalog',
      },
    ]);
    const repaired = repairDraftLineItemsJson(json, ids());
    expect(repaired.changed).toBe(false);
    expect(lineItemsForQuotePut(repaired.items)[0]?.catalogItemId).toBe(CATALOG);
  });

  it('draft screen keys lines by client id and remounts when the quote id changes', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../app/(app)/draft/[id].tsx'),
      'utf8',
    );
    expect(src).toContain('draftListRowKey');
    expect(src).toContain('key={draftEditorKey(id)}');
    expect(src).not.toContain('`line-${row.index}`');
  });
});
