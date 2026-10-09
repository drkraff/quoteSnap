import fs from 'fs';
import path from 'path';
import {
  DUPLICATE_QUOTE_A11Y,
  DUPLICATE_QUOTE_HINT,
  DUPLICATE_QUOTE_LABEL,
  assignDuplicateQuoteRecord,
  buildDuplicateDraft,
  createDuplicateTapGuard,
  duplicateQuoteEnqueuePlan,
  duplicateQuoteOnDevice,
  runDuplication,
  type DuplicateDraft,
  type DuplicateLocalQuoteFields,
  type DuplicateSourceRecord,
} from './duplicate-quote';

jest.mock('../db', () => ({
  database: {
    write: jest.fn(),
    get: jest.fn(),
  },
}));

jest.mock('../sync/sync-queue', () => ({
  enqueue: jest.fn(),
}));

const ROOM = '11111111-1111-4111-8111-111111111111';
const ROOM_2 = '22222222-2222-4222-8222-222222222222';
const GROUP = '33333333-3333-4333-8333-333333333333';
const CLIENT = '44444444-4444-4444-8444-444444444444';
const CLIENT_2 = '45454545-4545-4454-8454-454545454545';
const CATALOG = '55555555-5555-4555-8555-555555555555';
const PHOTO = '66666666-6666-4666-8666-666666666666';
const SERVER = '77777777-7777-4777-8777-777777777777';

function newIds(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `99999999-9999-4999-8999-${n.toString(16).padStart(12, '0')}`;
  };
}

function richSource(): DuplicateSourceRecord {
  return {
    id: 'source-local',
    status: 'sent',
    customerPhone: ' +15551212 ',
    totalCents: 999999,
    sentAt: new Date('2026-03-01T00:00:00.000Z'),
    approvedAt: new Date('2026-03-02T00:00:00.000Z'),
    declinedAt: new Date('2026-03-03T00:00:00.000Z'),
    followedUpAt: new Date('2026-03-04T00:00:00.000Z'),
    followUpDismissed: true,
    serverId: SERVER,
    voiceJobId: 'voice-job-1',
    aiFailureStage: 'timeout',
    isArchived: true,
    privateNote: '  gate code 1234  ',
    clientSentence: '  Copper only  ',
    rooms: [
      { id: ROOM, name: 'Kitchen', privateNote: ' under the sink ' },
      { id: ROOM_2, name: 'Bath' },
    ],
    photos: [
      {
        id: PHOTO,
        localUri: 'file:///photos/source-local/still.jpg',
        mime: 'image/jpeg',
        status: 'uploaded',
        serverId: SERVER,
        roomId: ROOM,
        lineClientId: CLIENT,
      },
    ],
    photosJson: JSON.stringify([
      {
        id: PHOTO,
        localUri: 'file:///photos/source-local/still.jpg',
        mime: 'image/jpeg',
        status: 'uploaded',
        serverId: SERVER,
      },
    ]),
    lineItems: [
      {
        catalogItemId: CATALOG,
        name: 'Faucet',
        quantity: 1,
        unitPriceCents: 2500,
        unit: 'each',
        confidence: 0.42,
        privateNote: ' old valve ',
        priceSource: 'catalog',
        roomId: ROOM,
        clientId: CLIENT,
      },
      {
        catalogItemId: '',
        name: 'Supply line',
        quantity: 2,
        unitPriceCents: null,
        unit: 'foot',
        priceSource: 'spoken',
        materialCostCents: 400,
        roomId: ROOM,
        clientId: CLIENT_2,
      },
      {
        catalogItemId: '',
        name: 'Faucet bronze',
        quantity: 1,
        unitPriceCents: 9000,
        unit: 'each',
        priceSource: 'known',
        optionGroupId: GROUP,
        optionRole: 'alt',
        roomId: ROOM,
      },
      {
        catalogItemId: '',
        name: 'Faucet chrome',
        quantity: 1,
        unitPriceCents: 0,
        unit: 'each',
        priceSource: 'learned',
        optionGroupId: GROUP,
        optionRole: 'base',
        roomId: ROOM,
      },
    ],
    snapshot: { payload: 'snapshot-body-secret' },
    snapshotId: 'snapshot-row-1',
    approvalToken: 'approval-token-secret',
    tokenHash: 'token-hash-secret',
  };
}

