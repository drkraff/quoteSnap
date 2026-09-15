import { PgBoss } from 'pg-boss';
import type { Job } from 'pg-boss';
import OpenAI, { toFile } from 'openai';
import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/completions/completions.js';
import pool, { query } from '../db/connection.js';
import { getFromR2, deleteFromR2 } from '../services/r2.js';
import type { VoiceJobData, AILineItem, VoiceExtractResult } from '../types/voice.js';
import {
  lookupExactRateCardCents,
  parseSignupMarkupPercent,
  parseSpokenHours,
} from './voice-price-attach.js';
import { filterUuidCatalogIds, validateAndBuildLineItemsAsync } from './voice-validation.js';
import type { CatalogItemRow, ValidatedLineItem } from './voice-validation.js';
import { resolveWhisperLanguage } from './whisper-language.js';
import { startAiProcessingReaper } from './ai-processing-reaper.js';
import {
  flagPartialMappingLines,
  markQuoteAiFailed,
  type AiFailureStage,
} from '../voice/ai-failure.js';
import { replaceVoiceQuoteLines } from '../voice/commit-voice-result.js';
import { joinAssumptionsToClientSentence } from '../voice/assumptions.js';
import { attachVoiceRooms } from '../quotes/rooms.js';
import { randomUUID } from 'node:crypto';

export const boss = new PgBoss(process.env['DATABASE_URL']!);

export async function initBoss(): Promise<void> {
  boss.on('error', (err: Error) => {
    console.error('pg-boss error:', err);
  });

  await boss.start();

  await boss.createQueue('voice-process');

  await boss.work<VoiceJobData>('voice-process', { localConcurrency: 2 }, processVoiceJobs);

  await startAiProcessingReaper(boss, query);
}

async function processVoiceJobs(jobs: Job<VoiceJobData>[]): Promise<void> {
  await Promise.all(jobs.map(processVoiceJob));
}

async function commitVoiceQuote(args: {
  quoteId: string;
  lineItems: Array<ValidatedLineItem & { roomId?: string | null }>;
  status: 'draft_local' | 'ai_failed';
  totalCents: number;
  failureStage: AiFailureStage | null;
  clientSentence?: string | null;
  roomsJson?: string | null;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await replaceVoiceQuoteLines(client, args);
    await client.query('COMMIT');
  } catch (txErr) {
    await client.query('ROLLBACK');
    throw txErr;
  } finally {
    client.release();
  }
}

