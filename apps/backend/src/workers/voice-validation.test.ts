import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVoiceLineItems,
  filterUuidCatalogIds,
  parseSpokenUnitPriceCents,
  validateAndBuildLineItems,
} from './voice-validation.js';
import type { CatalogItemRow } from './voice-validation.js';
import type { AILineItem } from '../types/voice.js';

const catalog: CatalogItemRow[] = [
  { id: 'cat-1', name: 'Light Switch Replacement', unit_price_cents: 7500, unit: 'each' },
  { id: 'cat-2', name: 'Outlet Installation', unit_price_cents: 12000, unit: 'each' },
  { id: 'cat-3', name: 'Panel Upgrade', unit_price_cents: 250000, unit: 'each' },
];

describe('validateAndBuildLineItems', () => {
  it('accepts only items with valid catalog IDs when no adhoc name is present', () => {
    const aiItems: AILineItem[] = [
      { catalogItemId: 'cat-1', quantity: 2, confidence: 0.95 },
      { catalogItemId: 'FAKE-ID', quantity: 1, confidence: 0.80 },
      { catalogItemId: 'cat-2', quantity: 3, confidence: 0.70 },
    ];

    const { lineItems } = validateAndBuildLineItems(aiItems, catalog);

    assert.equal(lineItems.length, 2);
    assert.equal(lineItems[0]!.catalogItemId, 'cat-1');
    assert.equal(lineItems[1]!.catalogItemId, 'cat-2');
  });

  it('rejects unnamed items when none match catalog', () => {
    const aiItems: AILineItem[] = [
      { catalogItemId: 'nonexistent-1', quantity: 1, confidence: 0.90 },
      { catalogItemId: 'nonexistent-2', quantity: 2, confidence: 0.85 },
    ];

    const { lineItems, totalCents } = validateAndBuildLineItems(aiItems, catalog);

    assert.equal(lineItems.length, 0);
    assert.equal(totalCents, 0);
  });

  it('uses catalog prices, not AI-invented prices', () => {
    const aiItems: AILineItem[] = [
      { catalogItemId: 'cat-1', quantity: 1, confidence: 0.90 },
    ];

    const { lineItems } = validateAndBuildLineItems(aiItems, catalog);

    assert.equal(lineItems[0]!.unitPriceCents, 7500);
    assert.equal(lineItems[0]!.name, 'Light Switch Replacement');
    assert.equal(lineItems[0]!.priceSource, 'catalog');
  });

  it('preserves confidence scores from AI', () => {
    const aiItems: AILineItem[] = [
      { catalogItemId: 'cat-1', quantity: 1, confidence: 0.42 },
      { catalogItemId: 'cat-2', quantity: 2, confidence: 0.91 },
    ];

    const { lineItems } = validateAndBuildLineItems(aiItems, catalog);

    assert.equal(lineItems[0]!.confidence, 0.42);
    assert.equal(lineItems[1]!.confidence, 0.91);
  });

  it('calculates totalCents correctly', () => {
    const aiItems: AILineItem[] = [
      { catalogItemId: 'cat-1', quantity: 2, confidence: 0.95 },  // 2 * 7500 = 15000
      { catalogItemId: 'cat-2', quantity: 3, confidence: 0.70 },  // 3 * 12000 = 36000
    ];

    const { totalCents } = validateAndBuildLineItems(aiItems, catalog);
    assert.equal(totalCents, 51000);
  });

  it('handles empty AI items array', () => {
    const { lineItems, totalCents } = validateAndBuildLineItems([], catalog);

    assert.equal(lineItems.length, 0);
    assert.equal(totalCents, 0);
  });

  it('handles empty catalog (unnamed catalog IDs rejected)', () => {
    const aiItems: AILineItem[] = [
      { catalogItemId: 'cat-1', quantity: 1, confidence: 0.90 },
    ];

    const { lineItems } = validateAndBuildLineItems(aiItems, []);

    assert.equal(lineItems.length, 0);
  });

  it('preserves quantity from AI response', () => {
    const aiItems: AILineItem[] = [
      { catalogItemId: 'cat-3', quantity: 5, confidence: 0.88 },
    ];

    const { lineItems } = validateAndBuildLineItems(aiItems, catalog);

    assert.equal(lineItems[0]!.quantity, 5);
  });

  it('drops non-UUID AI catalog IDs without throwing', () => {
    const uuidCatalog: CatalogItemRow[] = [
      { id: '11111111-1111-4111-8111-111111111111', name: 'Breaker', unit_price_cents: 5000 },
    ];
    const aiItems: AILineItem[] = [
      { catalogItemId: 'not-a-uuid', quantity: 1, confidence: 0.9 },
      { catalogItemId: 'light switch', quantity: 2, confidence: 0.8 },
      { catalogItemId: '11111111-1111-4111-8111-111111111111', quantity: 1, confidence: 0.7 },
    ];

    const { lineItems, totalCents } = validateAndBuildLineItems(aiItems, uuidCatalog);

    assert.equal(lineItems.length, 1);
    assert.equal(lineItems[0]!.catalogItemId, '11111111-1111-4111-8111-111111111111');
    assert.equal(totalCents, 5000);
  });

  it('keeps a non-catalog spoken line as adhoc with null price', () => {
    const aiItems: AILineItem[] = [
      {
        name: 'Laminate kitchen cabinets',
        quantity: 14,
        unit: 'foot',
        confidence: 0.8,
      },
    ];

    const { lineItems, totalCents } = validateAndBuildLineItems(aiItems, catalog);

    assert.equal(lineItems.length, 1);
    assert.equal(lineItems[0]!.catalogItemId, null);
    assert.equal(lineItems[0]!.name, 'Laminate kitchen cabinets');
    assert.equal(lineItems[0]!.quantity, 14);
    assert.equal(lineItems[0]!.unit, 'foot');
    assert.equal(lineItems[0]!.unitPriceCents, null);
    assert.equal(lineItems[0]!.priceSource, 'unknown');
    assert.equal(totalCents, 0);
  });

  it('lets a spoken unit price win over catalog and rate-card', () => {
    const { lineItems } = validateAndBuildLineItems(
      [
        {
          catalogItemId: 'cat-1',
          name: 'Light Switch Replacement',
          quantity: 1,
          unit: 'each',
          spokenUnitPriceCents: 9900,
          confidence: 0.9,
        },
      ],
      catalog,
      { lookupRateCard: () => 12000 },
    );

    assert.equal(lineItems[0]!.catalogItemId, 'cat-1');
    assert.equal(lineItems[0]!.unitPriceCents, 9900);
    assert.equal(lineItems[0]!.priceSource, 'spoken');
  });

  it('fills learned cents on an exact rate-card hit for adhoc lines', () => {
    const { lineItems } = validateAndBuildLineItems(
      [
        {
          name: 'Laminate cabinets',
          quantity: 14,
          unit: 'foot',
          confidence: 0.75,
        },
      ],
      catalog,
      {
        trade: 'plumbing',
        lookupRateCard: ({ name, unit, trade }) => {
          assert.equal(name, 'Laminate cabinets');
          assert.equal(unit, 'foot');
          assert.equal(trade, 'plumbing');
          return 180000;
        },
      },
    );

    assert.equal(lineItems[0]!.catalogItemId, null);
    assert.equal(lineItems[0]!.unitPriceCents, 180000);
    assert.equal(lineItems[0]!.priceSource, 'learned');
  });

  it('keeps unknown adhoc prices null even if a lookup is missing', () => {
    const { lineItems, totalCents } = validateAndBuildLineItems(
      [{ name: 'Quartz countertop', quantity: 12, unit: 'foot', confidence: 0.7 }],
      catalog,
      { lookupRateCard: () => null },
    );

    assert.equal(lineItems[0]!.unitPriceCents, null);
    assert.equal(lineItems[0]!.priceSource, 'unknown');
    assert.equal(totalCents, 0);
  });

  it('does not invent a price from a non-spoken LLM field', () => {
    const aiItems = [
      {
        name: 'Mystery assembly',
        quantity: 1,
        unit: 'job',
        confidence: 0.5,
        unitPriceCents: 99999,
      },
    ] as unknown as AILineItem[];

    const { lineItems } = validateAndBuildLineItems(aiItems, catalog);
    assert.equal(lineItems[0]!.unitPriceCents, null);
    assert.equal(lineItems[0]!.priceSource, 'unknown');
  });

  it('still maps catalog SKUs when mixed with adhoc lines', () => {
    const { lineItems } = validateAndBuildLineItems(
      [
        { catalogItemId: 'cat-2', quantity: 3, confidence: 0.91 },
        { name: 'Burnt kitchen box', quantity: 1, unit: 'each', confidence: 0.6 },
      ],
      catalog,
    );

    assert.equal(lineItems.length, 2);
    assert.equal(lineItems[0]!.catalogItemId, 'cat-2');
    assert.equal(lineItems[0]!.unitPriceCents, 12000);
    assert.equal(lineItems[0]!.priceSource, 'catalog');
    assert.equal(lineItems[1]!.catalogItemId, null);
    assert.equal(lineItems[1]!.name, 'Burnt kitchen box');
    assert.equal(lineItems[1]!.unitPriceCents, null);
  });
});

