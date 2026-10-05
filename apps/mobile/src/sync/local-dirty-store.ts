import { database } from '../db';
import type { Quote } from '../db/models/quote';
import { enqueue, type SyncEnqueueParams } from './sync-queue';
import {
  clearDirtyField,
  durableDirtyResumePlan,
  isDirtyField,
  localDirtyWithout,
  parseLocalDirty,
  type DirtyField,
  type DurableResumeAction,
} from './local-dirty';

export async function clearDurableDirtyField(
  quoteId: string,
  field: DirtyField,
  token: number,
): Promise<void> {
  try {
    const quote = await database.get<Quote>('quotes').find(quoteId);
    await database.write(async () => {
      await quote.update((record) => {
        record.localDirty = localDirtyWithout(record.localDirty, field, token);
      });
    });
  } catch {
    // The row may already be gone. Memory still clears only on a token match.
  }
  clearDirtyField(quoteId, field, token);
}

export async function resumeDurableDirtyEdits(input: {
  quoteId: string;
  localDirty: string | null | undefined;
  customerPhone: string | null;
  privateNote: string | null;
  clientSentence: string | null;
  roomsJson: string | null;
  draftId: string | null;
  lineItemsJson: string | null;
  totalCents: number;
  frozen: boolean;
  enqueueEdit?: (params: SyncEnqueueParams) => Promise<void>;
  clearField?: (quoteId: string, field: DirtyField, token: number) => Promise<void>;
  readToken?: (field: DirtyField) => number | undefined;
}): Promise<void> {
  const enqueueEdit = input.enqueueEdit ?? enqueue;
  const clearField = input.clearField ?? clearDurableDirtyField;
  const plan = durableDirtyResumePlan(input);
  for (const action of plan) {
    if (isDirtyField(input.quoteId, action.field)) continue;
    const tokenNow = input.readToken
      ? input.readToken(action.field)
      : parseLocalDirty(input.localDirty)[action.field];
    if (tokenNow !== action.token) continue;
    await enqueueEdit(enqueueParamsForResume(input.quoteId, action));
    await clearField(input.quoteId, action.field, action.token);
  }
}

export function enqueueParamsForResume(
  quoteId: string,
  action: DurableResumeAction,
): SyncEnqueueParams {
  if (action.field === 'lines') {
    return {
      entityType: 'draft',
      entityId: action.draftId,
      action: 'update',
      payload: action.payload,
    };
  }
  return {
    entityType: 'quote',
    entityId: quoteId,
    action: 'update',
    payload: action.payload,
  };
}
