import { Q } from '@nozbe/watermelondb';
import { database } from '../db';
import { ResumeCheckpoint } from '../db/models/resume-checkpoint';
import {
  parseResumeCheckpointRow,
  type ResumeCheckpointFields,
  type ResumeKind,
} from './resume-checkpoint';

export async function loadResumeCheckpoint(
  contractorId: string,
): Promise<ResumeCheckpointFields | null> {
  const id = contractorId.trim();
  if (!id) return null;
  const rows = await database
    .get<ResumeCheckpoint>('resume_checkpoints')
    .query(Q.where('contractor_id', id), Q.sortBy('updated_at', 'desc'))
    .fetch();
  const row = rows[0];
  if (!row) return null;
  return parseResumeCheckpointRow({
    kind: row.kind,
    quoteId: row.quoteId,
    audioUri: row.audioUri,
  });
}

export async function upsertResumeCheckpoint(input: {
  contractorId: string;
  kind: ResumeKind;
  quoteId?: string | null;
  audioUri?: string | null;
}): Promise<void> {
  const contractorId = input.contractorId.trim();
  if (!contractorId) return;
  const quoteId = input.quoteId?.trim() ? input.quoteId.trim() : null;
  const audioUri = input.audioUri?.trim() ? input.audioUri.trim() : null;
  const collection = database.get<ResumeCheckpoint>('resume_checkpoints');
  await database.write(async () => {
    const existing = await collection.query(Q.where('contractor_id', contractorId)).fetch();
    for (const row of existing) {
      await row.destroyPermanently();
    }
    await collection.create((record) => {
      record.contractorId = contractorId;
      record.kind = input.kind;
      record.quoteId = quoteId;
      record.audioUri = audioUri;
      record.updatedAt = new Date();
    });
  });
}

export async function clearResumeCheckpoints(
  contractorId: string,
  kind?: ResumeKind,
): Promise<void> {
  const id = contractorId.trim();
  if (!id) return;
  const collection = database.get<ResumeCheckpoint>('resume_checkpoints');
  await database.write(async () => {
    const existing = await collection.query(Q.where('contractor_id', id)).fetch();
    for (const row of existing) {
      if (kind && row.kind !== kind) continue;
      await row.destroyPermanently();
    }
  });
}
