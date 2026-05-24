import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateAndBuildLineItems } from './voice-validation.js';
import type { CatalogItemRow } from './voice-validation.js';
import type { AILineItem } from '../types/voice.js';

const catalog: CatalogItemRow[] = [
  { id: 'cat-1', name: 'Light Switch Replacement', unit_price_cents: 7500 },
  { id: 'cat-2', name: 'Outlet Installation', unit_price_cents: 12000 },
  { id: 'cat-3', name: 'Panel Upgrade', unit_price_cents: 250000 },
];

describe('validateAndBuildLineItems', () => {
  it('accepts only items with valid catalog IDs', () => {
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

  it('rejects all items when none match catalog', () => {
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

  it('handles empty catalog (all items rejected)', () => {
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
});