describe('buildVoiceLineItems', () => {
  it('does not copy an unknown catalog UUID onto an adhoc name', () => {
    const built = buildVoiceLineItems(
      [{ catalogItemId: 'not-in-catalog', name: 'Haul-away', quantity: 1, unit: 'job', confidence: 0.4 }],
      catalog,
    );
    assert.equal(built[0]!.catalogItemId, null);
    assert.equal(built[0]!.name, 'Haul-away');
    assert.equal(built[0]!.spokenUnitPriceCents, null);
  });
});

describe('parseSpokenUnitPriceCents', () => {
  it('accepts positive integer cents only', () => {
    assert.equal(parseSpokenUnitPriceCents(850), 850);
    assert.equal(parseSpokenUnitPriceCents(null), null);
    assert.equal(parseSpokenUnitPriceCents(8.5), null);
    assert.equal(parseSpokenUnitPriceCents(0), null);
    assert.equal(parseSpokenUnitPriceCents(-1), null);
  });
});

describe('filterUuidCatalogIds', () => {
  it('keeps only UUID-shaped IDs so Postgres uuid = ANY() will not crash', () => {
    const ids = [
      '11111111-1111-4111-8111-111111111111',
      'not-a-uuid',
      'light switch',
      '22222222-2222-4222-8222-222222222222',
      '',
    ];

    assert.deepEqual(filterUuidCatalogIds(ids), [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
  });

  it('returns an empty array when every ID is invalid', () => {
    assert.deepEqual(filterUuidCatalogIds(['nope', 'also-nope']), []);
  });
});
