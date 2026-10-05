import { Router, Request, Response, type RequestHandler } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { authenticateToken } from "../middleware/auth.js";
import { logRequestFailure } from "../log/logger.js";
import { applyQuotePut, parseQuotePutBody } from "../quotes/quote-write.js";
import { createQuote } from "../quotes/create-quote.js";
import { sendQuoteForApproval } from "../quotes/send-quote.js";
import { resolveQuoteApprovalTtlMs, resolvePublicBaseUrl } from "../quotes/approval-token.js";
import { resolveSmsSender } from "../quotes/sms-sender.js";
import { applyQuoteArchivePatch } from "../quotes/archive.js";
import { filterUuidCatalogIds } from "../workers/voice-validation.js";
import { attachQuotePhoto } from "../quotes/photo-upload.js";
import {
  ATTACHMENT_COLUMNS,
  nestPhotos,
  type QuoteAttachmentRow,
} from "../quotes/photos.js";
import { getFromR2 as getFromR2Default } from "../services/r2.js";
import { isUuid } from "../uuid.js";
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

export type QuotesRouteQuery = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: unknown[] }>;

export type QuotesRouterDeps = {
  query: QuotesRouteQuery;
  withTransaction: <T>(fn: (query: QuotesRouteQuery) => Promise<T>) => Promise<T>;
  authenticate?: RequestHandler;
  getFromR2?: (key: string) => Promise<Buffer>;
};

function rejectUnlessUuid(res: Response, id: string, error: string): boolean {
  if (isUuid(id)) {
    return false;
  }
  res.status(404).json({ error });
  return true;
}

