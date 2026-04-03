import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth.js';
import { uploadToR2 } from '../services/r2.js';
import { boss } from '../workers/voice-processor.js';
import { query } from '../db/connection.js';
import type { VoiceStatusResponse } from '../types/voice.js';

export const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

type QuoteRow = {
  id: string;
  contractor_id: string;
};

// POST /upload — upload audio, create ai_processing quote, send pg-boss job
router.post(
  '/upload',
  authenticateToken,
  upload.single('audio'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const contractorId = req.contractor!.contractorId;

      if (!req.file) {
        res.status(400).json({ error: 'Audio file required' });
        return;
      }

      const r2Key = `audio/${contractorId}/${uuidv4()}.m4a`;

      // Create quote with ai_processing status
      const quoteResult = await query(
        `INSERT INTO quotes (contractor_id, status, total_cents) VALUES ($1, 'ai_processing', 0) RETURNING id`,
        [contractorId]
      );
      const quoteId = (quoteResult.rows[0] as { id: string }).id;

      // Upload audio to R2
      await uploadToR2(r2Key, req.file.buffer, req.file.mimetype);

      // Send pg-boss job
      const jobId = await boss.send('voice-process', { quoteId, contractorId, r2Key });

      // Update quote with job ID
      await query(
        `UPDATE quotes SET voice_job_id = $1 WHERE id = $2`,
        [jobId, quoteId]
      );

      res.status(202).json({ jobId, quoteId });
    } catch (err) {
      console.error('POST /voice/upload error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /status/:jobId — poll voice processing status
router.get('/status/:jobId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const { jobId } = req.params as { jobId: string };

    // Verify the quote belongs to the requesting contractor
    const ownershipResult = await query(
      `SELECT id FROM quotes WHERE voice_job_id = $1 AND contractor_id = $2`,
      [jobId, contractorId]
    );

    if (ownershipResult.rows.length === 0) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const quoteRow = ownershipResult.rows[0] as QuoteRow;
    const quoteId = quoteRow.id;

    // Fetch job from pg-boss
    const job = await boss.getJobById('voice-process', jobId);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    let response: VoiceStatusResponse;

    if (job.state === 'completed') {
      response = { status: 'complete', draftId: quoteId };
    } else if (job.state === 'failed') {
      response = { status: 'failed', error: 'Processing failed' };
    } else {
      response = { status: 'processing' };
    }

    res.json(response);
  } catch (err) {
    console.error('GET /voice/status/:jobId error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /draft/:quoteId — return AI-generated line items with confidence scores
router.get('/draft/:quoteId', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const { quoteId } = req.params as { quoteId: string };

    // Verify quote exists and belongs to contractor
    const quoteResult = await query(
      `SELECT id, status, total_cents FROM quotes WHERE id = $1 AND contractor_id = $2`,
      [quoteId, contractorId]
    );

    if (quoteResult.rows.length === 0) {
      res.status(404).json({ error: 'Draft not found' });
      return;
    }

    const quoteRow = quoteResult.rows[0] as { id: string; status: string; total_cents: number };

    if (quoteRow.status === 'ai_processing') {
      res.status(404).json({ error: 'Draft not ready' });
      return;
    }

    // Fetch line items with confidence scores
    const lineItemsResult = await query(
      `SELECT qli.catalog_item_id AS "catalogItemId",
              qli.name,
              qli.quantity,
              qli.unit_price_cents AS "unitPriceCents",
              qli.confidence
       FROM quote_line_items qli
       WHERE qli.quote_id = $1
       ORDER BY qli.created_at ASC`,
      [quoteId]
    );

    type LineItemRow = {
      catalogItemId: string | null;
      name: string;
      quantity: number;
      unitPriceCents: number;
      confidence: number | null;
    };

    const lineItems = (lineItemsResult.rows as LineItemRow[]).map((row) => ({
      catalogItemId: row.catalogItemId ?? '',
      name: row.name,
      quantity: row.quantity,
      unitPriceCents: row.unitPriceCents,
      confidence: row.confidence ?? undefined,
    }));

    res.json({
      quoteId,
      totalCents: quoteRow.total_cents,
      lineItems,
    });
  } catch (err) {
    console.error('GET /voice/draft/:quoteId error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