async function processVoiceJob(job: Job<VoiceJobData>): Promise<void> {
  const { quoteId, contractorId, r2Key } = job.data;
  let stage: AiFailureStage = 'asr';
  let builtLineItems: (ValidatedLineItem & { roomId?: string | null })[] | null = null;
  let builtTotalCents = 0;
  let clientSentence: string | null = null;
  let builtRoomsJson: string | null = null;

  try {
    // a) Fetch audio from R2
    const audioBuffer = await getFromR2(r2Key);
    // Use the OpenAI SDK's toFile() rather than the global File constructor:
    // File is only a global on Node >= 20, and the Railway build may run on
    // Node 18, where `new File(...)` throws "File is not defined".
    const audioFile = await toFile(audioBuffer, 'audio.m4a', { type: 'audio/m4a' });

    // b) Whisper transcription.
    // Default English (US trades). WHISPER_LANGUAGE overrides (e.g. 'he');
    // set it to '' to fall back to auto-detect for mixed-language use.
    const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
    const whisperLanguage = resolveWhisperLanguage(process.env['WHISPER_LANGUAGE']);
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: audioFile,
      ...(whisperLanguage ? { language: whisperLanguage } : {}),
    });
    const transcript = transcription.text;
    // PII: do not log transcript text (CONTEXT invariant 11). Length only.
    console.log(
      `[voice] job ${job.id} quote ${quoteId} transcript chars=${transcript.length}`
    );

    stage = 'mapping';

    // Audio stays in R2 until GPT + DB write succeed so pg-boss retries can
    // re-fetch it. Deleted after commit (see below).

    // c) Fetch contractor's active catalog (IDs + names + units only — no prices)
    const catalogResult = await query(
      `SELECT id, name, unit FROM catalog_items WHERE contractor_id = $1 AND is_archived = false`,
      [contractorId]
    );
    const catalogItems = catalogResult.rows as Array<{ id: string; name: string; unit: string }>;

    const tradeResult = await query(
      `SELECT trade, hourly_rate_cents, markup_percent FROM contractors WHERE id = $1`,
      [contractorId]
    );
    const contractorRow = tradeResult.rows[0] as
      | {
          trade?: string | null;
          hourly_rate_cents?: number | null;
          markup_percent?: number | null;
        }
      | undefined;
    const contractorTrade =
      typeof contractorRow?.trade === 'string' ? contractorRow.trade : null;
    const hourlyRateCents =
      typeof contractorRow?.hourly_rate_cents === 'number' &&
      Number.isInteger(contractorRow.hourly_rate_cents) &&
      contractorRow.hourly_rate_cents > 0
        ? contractorRow.hourly_rate_cents
        : null;
    const markupPercent = parseSignupMarkupPercent(contractorRow?.markup_percent);

    // e) GPT-4o function calling — extract lines; never ask the model for a guessed price
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You extract quote line items from a trade contractor's spoken job description. Catalog (map to these IDs only when the spoken work clearly matches): ${JSON.stringify(catalogItems.map(c => ({ id: c.id, name: c.name, unit: c.unit })))}.
Rules:
- Return every distinct work item mentioned, even if it is not in the catalog.
- When it matches a catalog item, set catalogItemId to that exact UUID.
- When it does not match, omit catalogItemId. Still return name, quantity, and unit from speech.
- quantity is an integer >= 1. "14 linear feet" → quantity 14, unit foot.
- unit must be one of: each, hour, foot, sqft, job.
- spokenUnitPriceCents is integer cents ONLY if the contractor stated a sell/charge price (example: "eight fifty a foot" → 850, "I'll charge 250 each" → 25000). If they did not say a sell price, omit it or null. Do not put a supplier cost here.
- spokenMaterialCostCents is integer cents ONLY if the contractor stated (or typed in notes) a supplier/material cost, not the sell price (example: "pipe cost me forty bucks" → 4000, "fittings were 85 at the supplier" → 8500). Omit or null if they did not name a cost. NEVER guess. NEVER copy catalog. NEVER treat a sell/charge price as cost.
- spokenHours is integer hours for the job ONLY if they stated labor time (example: "call it two hours" → 2). Omit or null if they did not say hours. Do not guess duration.
- assumptions: client-facing scope sentences they said (what is not included). Example: "appliances not included". Empty array if they said none. Do not invent exclusions, private notes, or prices.
- room: the room or zone they named for that line (kitchen, bath, living room). Omit or null if they did not name a room. Never invent a room.
- NEVER invent a price, SKU, catalog ID, typical trade rate, or room. Never copy a price from the catalog; prices are attached later.
- Do not add catalog items they did not mention.`,
        },
        {
          role: 'user',
          content: transcript,
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'create_quote_items',
            description: 'Return extracted quote line items (catalog match optional). Do not invent prices.',
            parameters: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      catalogItemId: {
                        type: 'string',
                        description: 'Exact catalog UUID when mapped. Omit or empty if the line is adhoc.',
                      },
                      name: {
                        type: 'string',
                        description: 'Spoken line name. Required when catalogItemId is omitted.',
                      },
                      quantity: { type: 'integer', minimum: 1 },
                      unit: {
                        type: 'string',
                        enum: ['each', 'hour', 'foot', 'sqft', 'job'],
                        description: 'Spoken unit. Linear feet → foot. Square feet → sqft.',
                      },
                      spokenUnitPriceCents: {
                        type: ['integer', 'null'],
                        minimum: 1,
                        description:
                          'Integer cents the contractor said as a sell/charge price. Null/omit if they did not say a sell price. NEVER guess. NEVER put supplier cost here.',
                      },
                      spokenMaterialCostCents: {
                        type: ['integer', 'null'],
                        minimum: 1,
                        description:
                          'Integer cents the contractor said or typed as a supplier/material cost, not the sell price. Null/omit if they did not name a cost. NEVER guess.',
                      },
                      confidence: {
                        type: 'number',
                        minimum: 0,
                        maximum: 1,
                        description: 'How well the transcript supports this line',
                      },
                      room: {
                        type: ['string', 'null'],
                        description:
                          'Room or zone the contractor named for this line. Null/omit if they did not name a room. NEVER invent.',
                      },
                    },
                    required: ['name', 'quantity', 'unit', 'confidence'],
                  },
                },
                spokenHours: {
                  type: ['integer', 'null'],
                  minimum: 1,
                  description:
                    'Integer hours the contractor said for the job. Null/omit if they did not say hours. NEVER guess.',
                },
                assumptions: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    'Client-facing exclusions or assumptions the contractor said. Empty if none. Never invent. Never private notes or prices.',
                },
              },
              required: ['items'],
            },
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'create_quote_items' } },
    });

    // f) Parse response — narrow type to function tool call
    const rawToolCall = completion.choices[0]?.message.tool_calls?.[0];
    if (!rawToolCall) {
      throw new Error('GPT-4o returned no tool call');
    }
    // ChatCompletionMessageToolCall is ChatCompletionMessageFunctionToolCall | ChatCompletionMessageCustomToolCall
    // We always use function tool_choice so this will be a function tool call
    const toolCall = rawToolCall as ChatCompletionMessageFunctionToolCall;
    const parsed = JSON.parse(toolCall.function.arguments) as VoiceExtractResult;
    const aiItems: AILineItem[] = Array.isArray(parsed.items) ? parsed.items : [];
    const spokenHours = parseSpokenHours(parsed.spokenHours);
    clientSentence = joinAssumptionsToClientSentence(parsed.assumptions);

    // g) Validate catalog IDs — only UUID-shaped values may hit the uuid column.
    const aiItemIds = filterUuidCatalogIds(
      aiItems
        .map((i) => i.catalogItemId)
        .filter((id): id is string => typeof id === 'string'),
    );
    let validCatalogItems: CatalogItemRow[] = [];
    if (aiItemIds.length > 0) {
      const validationResult = await query(
        `SELECT id, name, unit, unit_price_cents FROM catalog_items WHERE contractor_id = $1 AND id = ANY($2::uuid[]) AND is_archived = false`,
        [contractorId, aiItemIds]
      );
      validCatalogItems = validationResult.rows as CatalogItemRow[];
    }

    // h-i) Build catalog + adhoc lines, then attach prices
    // (spoken sell → catalog SKU → exact rate-card → computed labor →
    //  computed material cost×markup → blank)
    const { lineItems, totalCents } = await validateAndBuildLineItemsAsync(
      aiItems,
      validCatalogItems,
      {
        trade: contractorTrade,
        hourlyRateCents,
        markupPercent,
        spokenHours,
        lookupRateCard: ({ name, unit, trade }) =>
          lookupExactRateCardCents(query, {
            contractorId,
            name,
            unit,
            trade,
          }),
      },
    );

    const attached = attachVoiceRooms(lineItems, () => randomUUID());
    builtLineItems = attached.lines;
    builtTotalCents = totalCents;
    builtRoomsJson =
      attached.rooms.length > 0 ? JSON.stringify(attached.rooms) : null;

    await commitVoiceQuote({
      quoteId,
      lineItems: attached.lines,
      status: 'draft_local',
      totalCents,
      failureStage: null,
      clientSentence,
      roomsJson: builtRoomsJson,
    });

    // PII: delete audio only after a durable success so retries still have the object.
    try {
      await deleteFromR2(r2Key);
    } catch (deleteErr) {
      console.error(`Failed to delete R2 audio ${r2Key} after successful processing:`, deleteErr);
    }
  } catch (err) {
    console.error(`voice-process job ${job.id} failed:`, err);

    // AI failure is not an SMS send failure (failed_send).
    try {
      if (stage === 'mapping' && builtLineItems && builtLineItems.length > 0) {
        const flagged = flagPartialMappingLines(builtLineItems);
        try {
          await commitVoiceQuote({
            quoteId,
            lineItems: flagged,
            status: 'ai_failed',
            totalCents: builtTotalCents,
            failureStage: 'mapping',
            clientSentence,
            roomsJson: builtRoomsJson,
          });
        } catch (partialErr) {
          console.error('Failed to persist partial mapping draft:', partialErr);
          await markQuoteAiFailed(query, quoteId, 'mapping');
        }
      } else {
        await markQuoteAiFailed(query, quoteId, stage);
      }
    } catch (updateErr) {
      console.error('Failed to update quote status to ai_failed:', updateErr);
    }

    throw err;
  }
}
