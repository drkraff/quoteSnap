import {
  canCoalesce,
  coalesceKind,
  isSupersededByLaterItem,
  mergedPayloadJson,
  type CoalesceItem,
} from './sync-coalesce';

function item(overrides: Partial<CoalesceItem> & Pick<CoalesceItem, 'payloadJson' | 'createdAt'>): CoalesceItem {
  return {
    entityType: 'draft',
    entityId: 'd1',
    action: 'update',
    status: 'pending',
    ...overrides,
  };
}

describe('sync coalesce', () => {
  it('replaces an older draft snapshot so the last edit is the one that syncs', () => {
    const older = item({
      payloadJson: JSON.stringify({ lineItemsJson: '[{"name":"Pipe"}]', totalCents: 100 }),
      createdAt: new Date(1),
    });
    const newer = item({
      payloadJson: JSON.stringify({ lineItemsJson: '[{"name":"Valve"}]', totalCents: 900 }),
      createdAt: new Date(2),
    });
    expect(canCoalesce(older, newer)).toBe(true);
    expect(coalesceKind(older)).toBe('draft-snapshot');
    expect(mergedPayloadJson(older.payloadJson, newer.payloadJson, 'draft-snapshot')).toBe(newer.payloadJson);
    expect(isSupersededByLaterItem(older, [older, newer])).toBe(true);
    expect(isSupersededByLaterItem(newer, [older, newer])).toBe(false);
  });

  it('merges partial quote patches and does not fold an archive into a phone edit', () => {
    const phone = item({
      entityType: 'quote',
      entityId: 'q1',
      payloadJson: JSON.stringify({ customerPhone: '555' }),
      createdAt: new Date(1),
    });
    const note = item({
      entityType: 'quote',
      entityId: 'q1',
      payloadJson: JSON.stringify({ privateNote: 'behind the sink' }),
      createdAt: new Date(2),
    });
    expect(mergedPayloadJson(phone.payloadJson, note.payloadJson, 'quote-fields')).toBe(
      JSON.stringify({ customerPhone: '555', privateNote: 'behind the sink' }),
    );
    const archive = item({
      entityType: 'quote',
      entityId: 'q1',
      payloadJson: JSON.stringify({ isArchived: true }),
      createdAt: new Date(3),
    });
    expect(canCoalesce(phone, archive)).toBe(false);
    expect(canCoalesce(phone, note)).toBe(true);
  });

  it('does not let a newer rate-card price lose to an older retry', () => {
    const older = item({
      entityType: 'rate_card',
      entityId: 'rate-card:pipe|foot|plumbing',
      payloadJson: JSON.stringify({ name: 'Pipe', unit: 'foot', unitPriceCents: 100 }),
      createdAt: new Date(1),
      status: 'pending',
    });
    const newer = item({
      entityType: 'rate_card',
      entityId: 'rate-card:pipe|foot|plumbing',
      payloadJson: JSON.stringify({ name: 'Pipe', unit: 'foot', unitPriceCents: 900 }),
      createdAt: new Date(2),
    });
    expect(isSupersededByLaterItem(older, [older, newer])).toBe(true);
    expect(mergedPayloadJson(older.payloadJson, newer.payloadJson, 'rate-card-upsert')).toContain('900');
  });

  it('keeps two photos on the same quote as separate uploads', () => {
    const a = item({
      entityType: 'photo',
      entityId: 'q1',
      action: 'create',
      payloadJson: JSON.stringify({ photoId: 'photo-a', quoteLocalId: 'q1' }),
      createdAt: new Date(1),
    });
    const b = item({
      entityType: 'photo',
      entityId: 'q1',
      action: 'create',
      payloadJson: JSON.stringify({ photoId: 'photo-b', quoteLocalId: 'q1' }),
      createdAt: new Date(2),
    });
    expect(canCoalesce(a, b)).toBe(false);
  });
});
