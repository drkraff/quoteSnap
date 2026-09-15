import {
  customerLinePayloadKeys,
  customerPayloadHasPrivateNoteKey,
  customerQuotePayloadKeys,
  toContractorLineItemSync,
  toCustomerQuotePayload,
} from './customer-payload';

const SECRET_JOB = 'subcontractor check — do not tell the client';
const SECRET_LINE = 'moisture from neighbor pipe';

describe('toCustomerQuotePayload', () => {
  it('allowlists customer fields and drops job + line private notes', () => {
    const payload = toCustomerQuotePayload({
      customerPhone: '+15555550100',
      totalCents: 2500,
      clientSentence: 'Appliances and decorative lighting not included.',
      privateNote: SECRET_JOB,
      notes: 'leftover drafts.notes must not leak either',
      lineItems: [
        {
          name: 'Replace outlet',
          quantity: 3,
          unitPriceCents: 25000,
          unit: 'each',
          privateNote: SECRET_LINE,
          notes: 'also not customer-facing',
        },
      ],
    });

    expect(payload).toEqual({
      customerPhone: '+15555550100',
      totalCents: 2500,
      clientSentence: 'Appliances and decorative lighting not included.',
      lineItems: [
        {
          name: 'Replace outlet',
          quantity: 3,
          unitPriceCents: 25000,
          unit: 'each',
        },
      ],
    });
    expect(Object.keys(payload).sort()).toEqual([...customerQuotePayloadKeys()].sort());
    expect(Object.keys(payload.lineItems[0]!).sort()).toEqual(
      [...customerLinePayloadKeys()].sort(),
    );
    expect(customerPayloadHasPrivateNoteKey(payload)).toBe(false);

    const json = JSON.stringify(payload);
    expect(json).not.toContain(SECRET_JOB);
    expect(json).not.toContain(SECRET_LINE);
    expect(json).not.toContain('privateNote');
    expect(json).not.toContain('private_note');
    expect(json).not.toContain('notes');
    expect(json).toContain('Appliances and decorative lighting not included.');
  });

  it('does not invent prices — unknown unitPriceCents stays null', () => {
    const payload = toCustomerQuotePayload({
      customerPhone: null,
      totalCents: 0,
      privateNote: SECRET_JOB,
      lineItems: [
        {
          name: 'Laminate cabinets',
          quantity: 14,
          unitPriceCents: null,
          unit: 'foot',
          privateNote: SECRET_LINE,
        },
      ],
    });
    expect(payload.lineItems[0]!.unitPriceCents).toBeNull();
    expect(payload.totalCents).toBe(0);
    expect(payload.clientSentence).toBeNull();
    expect(JSON.stringify(payload)).not.toContain(SECRET_JOB);
  });

  it('omits the unselected alt from the customer payload', () => {
    const groupId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const payload = toCustomerQuotePayload({
      customerPhone: '+15555550100',
      totalCents: 180000,
      lineItems: [
        {
          name: 'Walk-in shower',
          quantity: 1,
          unitPriceCents: 180000,
          unit: 'job',
          optionGroupId: groupId,
          optionRole: 'base',
        },
        {
          name: 'Keep the tub',
          quantity: 1,
          unitPriceCents: 45000,
          unit: 'job',
          optionGroupId: groupId,
          optionRole: 'alt',
        },
      ],
    });
    expect(payload.lineItems).toEqual([
      {
        name: 'Walk-in shower',
        quantity: 1,
        unitPriceCents: 180000,
        unit: 'job',
      },
    ]);
    expect(payload.totalCents).toBe(180000);
    expect(payload.clientSentence).toBeNull();
    expect(JSON.stringify(payload)).not.toContain('Keep the tub');
    expect(JSON.stringify(payload)).not.toContain('optionRole');
  });
});

describe('toContractorLineItemSync', () => {
  it('keeps privateNote on the contractor PUT so notes can round-trip', () => {
    expect(
      toContractorLineItemSync({
        name: 'Replace outlet',
        quantity: 1,
        unitPriceCents: 25000,
        unit: 'each',
        privateNote: SECRET_LINE,
      }),
    ).toEqual({
      name: 'Replace outlet',
      quantity: 1,
      unitPriceCents: 25000,
      unit: 'each',
      privateNote: SECRET_LINE,
    });
  });

  it('keeps priceSource on the contractor PUT so flags can round-trip', () => {
    expect(
      toContractorLineItemSync({
        name: 'Labor',
        quantity: 2,
        unitPriceCents: 7500,
        unit: 'hour',
        priceSource: 'computed',
      }),
    ).toEqual({
      name: 'Labor',
      quantity: 2,
      unitPriceCents: 7500,
      unit: 'hour',
      privateNote: null,
      priceSource: 'computed',
    });
  });

  it('keeps optionGroupId + optionRole on the contractor PUT so the pair round-trips', () => {
    const groupId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(
      toContractorLineItemSync({
        name: 'Keep the tub',
        quantity: 1,
        unitPriceCents: 45000,
        unit: 'job',
        optionGroupId: groupId,
        optionRole: 'alt',
      }),
    ).toEqual({
      name: 'Keep the tub',
      quantity: 1,
      unitPriceCents: 45000,
      unit: 'job',
      privateNote: null,
      optionGroupId: groupId,
      optionRole: 'alt',
    });
  });
});