function blankRecord(): DuplicateLocalQuoteFields {
  return {
    contractorId: '',
    status: 'sent',
    totalCents: 1,
    isArchived: true,
    customerPhone: '+1999',
    privateNote: 'old',
    clientSentence: 'old sentence',
    roomsJson: 'old',
    photosJson: 'old-photos',
    serverId: SERVER,
    sentAt: new Date('2020-01-01T00:00:00.000Z'),
    voiceJobId: 'job',
    aiFailureStage: 'asr',
    followedUpAt: new Date('2020-01-02T00:00:00.000Z'),
    followUpDismissed: true,
  };
}

describe('buildDuplicateDraft', () => {
  it('copies lines, rooms, option groups, sentence, and notes onto a new draft', () => {
    const draft = buildDuplicateDraft(richSource(), newIds());

    expect(draft.status).toBe('draft_local');
    expect(draft.customerPhone).toBe('+15551212');
    expect(draft.privateNote).toBe('gate code 1234');
    expect(draft.clientSentence).toBe('Copper only');
    expect(draft.rooms.map((room) => room.name)).toEqual(['Kitchen', 'Bath']);
    expect(draft.rooms[0]?.privateNote).toBe('under the sink');
    expect(draft.rooms[1]?.privateNote).toBeUndefined();
    expect(draft.lineItems.map((line) => line.name)).toEqual([
      'Faucet',
      'Supply line',
      'Faucet bronze',
      'Faucet chrome',
    ]);
    expect(draft.lineItems[0]).toMatchObject({
      catalogItemId: CATALOG,
      quantity: 1,
      unit: 'each',
      unitPriceCents: 2500,
      privateNote: 'old valve',
      priceSource: 'catalog',
    });
    expect(draft.lineItems[1]).toMatchObject({
      quantity: 2,
      unit: 'foot',
      unitPriceCents: null,
      priceSource: 'unknown',
      materialCostCents: 400,
    });
    expect(draft.lineItems[2]?.optionRole).toBe('alt');
    expect(draft.lineItems[3]?.optionRole).toBe('base');
    expect(draft.lineItems[2]?.optionGroupId).toBe(draft.lineItems[3]?.optionGroupId);
    expect(draft.lineItems[2]?.unitPriceCents).toBe(9000);
    expect(draft.lineItems[3]?.unitPriceCents).toBe(0);
    expect(draft.lineItems[3]?.priceSource).toBe('unknown');
    // Base is blank, so the pair contributes 0. The priced ungrouped faucet is the total.
    expect(draft.totalCents).toBe(2500);
    expect(draft.lineItems[0]?.roomId).toBe(draft.rooms[0]?.id);
    expect(draft.lineItems[0]?.clientId).toBeTruthy();
    expect(draft.lineItems[1]?.clientId).toBeTruthy();
    expect(draft.lineItems[0]?.clientId).not.toBe(draft.lineItems[1]?.clientId);
  });

  it('does not copy status, timestamps, follow-up, server ids, snapshots, archive, or photos', () => {
    const draft = buildDuplicateDraft(richSource(), newIds());
    const json = JSON.stringify(draft);

    expect(draft.isArchived).toBe(false);
    expect(draft.serverId).toBeNull();
    expect(draft.sentAt).toBeNull();
    expect(draft.approvedAt).toBeNull();
    expect(draft.declinedAt).toBeNull();
    expect(draft.followedUpAt).toBeNull();
    expect(draft.followUpDismissed).toBeNull();
    expect(draft.voiceJobId).toBeNull();
    expect(draft.aiFailureStage).toBeNull();
    expect(draft.photos).toEqual([]);
    expect(draft.photosJson).toBe('[]');
    expect(json).not.toContain(SERVER);
    expect(json).not.toContain(PHOTO);
    expect(json).not.toContain('still.jpg');
    expect(json).not.toContain('snapshot-body-secret');
    expect(json).not.toContain('approval-token-secret');
    expect(json).not.toContain('token-hash-secret');
    expect(json).not.toContain('snapshot-row-1');
    expect(json).not.toContain('voice-job-1');
    expect(json).not.toContain('source-local');
    expect(draft.lineItems.every((line) => line.confidence == null)).toBe(true);
    expect(json).not.toContain('"confidence"');
  });

  it('keeps blank prices blank and does not invent a dollar amount', () => {
    const draft = buildDuplicateDraft({
      lineItems: [
        { catalogItemId: '', name: 'Unknown part', quantity: 3, unitPriceCents: null, unit: 'each' },
        { catalogItemId: '', name: 'Zero part', quantity: 1, unitPriceCents: 0 },
      ],
    }, newIds());

    expect(draft.lineItems[0]?.unitPriceCents).toBeNull();
    expect(draft.lineItems[1]?.unitPriceCents).toBe(0);
    expect(draft.lineItems[0]?.clientId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(draft.lineItems[0]?.clientId).not.toBe(draft.lineItems[1]?.clientId);
    expect(draft.lineItems[0]?.priceSource).toBeUndefined();
    expect(draft.totalCents).toBe(0);
    expect(JSON.stringify(draft)).not.toMatch(/"unitPriceCents":\s*[1-9]/);
  });

  it('does not share objects or ids with the source', () => {
    const source = richSource();
    const rooms = source.rooms ?? [];
    const lines = source.lineItems as { name: string; unitPriceCents: number | null; roomId?: string }[];
    const draft = buildDuplicateDraft(source, newIds());

    expect(draft.rooms[0]).not.toBe(rooms[0]);
    expect(draft.lineItems[0]).not.toBe(lines[0]);
    expect(draft.rooms.map((room) => room.id)).not.toEqual([ROOM, ROOM_2]);
    expect(draft.lineItems[2]?.optionGroupId).not.toBe(GROUP);
    expect(draft.lineItems[0]?.clientId).not.toBe(CLIENT);
    expect(draft.lineItems[0]?.roomId).not.toBe(ROOM);

    lines[0]!.name = 'Changed original';
    lines[0]!.unitPriceCents = 1;
    rooms[0]!.name = 'Changed room';
    expect(draft.lineItems[0]?.name).toBe('Faucet');
    expect(draft.lineItems[0]?.unitPriceCents).toBe(2500);
    expect(draft.rooms[0]?.name).toBe('Kitchen');

    draft.lineItems[0]!.name = 'Changed copy';
    draft.lineItems[0]!.unitPriceCents = 5;
    draft.rooms[0]!.name = 'Copy room';
    expect(lines[0]!.name).toBe('Changed original');
    expect(lines[0]!.unitPriceCents).toBe(1);
    expect(rooms[0]!.name).toBe('Changed room');
  });

  it('copies sent, approved, and archived sources without keeping that state', () => {
    for (const status of ['sent', 'approved', 'declined', 'expired', 'failed_send', 'draft_queued']) {
      const draft = buildDuplicateDraft({
        status,
        isArchived: true,
        sentAt: '2026-01-01T00:00:00.000Z',
        serverId: SERVER,
        lineItemsJson: JSON.stringify([
          { catalogItemId: '', name: 'Labor', quantity: 1, unitPriceCents: 1000, unit: 'hour' },
        ]),
      }, newIds());
      expect(draft.status).toBe('draft_local');
      expect(draft.isArchived).toBe(false);
      expect(draft.sentAt).toBeNull();
      expect(draft.serverId).toBeNull();
      expect(draft.lineItems[0]?.name).toBe('Labor');
      expect(draft.totalCents).toBe(1000);
    }
  });

  it('normalizes empty notes and does not invent a phone or a sentence', () => {
    const draft = buildDuplicateDraft({
      customerPhone: '   ',
      privateNote: ' ',
      clientSentence: '',
      lineItems: [],
    }, newIds());
    expect(draft.customerPhone).toBeNull();
    expect(draft.privateNote).toBeNull();
    expect(draft.clientSentence).toBeNull();
    expect(draft.lineItems).toEqual([]);
    expect(draft.rooms).toEqual([]);
    expect(draft.totalCents).toBe(0);
  });

  it('drops a stale room id instead of inventing a room', () => {
    const draft = buildDuplicateDraft({
      rooms: [],
      lineItems: [
        {
          catalogItemId: '',
          name: 'Loose',
          quantity: 1,
          unitPriceCents: 100,
          roomId: ROOM,
        },
      ],
    }, newIds());
    expect(draft.rooms).toEqual([]);
    expect(draft.lineItems[0]?.roomId).toBeUndefined();
    expect(draft.lineItems[0]?.unitPriceCents).toBe(100);
  });
});

describe('duplicate quote sync plan', () => {
  it('queues a new draft create and does not target the source quote', () => {
    const draft = buildDuplicateDraft(richSource(), newIds());
    const plan = duplicateQuoteEnqueuePlan({
      quoteId: 'new-quote',
      draftId: 'new-draft',
      sourceQuoteId: 'source-local',
      draft,
    });

    expect(plan.quoteCreate).toEqual({
      entityType: 'quote',
      entityId: 'new-quote',
      action: 'create',
      payload: {
        status: 'draft_local',
        totalCents: draft.totalCents,
        privateNote: 'gate code 1234',
        clientSentence: 'Copper only',
        customerPhone: '+15551212',
      },
    });
    expect(plan.draftUpdate).toEqual({
      entityType: 'draft',
      entityId: 'new-draft',
      action: 'update',
      payload: {
        lineItemsJson: draft.lineItemsJson,
        totalCents: draft.totalCents,
      },
    });
    const json = JSON.stringify(plan);
    expect(json).not.toContain('source-local');
    expect(json).not.toContain(SERVER);
    expect(json).not.toContain('approval-token-secret');
    expect(json).not.toContain('still.jpg');
    expect(plan.quoteCreate.action).not.toBe('update');
  });

  it('omits a blank phone and skips the draft update when there is nothing to sync', () => {
    const draft = buildDuplicateDraft({ customerPhone: null, lineItems: [] }, newIds());
    const plan = duplicateQuoteEnqueuePlan({
      quoteId: 'new-quote',
      draftId: 'new-draft',
      sourceQuoteId: 'source-local',
      draft,
    });
    expect(plan.quoteCreate.payload).not.toHaveProperty('customerPhone');
    expect(plan.quoteCreate.payload).toMatchObject({
      status: 'draft_local',
      totalCents: 0,
      privateNote: null,
      clientSentence: null,
    });
    expect(plan.draftUpdate).toBeNull();
  });

  it('refuses to enqueue the copy under the source id', () => {
    const draft = buildDuplicateDraft({}, newIds());
    expect(() => duplicateQuoteEnqueuePlan({
      quoteId: 'source-local',
      draftId: 'new-draft',
      sourceQuoteId: 'source-local',
      draft,
    })).toThrow(/source quote/);
  });
});

describe('assignDuplicateQuoteRecord', () => {
  it('writes draft_local fields and clears freeze, follow-up, and photo state', () => {
    const record = blankRecord();
    const draft: DuplicateDraft = buildDuplicateDraft({
      customerPhone: '+15550001',
      privateNote: 'note',
      clientSentence: 'scope',
      lineItems: [
        { catalogItemId: '', name: 'Pipe', quantity: 1, unitPriceCents: 1500 },
      ],
    }, newIds());
    assignDuplicateQuoteRecord(record, 'contractor-1', draft);
    expect(record).toMatchObject({
      contractorId: 'contractor-1',
      status: 'draft_local',
      totalCents: 1500,
      isArchived: false,
      customerPhone: '+15550001',
      privateNote: 'note',
      clientSentence: 'scope',
      photosJson: '[]',
      serverId: null,
      sentAt: null,
      voiceJobId: null,
      aiFailureStage: null,
      followedUpAt: null,
      followUpDismissed: null,
    });
    expect(record.roomsJson).toBe(draft.roomsJson);
  });
});

describe('createDuplicateTapGuard', () => {
  it('ignores a second tap until the first copy finishes', async () => {
    const guard = createDuplicateTapGuard();
    expect(guard.tryBegin()).toBe(true);
    expect(guard.tryBegin()).toBe(false);
    guard.end();
    expect(guard.tryBegin()).toBe(true);
    guard.end();

    let copies = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const overlapping = createDuplicateTapGuard();
    const first = runDuplication(overlapping, async () => {
      copies += 1;
      await gate;
    });
    const second = runDuplication(overlapping, async () => {
      copies += 1;
    });
    expect(await second).toBe('ignored');
    expect(copies).toBe(1);
    release();
    expect(await first).toBe('started');
    expect(copies).toBe(1);
  });
});

describe('duplicateQuoteOnDevice', () => {
  it('creates one local draft from a frozen sent quote and does not write the source', async () => {
    const source = richSource();
    const before = {
      status: source.status,
      totalCents: source.totalCents,
      serverId: source.serverId,
      isArchived: source.isArchived,
      sentAt: source.sentAt,
      followedUpAt: source.followedUpAt,
      followUpDismissed: source.followUpDismissed,
      lineItems: JSON.stringify(source.lineItems),
      photosJson: source.photosJson,
    };
    const update = jest.fn();
    const enqueued: unknown[] = [];
    const created: DuplicateLocalQuoteFields[] = [];
    let draftJson = '';

    const result = await duplicateQuoteOnDevice(
      { sourceQuoteId: source.id, contractorId: 'contractor-1' },
      {
        findQuote: async () => ({ ...source, update }),
        findDraftJson: async () => {
          throw new Error('draft json is already on the source');
        },
        write: async (work) => {
          await work();
        },
        createQuote: async (assign) => {
          const record = blankRecord();
          assign(record);
          created.push(record);
          return { id: 'new-quote' };
        },
        createDraft: async (assign) => {
          const record = { quoteId: '', lineItemsJson: '' };
          assign(record);
          draftJson = record.lineItemsJson;
          return { id: 'new-draft' };
        },
        enqueue: async (params) => {
          enqueued.push(params);
        },
        newId: newIds(),
      },
    );

    expect(result).toEqual({ ok: true, quoteId: 'new-quote' });
    expect(update).not.toHaveBeenCalled();
    expect(source.status).toBe(before.status);
    expect(source.totalCents).toBe(before.totalCents);
    expect(source.serverId).toBe(before.serverId);
    expect(source.isArchived).toBe(before.isArchived);
    expect(source.sentAt).toBe(before.sentAt);
    expect(source.followedUpAt).toBe(before.followedUpAt);
    expect(source.followUpDismissed).toBe(before.followUpDismissed);
    expect(JSON.stringify(source.lineItems)).toBe(before.lineItems);
    expect(source.photosJson).toBe(before.photosJson);
    expect(created[0]?.status).toBe('draft_local');
    expect(created[0]?.serverId).toBeNull();
    expect(created[0]?.isArchived).toBe(false);
    expect(created[0]?.sentAt).toBeNull();
    expect(created[0]?.photosJson).toBe('[]');
    expect(created[0]?.followedUpAt).toBeNull();
    expect(draftJson).toContain('Faucet');
    expect(draftJson).not.toContain(SERVER);
    expect(enqueued).toHaveLength(2);
    expect(enqueued[0]).toMatchObject({
      entityType: 'quote',
      entityId: 'new-quote',
      action: 'create',
    });
    expect(enqueued[1]).toMatchObject({
      entityType: 'draft',
      entityId: 'new-draft',
      action: 'update',
    });
    const queued = JSON.stringify(enqueued);
    expect(queued).not.toContain('source-local');
    expect(queued).not.toContain(SERVER);
    expect(queued).not.toContain('approval-token-secret');
    expect(queued).not.toContain('still.jpg');
  });

  it('one overlapping call creates one copy', async () => {
    let creates = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const guard = createDuplicateTapGuard();
    const run = (): Promise<'started' | 'ignored'> => runDuplication(guard, async () => {
      await duplicateQuoteOnDevice(
        { sourceQuoteId: 'source-local', contractorId: 'c' },
        {
          findQuote: async () => ({ id: 'source-local', status: 'approved', lineItems: [] }),
          findDraftJson: async () => null,
          write: async (work) => {
            creates += 1;
            await gate;
            await work();
          },
          createQuote: async (assign) => {
            assign(blankRecord());
            return { id: `copy-${creates}` };
          },
          createDraft: async (assign) => {
            assign({ quoteId: '', lineItemsJson: '[]' });
            return { id: 'draft' };
          },
          enqueue: async () => undefined,
          newId: newIds(),
        },
      );
    });
    const first = run();
    const second = run();
    expect(await second).toBe('ignored');
    release();
    expect(await first).toBe('started');
    expect(creates).toBe(1);
  });

  it('returns not_found without enqueueing when the quote is missing', async () => {
    const enqueue = jest.fn();
    const result = await duplicateQuoteOnDevice(
      { sourceQuoteId: 'missing', contractorId: 'c' },
      {
        findQuote: async () => null,
        findDraftJson: async () => '[]',
        write: async () => undefined,
        createQuote: async () => ({ id: 'nope' }),
        createDraft: async () => ({ id: 'nope' }),
        enqueue,
      },
    );
    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('Duplicate quote UI wiring', () => {
  const detail = fs.readFileSync(
    path.join(__dirname, '../../app/(app)/quote/[id].tsx'),
    'utf8',
  );
  const list = fs.readFileSync(
    path.join(__dirname, '../../app/(app)/quotes.tsx'),
    'utf8',
  );
  const row = fs.readFileSync(
    path.join(__dirname, '../../src/components/quotes/quote-row.tsx'),
    'utf8',
  );

  it('uses plain Duplicate copy and does not invent a price or phone', () => {
    expect(DUPLICATE_QUOTE_LABEL).toBe('Duplicate');
    expect(DUPLICATE_QUOTE_HINT).toBe(
      'Makes a new draft from this quote. This one stays as it is.',
    );
    expect(DUPLICATE_QUOTE_A11Y).toBe('Duplicate quote');
    expect(DUPLICATE_QUOTE_HINT).not.toMatch(/\$/);
    expect(DUPLICATE_QUOTE_HINT).not.toMatch(/\d/);
    expect(detail).toContain('DUPLICATE_QUOTE_LABEL');
    expect(detail).toContain('DUPLICATE_QUOTE_HINT');
    expect(row).toContain('DUPLICATE_QUOTE_LABEL');
  });

  it('opens the new draft from quote detail and the list row without a network call', () => {
    expect(detail).toContain('duplicateQuoteOnDevice');
    expect(detail).toContain('runDuplication');
    expect(detail).toContain('`/draft/${created.quoteId}`');
    expect(list).toContain('duplicateQuoteOnDevice');
    expect(list).toContain('runDuplication');
    expect(list).toContain('onDuplicate');
    expect(list).toContain('`/draft/${created.quoteId}`');
    expect(row).toContain('renderLeftActions');
    expect(row).toContain('onDuplicate');
    const moduleSrc = fs.readFileSync(path.join(__dirname, 'duplicate-quote.ts'), 'utf8');
    expect(moduleSrc).not.toMatch(/fetchQuote|apiClient|createQuoteOnServer/);
  });
});
