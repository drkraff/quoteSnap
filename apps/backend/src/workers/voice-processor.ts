import { PgBoss } from 'pg-boss';
import type { Job } from 'pg-boss';
import OpenAI from 'openai';
import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/completions/completions.js';
import pool, { query } from '../db/connection.js';
import { getFromR2, deleteFromR2 } from '../services/r2.js';
import type { VoiceJobData, AILineItem } from '../types/voice.js';
import { validateAndBuildLineItems } from './voice-validation.js';
import type { CatalogItemRow } from './voice-validation.js';

export const boss = new PgBoss(process.env['DATABASE_URL']!);

export async function initBoss(): Promise<void> {
  boss.on('error', (err: Error) => {
    console.error('pg-boss error:', err);
  });

  await boss.start();

  await boss.createQueue('voice-process');

  await boss.work<VoiceJobData>('voice-process', { localConcurrency: 2 }, processVoiceJobs);
}

async function processVoiceJobs(jobs: Job<VoiceJobData>[]): Promise<void> {
  await Promise.all(jobs.map(processVoiceJob));
}

async function processVoiceJob(job: Job<VoiceJobData>): Promise<void> {
  const { quoteId, contractorId, r2Key } = job.data;

  try {
    // a) Fetch audio from R2
    const audioBuffer = await getFromR2(r2Key);
    const audioFile = new File([new Uint8Array(audioBuffer)], 'audio.m4a', { type: 'audio/m4a' });

    // b) Whisper transcription.
    // Pin the language: Whisper's auto-detect mistakes short Hebrew clips for
    // Arabic and returns garbage. WHISPER_LANGUAGE overrides (default 'he');
    // set it to '' to fall back to auto-detect for mixed-language use.
    const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
    const whisperLanguage = process.env['WHISPER_LANGUAGE'] ?? 'he';
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: audioFile,
      ...(whisperLanguage ? { language: whisperLanguage } : {}),
    });
    const transcript = transcription.text;
    console.log(`[voice] transcript: "${transcript}"`);

    // c) Delete audio from R2 immediately (PII)
    await deleteFromR2(r2Key);

    // d) Fetch contractor's active catalog
    const catalogResult = await query(
      `SELECT id, name, unit FROM catalog_items WHERE contractor_id = $1 AND is_archived = false`,
      [contractorId]
    );
    const catalogItems = catalogResult.rows as Array<{ id: string; name: string; unit: string }>;

    // e) GPT-4o function calling
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a trade quoting assistant. Map the job description to items from this catalog only. Catalog: ${JSON.stringify(catalogItems.map(c => ({ id: c.id, name: c.name, unit: c.unit })))}. Return ONLY items that exist in this catalog. Use the exact catalog IDs. Assign a confidence score (0 to 1) indicating how well the transcript matches each item.`,
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
            description: 'Return the line items for this quote',
            parameters: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      catalogItemId: { type: 'string', description: 'ID from the provided catalog' },
                      quantity: { type: 'integer', minimum: 1 },
                      confidence: { type: 'number', minimum: 0, maximum: 1, description: 'How confident this item belongs in the quote' },
                    },
                    required: ['catalogItemId', 'quantity', 'confidence'],
                  },
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
    const parsed = JSON.parse(toolCall.function.arguments) as { items: AILineItem[] };
    const aiItems = parsed.items;

    // g) Validate catalog IDs
    const aiItemIds = aiItems.map(i => i.catalogItemId);
    const validationResult = await query(
      `SELECT id, name, unit_price_cents FROM catalog_items WHERE contractor_id = $1 AND id = ANY($2) AND is_archived = false`,
      [contractorId, aiItemIds]
    );
    const validCatalogItems = validationResult.rows as CatalogItemRow[];

    // h-i) Validate catalog IDs, build line items, calculate total
    const { lineItems, totalCents } = validateAndBuildLineItems(aiItems, validCatalogItems);

    // j) Write draft line items and update quote status in transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const item of lineItems) {
        await client.query(
          `INSERT INTO quote_line_items (quote_id, catalog_item_id, name, quantity, unit_price_cents, confidence) VALUES ($1, $2, $3, $4, $5, $6)`,
          [quoteId, item.catalogItemId, item.name, item.quantity, item.unitPriceCents, item.confidence]
        );
      }

      await client.query(
        `UPDATE quotes SET status = 'draft_local', total_cents = $1 WHERE id = $2`,
        [totalCents, quoteId]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(`voice-process job ${job.id} failed:`, err);

    // Update quote to failed state so polling endpoint can reflect this
    try {
      await query(
        `UPDATE quotes SET status = 'failed_send' WHERE id = $1`,
        [quoteId]
      );
    } catch (updateErr) {
      console.error('Failed to update quote status to failed_send:', updateErr);
    }

    throw err;
  }
}
