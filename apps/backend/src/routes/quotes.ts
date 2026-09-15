import { Router, Request, Response } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { authenticateToken } from "../middleware/auth.js";
import { query, withTransaction } from "../db/connection.js";
import { applyQuotePut, parseQuoteCreateBody, parseQuotePutBody } from "../quotes/quote-write.js";
import { applyQuoteArchivePatch } from "../quotes/archive.js";
import { filterUuidCatalogIds } from "../workers/voice-validation.js";
import { attachQuotePhoto } from "../quotes/photo-upload.js";
import {
  ATTACHMENT_COLUMNS,
  nestPhotos,
  type QuoteAttachmentRow,
} from "../quotes/photos.js";
import { getFromR2 } from "../services/r2.js";
import {
  LINE_ITEM_COLUMNS,
  QUOTE_COLUMNS,
  lineItemRowToResponse,
  listQuotesSql,
  nestLineItems,
  parseQuotesListArchivedQuery,
  quoteRowToResponse,
  type QuoteLineItemRow,
  type QuoteRow,
} from "./quotes-payload.js";

export const router = Router();

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

async function attachmentsForQuoteIds(
  contractorId: string,
  quoteIds: string[],
): Promise<QuoteAttachmentRow[]> {
  if (quoteIds.length === 0) {
    return [];
  }
  const result = await query(
    `SELECT ${ATTACHMENT_COLUMNS}
     FROM quote_attachments
     WHERE contractor_id = $1 AND quote_id = ANY($2::uuid[])
     ORDER BY created_at ASC`,
    [contractorId, quoteIds],
  );
  return result.rows as QuoteAttachmentRow[];
}

// GET / — list quotes for contractor sorted by recency, with line items + voiceJobId.
// Default is the active list; `?archived=true` is the Archived screen + hydrate pull.
router.get("/", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const archived = parseQuotesListArchivedQuery(req.query.archived);
    const result = await query(listQuotesSql(archived), [contractorId]);
    const quoteRows = result.rows as QuoteRow[];
    const quoteIds = filterUuidCatalogIds(quoteRows.map((row) => row.id));

    let lineItemRows: QuoteLineItemRow[] = [];
    if (quoteIds.length > 0) {
      const lineItemsResult = await query(
        `SELECT ${LINE_ITEM_COLUMNS}
         FROM quote_line_items
         WHERE quote_id = ANY($1::uuid[])
         ORDER BY created_at ASC`,
        [quoteIds]
      );
      lineItemRows = lineItemsResult.rows as QuoteLineItemRow[];
    }

    const quotes = nestPhotos(
      nestLineItems(quoteRows.map(quoteRowToResponse), lineItemRows),
      await attachmentsForQuoteIds(contractorId, quoteIds),
    );
    res.json({ quotes });
  } catch (err) {
    console.error("GET /quotes error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST / — create a new quote
router.post("/", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const parsed = parseQuoteCreateBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const result = await query(
      `INSERT INTO quotes (contractor_id, status, customer_phone, total_cents, private_note, client_sentence)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${QUOTE_COLUMNS}`,
      [
        contractorId,
        parsed.status,
        parsed.customerPhone,
        parsed.totalCents,
        parsed.privateNote,
        parsed.clientSentence,
      ]
    );

    const quote = quoteRowToResponse(result.rows[0] as QuoteRow);
    res.status(201).json({ quote });
  } catch (err) {
    console.error("POST /quotes error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /:id — get a single quote with its line items
router.get("/:id", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const { id } = req.params as { id: string };

    const quoteResult = await query(
      `SELECT ${QUOTE_COLUMNS}
       FROM quotes
       WHERE id = $1 AND contractor_id = $2`,
      [id, contractorId]
    );

    if (quoteResult.rows.length === 0) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }

    const lineItemsResult = await query(
      `SELECT ${LINE_ITEM_COLUMNS}
       FROM quote_line_items
       WHERE quote_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    const quote = quoteRowToResponse(quoteResult.rows[0] as QuoteRow);
    const lineItems = (lineItemsResult.rows as QuoteLineItemRow[]).map(lineItemRowToResponse);
    const photos = nestPhotos(
      [quote],
      await attachmentsForQuoteIds(contractorId, [id]),
    )[0]!.photos;

    res.json({ quote: { ...quote, photos }, lineItems });
  } catch (err) {
    console.error("GET /quotes/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /:id — draft metadata + line replace; frozen post-send statuses reject money writes (SYNC-06)
router.put("/:id", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const { id } = req.params as { id: string };
    const parsed = parseQuotePutBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const outcome = await withTransaction((txQuery) =>
      applyQuotePut(txQuery, { quoteId: id, contractorId, body: req.body }),
    );
    res.status(outcome.status).json(outcome.json);
  } catch (err) {
    console.error("PUT /quotes/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /:id/photos — private still upload (job evidence). Not a public URL.
router.post(
  "/:id/photos",
  authenticateToken,
  photoUpload.single("photo"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const contractorId = req.contractor!.contractorId;
      const { id } = req.params as { id: string };
      const body = req.body as {
        clientId?: unknown;
        roomId?: unknown;
        lineClientId?: unknown;
      };
      const outcome = await attachQuotePhoto(query, {
        quoteId: id,
        contractorId,
        file: req.file
          ? { buffer: req.file.buffer, mimetype: req.file.mimetype, size: req.file.size }
          : undefined,
        clientId: body.clientId,
        roomId: body.roomId,
        lineClientId: body.lineClientId,
        newAttachmentId: uuidv4(),
      });
      res.status(outcome.status).json(outcome.json);
    } catch (err) {
      console.error("POST /quotes/:id/photos error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /:id/photos/:photoId — authenticated byte stream. Cache-Control: private.
router.get(
  "/:id/photos/:photoId",
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const contractorId = req.contractor!.contractorId;
      const { id, photoId } = req.params as { id: string; photoId: string };
      const result = await query(
        `SELECT r2_key, mime FROM quote_attachments
         WHERE id = $1 AND quote_id = $2 AND contractor_id = $3`,
        [photoId, id, contractorId],
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: "Photo not found" });
        return;
      }
      const row = result.rows[0] as { r2_key: string; mime: string };
      const bytes = await getFromR2(row.r2_key);
      res.setHeader("Content-Type", row.mime);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(bytes);
    } catch (err) {
      console.error("GET /quotes/:id/photos/:photoId error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PATCH /:id/archive — soft-delete (or `{ archived: false }` undo). Does not change HIST-01 status.
router.patch("/:id/archive", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const contractorId = req.contractor!.contractorId;
    const { id } = req.params as { id: string };
    const outcome = await applyQuoteArchivePatch(query, {
      quoteId: id,
      contractorId,
      body: req.body,
    });
    res.status(outcome.status).json(outcome.json);
  } catch (err) {
    console.error("PATCH /quotes/:id/archive error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