export function createQuotesRouter(deps: QuotesRouterDeps): Router {
  const runQuery = deps.query;
  const authenticate = deps.authenticate ?? authenticateToken;
  const readPhoto = deps.getFromR2 ?? getFromR2Default;
  const router = Router();

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
    const result = await runQuery(
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
  router.get("/", authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
      const contractorId = req.contractor!.contractorId;
      const archived = parseQuotesListArchivedQuery(req.query.archived);
      const result = await runQuery(listQuotesSql(archived), [contractorId]);
      const quoteRows = result.rows as QuoteRow[];
      const quoteIds = filterUuidCatalogIds(quoteRows.map((row) => row.id));

      let lineItemRows: QuoteLineItemRow[] = [];
      if (quoteIds.length > 0) {
        const lineItemsResult = await runQuery(
          `SELECT ${LINE_ITEM_COLUMNS}
           FROM quote_line_items
           WHERE quote_id = ANY($1::uuid[])
           ORDER BY created_at ASC`,
          [quoteIds],
        );
        lineItemRows = lineItemsResult.rows as QuoteLineItemRow[];
      }

      const quotes = nestPhotos(
        nestLineItems(quoteRows.map(quoteRowToResponse), lineItemRows),
        await attachmentsForQuoteIds(contractorId, quoteIds),
      );
      res.json({ quotes });
    } catch (err) {
      logRequestFailure(req, err, "GET /quotes error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST / — create a new quote, or return the existing row for this client key.
  router.post("/", authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
      const contractorId = req.contractor!.contractorId;
      const outcome = await createQuote(runQuery, { contractorId, body: req.body });
      res.status(outcome.status).json(outcome.json);
    } catch (err) {
      logRequestFailure(req, err, "POST /quotes error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /:id — get a single quote with its line items
  router.get("/:id", authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
      const contractorId = req.contractor!.contractorId;
      const { id } = req.params as { id: string };
      if (rejectUnlessUuid(res, id, "Quote not found")) {
        return;
      }

      const quoteResult = await runQuery(
        `SELECT ${QUOTE_COLUMNS}
         FROM quotes
         WHERE id = $1 AND contractor_id = $2`,
        [id, contractorId],
      );

      if (quoteResult.rows.length === 0) {
        res.status(404).json({ error: "Quote not found" });
        return;
      }

      const lineItemsResult = await runQuery(
        `SELECT ${LINE_ITEM_COLUMNS}
         FROM quote_line_items
         WHERE quote_id = $1
         ORDER BY created_at ASC`,
        [id],
      );

      const quote = quoteRowToResponse(quoteResult.rows[0] as QuoteRow);
      const lineItems = (lineItemsResult.rows as QuoteLineItemRow[]).map(lineItemRowToResponse);
      const photos = nestPhotos(
        [quote],
        await attachmentsForQuoteIds(contractorId, [id]),
      )[0]!.photos;

      res.json({ quote: { ...quote, photos }, lineItems });
    } catch (err) {
      logRequestFailure(req, err, "GET /quotes/:id error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /:id — draft metadata + line replace; frozen post-send statuses reject money writes (SYNC-06)
  router.put("/:id", authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
      const contractorId = req.contractor!.contractorId;
      const { id } = req.params as { id: string };
      if (rejectUnlessUuid(res, id, "Quote not found")) {
        return;
      }
      const parsed = parseQuotePutBody(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const outcome = await deps.withTransaction((txQuery) =>
        applyQuotePut(txQuery, { quoteId: id, contractorId, body: req.body }),
      );
      res.status(outcome.status).json(outcome.json);
    } catch (err) {
      logRequestFailure(req, err, "PUT /quotes/:id error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /:id/send — snapshot + approval token + dry-run SMS (no Twilio).
  router.post("/:id/send", authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      if (rejectUnlessUuid(res, id, "Quote not found")) {
        return;
      }
      const sender = resolveSmsSender(process.env["SMS_SENDER"]);
      if (!sender.ok) {
        res.status(501).json({ error: sender.error });
        return;
      }
      const contractorId = req.contractor!.contractorId;
      const outcome = await deps.withTransaction((txQuery) =>
        sendQuoteForApproval(txQuery, {
          quoteId: id,
          contractorId,
          body: req.body,
          sender: sender.sender,
          now: new Date(),
          publicBaseUrl: resolvePublicBaseUrl(process.env["PUBLIC_BASE_URL"]),
          ttlMs: resolveQuoteApprovalTtlMs(process.env["QUOTE_APPROVAL_TTL_MS"]),
        }),
      );
      res.status(outcome.status).json(outcome.json);
    } catch (err) {
      logRequestFailure(req, err, "POST /quotes/:id/send error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /:id/photos — private still upload (job evidence). Not a public URL.
  router.post(
    "/:id/photos",
    authenticate,
    photoUpload.single("photo"),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const contractorId = req.contractor!.contractorId;
        const { id } = req.params as { id: string };
        if (rejectUnlessUuid(res, id, "Quote not found")) {
          return;
        }
        const body = req.body as {
          clientId?: unknown;
          roomId?: unknown;
          lineClientId?: unknown;
        };
        const outcome = await attachQuotePhoto(runQuery, {
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
        logRequestFailure(req, err, "POST /quotes/:id/photos error");
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // GET /:id/photos/:photoId — authenticated byte stream. Cache-Control: private.
  router.get(
    "/:id/photos/:photoId",
    authenticate,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const contractorId = req.contractor!.contractorId;
        const { id, photoId } = req.params as { id: string; photoId: string };
        if (!isUuid(id) || !isUuid(photoId)) {
          res.status(404).json({ error: "Photo not found" });
          return;
        }
        const result = await runQuery(
          `SELECT r2_key, mime FROM quote_attachments
           WHERE id = $1 AND quote_id = $2 AND contractor_id = $3`,
          [photoId, id, contractorId],
        );
        if (result.rows.length === 0) {
          res.status(404).json({ error: "Photo not found" });
          return;
        }
        const row = result.rows[0] as { r2_key: string; mime: string };
        const bytes = await readPhoto(row.r2_key);
        res.setHeader("Content-Type", row.mime);
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.send(bytes);
      } catch (err) {
        logRequestFailure(req, err, "GET /quotes/:id/photos/:photoId error");
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // PATCH /:id/archive — soft-delete (or `{ archived: false }` undo). Does not change HIST-01 status.
  router.patch("/:id/archive", authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
      const contractorId = req.contractor!.contractorId;
      const { id } = req.params as { id: string };
      if (rejectUnlessUuid(res, id, "Quote not found")) {
        return;
      }
      const outcome = await applyQuoteArchivePatch(runQuery, {
        quoteId: id,
        contractorId,
        body: req.body,
      });
      res.status(outcome.status).json(outcome.json);
    } catch (err) {
      logRequestFailure(req, err, "PATCH /quotes/:id/archive error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
