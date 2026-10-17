/**
 * Postgres 16 proof of migration 031.
 * A sent quote cannot return to draft or voice, and its lines are write-once.
 * Creating, editing, sending, and duplicating a sent quote into a new draft stay allowed.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import jwt from "jsonwebtoken";
import { query, withTransaction } from "../db/connection.js";
import pool from "../db/connection.js";
import { runMigrations } from "../db/migrate.js";
import { createQuotesRouter } from "../routes/quotes-router.js";
import { errorHandler, requestIdMiddleware } from "../log/http.js";
import {
  QUOTE_STATUS_LOCKED_ERROR,
  quoteLifecycleConflict,
} from "../quotes/lifecycle-error.js";
import { QUOTE_MONEY_FROZEN_ERROR } from "../quotes/statuses.js";
import { replaceVoiceQuoteLines } from "../voice/commit-voice-result.js";
import { resolveVoiceUploadQuote } from "../voice/upload-quote.js";

if (!process.env["JWT_ACCESS_SECRET"] || process.env["JWT_ACCESS_SECRET"].length < 32) {
  process.env["JWT_ACCESS_SECRET"] = "integration-test-jwt-secret-32-chars-min";
}
process.env["SMS_SENDER"] = "dry-run";

type QuoteBody = {
  quote: { id: string; status: string; totalCents: number; sentAt: string | null };
  lineItems: { name: string; quantity: number; unitPriceCents: number }[];
};

function bearer(contractorId: string): string {
  const token = jwt.sign(
    { contractorId, email: null, phone: null },
    process.env["JWT_ACCESS_SECRET"]!,
    { algorithm: "HS256", expiresIn: "15m" },
  );
  return `Bearer ${token}`;
}

async function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  };
}

function quotesApp(): express.Express {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use("/quotes", createQuotesRouter({ query, withTransaction }));
  app.use(errorHandler);
  return app;
}

async function insertContractor(): Promise<string> {
  const result = await query(
    `INSERT INTO contractors (email, password_hash, display_name, trade)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [`life-${randomUUID()}@integration.test`, "integration-hash", "Sam", "plumbing"],
  );
  return (result.rows[0] as { id: string }).id;
}

async function expectTrigger(
  run: () => Promise<unknown>,
  fragment: string,
  apiError: string,
): Promise<void> {
  try {
    await run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assert.match(message, new RegExp(fragment));
    assert.equal(quoteLifecycleConflict(err), apiError);
    return;
  }
  assert.fail(`expected trigger rejection: ${fragment}`);
}

async function probeTrigger(
  sql: string,
  params: unknown[],
): Promise<{ status: number; error: string | null }> {
  let status = 0;
  let error: string | null = null;
  const app = express();
  app.put("/probe", async (_req, res) => {
    try {
      await query(sql, params);
      res.status(200).json({ ok: true });
    } catch (err) {
      const locked = quoteLifecycleConflict(err);
      if (locked) {
        res.status(409).json({ error: locked });
        return;
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });
  const server = await listen(app);
  try {
    const response = await fetch(`${server.url}/probe`, { method: "PUT" });
    status = response.status;
    const json = await response.json() as { error?: string };
    error = json.error ?? null;
  } finally {
    await server.close();
  }
  return { status, error };
}

describe("quote lifecycle guard", { concurrency: false }, () => {
  before(async () => {
    await runMigrations();
  });

  after(async () => {
    await pool.end();
  });

  it("creates, edits, sends, and duplicates a sent quote into a new draft", async () => {
    const contractorId = await insertContractor();
    const app = quotesApp();
    const server = await listen(app);
    const headers = {
      authorization: bearer(contractorId),
      "content-type": "application/json",
    };
    const clientKey = `draft-${randomUUID()}`;
    try {
      const created = await fetch(`${server.url}/quotes`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          clientKey,
          status: "draft_local",
          totalCents: 0,
          customerName: "Jordan Lee",
        }),
      });
      assert.equal(created.status, 201);
      const createdJson = await created.json() as { quote: { id: string; status: string } };
      const quoteId = createdJson.quote.id;
      assert.equal(createdJson.quote.status, "draft_local");

      const edited = await fetch(`${server.url}/quotes/${quoteId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          lineItems: [{
            name: "Faucet",
            quantity: 1,
            unitPriceCents: 12000,
            unit: "each",
            catalogItemId: null,
          }],
        }),
      });
      assert.equal(edited.status, 200, JSON.stringify(await edited.clone().json()));

      const revised = await fetch(`${server.url}/quotes/${quoteId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          lineItems: [{
            name: "Faucet",
            quantity: 2,
            unitPriceCents: 12500,
            unit: "each",
            catalogItemId: null,
          }],
        }),
      });
      assert.equal(revised.status, 200, JSON.stringify(await revised.clone().json()));

      const sent = await fetch(`${server.url}/quotes/${quoteId}/send`, {
        method: "POST",
        headers,
        body: JSON.stringify({ customerPhone: "5551234567" }),
      });
      const sentBody: unknown = await sent.json();
      assert.equal(sent.status, 201, JSON.stringify(sentBody));

      const owned = await fetch(`${server.url}/quotes/${quoteId}`, { headers });
      assert.equal(owned.status, 200);
      const ownedJson = await owned.json() as QuoteBody;
      assert.equal(ownedJson.quote.status, "sent");
      assert.equal(typeof ownedJson.quote.sentAt, "string");
      assert.equal(ownedJson.quote.totalCents, 25000);
      assert.equal(ownedJson.lineItems.length, 1);
      assert.equal(ownedJson.lineItems[0]?.name, "Faucet");
      assert.equal(ownedJson.lineItems[0]?.quantity, 2);
      assert.equal(ownedJson.lineItems[0]?.unitPriceCents, 12500);

      const thaw = await fetch(`${server.url}/quotes/${quoteId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ status: "draft_local" }),
      });
      assert.equal(thaw.status, 409);
      assert.deepEqual(await thaw.json(), { error: "Quote cannot be updated in its current status" });

      const rewrite = await fetch(`${server.url}/quotes/${quoteId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          lineItems: [{
            name: "Changed",
            quantity: 1,
            unitPriceCents: 100,
            catalogItemId: null,
          }],
        }),
      });
      assert.equal(rewrite.status, 409);
      assert.deepEqual(await rewrite.json(), { error: QUOTE_MONEY_FROZEN_ERROR });

      const voice = await resolveVoiceUploadQuote(query, contractorId, quoteId);
      assert.deepEqual(voice, { ok: false, status: 409, error: QUOTE_STATUS_LOCKED_ERROR });
      const voiceKey = await resolveVoiceUploadQuote(query, contractorId, null, clientKey);
      assert.deepEqual(voiceKey, { ok: false, status: 409, error: QUOTE_STATUS_LOCKED_ERROR });
      const stillSent = await query(`SELECT status FROM quotes WHERE id = $1`, [quoteId]);
      assert.equal((stillSent.rows[0] as { status: string }).status, "sent");

      const copy = await fetch(`${server.url}/quotes`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          clientKey: `copy-${randomUUID()}`,
          status: "draft_local",
          totalCents: 0,
          customerName: "Jordan Lee",
        }),
      });
      assert.equal(copy.status, 201);
      const copyJson = await copy.json() as { quote: { id: string; status: string; sentAt: string | null } };
      assert.notEqual(copyJson.quote.id, quoteId);
      assert.equal(copyJson.quote.status, "draft_local");
      assert.equal(copyJson.quote.sentAt, null);

      const copiedLines = await fetch(`${server.url}/quotes/${copyJson.quote.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          lineItems: [{
            name: "Faucet",
            quantity: 2,
            unitPriceCents: 12500,
            unit: "each",
            catalogItemId: null,
          }],
        }),
      });
      assert.equal(copiedLines.status, 200, JSON.stringify(await copiedLines.clone().json()));

      const copyEdited = await fetch(`${server.url}/quotes/${copyJson.quote.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          lineItems: [{
            name: "Faucet",
            quantity: 3,
            unitPriceCents: 13000,
            unit: "each",
            catalogItemId: null,
          }],
        }),
      });
      assert.equal(copyEdited.status, 200, JSON.stringify(await copyEdited.clone().json()));

      const original = await fetch(`${server.url}/quotes/${quoteId}`, { headers });
      const originalJson = await original.json() as QuoteBody;
      assert.equal(originalJson.quote.status, "sent");
      assert.equal(originalJson.lineItems.length, 1);
      assert.equal(originalJson.lineItems[0]?.quantity, 2);
      assert.equal(originalJson.lineItems[0]?.unitPriceCents, 12500);

      const duplicate = await fetch(`${server.url}/quotes/${copyJson.quote.id}`, { headers });
      const duplicateJson = await duplicate.json() as QuoteBody;
      assert.equal(duplicateJson.quote.status, "draft_local");
      assert.equal(duplicateJson.lineItems[0]?.quantity, 3);
      assert.equal(duplicateJson.lineItems[0]?.unitPriceCents, 13000);

      const archived = await fetch(`${server.url}/quotes/${quoteId}/archive`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ archived: true }),
      });
      assert.equal(archived.status, 200, JSON.stringify(await archived.clone().json()));
      const archivedRow = await query(`SELECT status, is_archived FROM quotes WHERE id = $1`, [quoteId]);
      const stillRow = archivedRow.rows[0] as { status: string; is_archived: boolean };
      assert.equal(stillRow.status, "sent");
      assert.equal(stillRow.is_archived, true);
    } finally {
      await server.close();
    }
  });

  it("rejects #119 and #47 writes and still allows forward quote moves", async () => {
    const contractorId = await insertContractor();
    const sent = await query(
      `INSERT INTO quotes (contractor_id, status, total_cents, customer_phone, voice_job_id, client_key)
       VALUES ($1, 'draft_local', 25000, '5551234567', 'job-late', $2)
       RETURNING id`,
      [contractorId, `sent-${randomUUID()}`],
    );
    const sentId = (sent.rows[0] as { id: string }).id;
    await query(
      `INSERT INTO quote_line_items (quote_id, name, quantity, unit_price_cents)
       VALUES ($1, 'Faucet', 1, 25000)`,
      [sentId],
    );
    await query(
      `UPDATE quotes SET status = 'sent', sent_at = NOW() WHERE id = $1`,
      [sentId],
    );

    const thawVoice = await probeTrigger(
      `UPDATE quotes SET status = 'ai_processing' WHERE id = $1`,
      [sentId],
    );
    assert.deepEqual(thawVoice, { status: 409, error: QUOTE_STATUS_LOCKED_ERROR });

    const thawDraft = await probeTrigger(
      `UPDATE quotes SET status = 'draft_local' WHERE id = $1`,
      [sentId],
    );
    assert.deepEqual(thawDraft, { status: 409, error: QUOTE_STATUS_LOCKED_ERROR });

    await expectTrigger(
      () => query(`UPDATE quotes SET status = 'draft_queued' WHERE id = $1`, [sentId]),
      "frozen quote cannot return to draft or voice",
      QUOTE_STATUS_LOCKED_ERROR,
    );
    await expectTrigger(
      () => query(`UPDATE quotes SET status = 'ai_failed' WHERE id = $1`, [sentId]),
      "frozen quote cannot return to draft or voice",
      QUOTE_STATUS_LOCKED_ERROR,
    );

    const deleteLines = await probeTrigger(
      `DELETE FROM quote_line_items WHERE quote_id = $1`,
      [sentId],
    );
    assert.deepEqual(deleteLines, { status: 409, error: QUOTE_MONEY_FROZEN_ERROR });
    await expectTrigger(
      () => query(
        `INSERT INTO quote_line_items (quote_id, name, quantity, unit_price_cents)
         VALUES ($1, 'Extra', 1, 100)`,
        [sentId],
      ),
      "quote line items are write-once after send",
      QUOTE_MONEY_FROZEN_ERROR,
    );
    await expectTrigger(
      () => query(
        `UPDATE quote_line_items SET unit_price_cents = 1 WHERE quote_id = $1`,
        [sentId],
      ),
      "quote line items are write-once after send",
      QUOTE_MONEY_FROZEN_ERROR,
    );

    const unchanged = await query(
      `SELECT status, name, unit_price_cents
       FROM quotes q
       JOIN quote_line_items li ON li.quote_id = q.id
       WHERE q.id = $1`,
      [sentId],
    );
    const row = unchanged.rows[0] as { status: string; name: string; unit_price_cents: number };
    assert.equal(row.status, "sent");
    assert.equal(row.name, "Faucet");
    assert.equal(Number(row.unit_price_cents), 25000);

    const voice = await resolveVoiceUploadQuote(query, contractorId, sentId);
    assert.deepEqual(voice, { ok: false, status: 409, error: QUOTE_STATUS_LOCKED_ERROR });
    const discarded = await withTransaction(async (tx) => replaceVoiceQuoteLines(
      { query: tx },
      {
        quoteId: sentId,
        jobId: "job-late",
        lineItems: [{
          catalogItemId: null,
          name: "Late job",
          quantity: 1,
          unit: "each",
          unitPriceCents: 1,
          confidence: 0.9,
        }],
        status: "draft_local",
        totalCents: 1,
        failureStage: null,
      },
    ));
    assert.equal(discarded, false);
    const afterJob = await query(`SELECT status FROM quotes WHERE id = $1`, [sentId]);
    assert.equal((afterJob.rows[0] as { status: string }).status, "sent");

    await query(`UPDATE quotes SET status = 'approved', approved_at = NOW() WHERE id = $1`, [sentId]);
    await query(`UPDATE quotes SET private_note = 'brand stays' WHERE id = $1`, [sentId]);
    const approved = await query(
      `SELECT status, private_note FROM quotes WHERE id = $1`,
      [sentId],
    );
    const approvedRow = approved.rows[0] as { status: string; private_note: string };
    assert.equal(approvedRow.status, "approved");
    assert.equal(approvedRow.private_note, "brand stays");
    await expectTrigger(
      () => query(`UPDATE quotes SET status = 'draft_local' WHERE id = $1`, [sentId]),
      "frozen quote cannot return to draft or voice",
      QUOTE_STATUS_LOCKED_ERROR,
    );

    const otherSent = await query(
      `INSERT INTO quotes (contractor_id, status, total_cents)
       VALUES ($1, 'draft_local', 100)
       RETURNING id`,
      [contractorId],
    );
    const otherId = (otherSent.rows[0] as { id: string }).id;
    await query(
      `INSERT INTO quote_line_items (quote_id, name, quantity, unit_price_cents)
       VALUES ($1, 'Valve', 1, 100)`,
      [otherId],
    );
    await query(`UPDATE quotes SET status = 'sent', sent_at = NOW() WHERE id = $1`, [otherId]);
    await query(`UPDATE quotes SET status = 'declined', declined_at = NOW() WHERE id = $1`, [otherId]);
    const declined = await query(`SELECT status FROM quotes WHERE id = $1`, [otherId]);
    assert.equal((declined.rows[0] as { status: string }).status, "declined");
    await expectTrigger(
      () => query(
        `DELETE FROM quote_line_items WHERE quote_id = $1`,
        [otherId],
      ),
      "quote line items are write-once after send",
      QUOTE_MONEY_FROZEN_ERROR,
    );

    const expiring = await query(
      `INSERT INTO quotes (contractor_id, status, total_cents, sent_at)
       VALUES ($1, 'sent', 100, NOW())
       RETURNING id`,
      [contractorId],
    );
    const expiringId = (expiring.rows[0] as { id: string }).id;
    await query(`UPDATE quotes SET status = 'expired' WHERE id = $1 AND status = 'sent'`, [expiringId]);
    const expired = await query(`SELECT status FROM quotes WHERE id = $1`, [expiringId]);
    assert.equal((expired.rows[0] as { status: string }).status, "expired");
    await expectTrigger(
      () => query(
        `INSERT INTO quote_line_items (quote_id, name, quantity, unit_price_cents)
         VALUES ($1, 'Late', 1, 100)`,
        [expiringId],
      ),
      "quote line items are write-once after send",
      QUOTE_MONEY_FROZEN_ERROR,
    );

    const voiceQuote = await query(
      `INSERT INTO quotes (contractor_id, status, total_cents, voice_job_id)
       VALUES ($1, 'ai_processing', 0, 'job-current')
       RETURNING id`,
      [contractorId],
    );
    const voiceId = (voiceQuote.rows[0] as { id: string }).id;
    const committed = await withTransaction(async (tx) => replaceVoiceQuoteLines(
      { query: tx },
      {
        quoteId: voiceId,
        jobId: "job-current",
        lineItems: [{
          catalogItemId: null,
          name: "Labor",
          quantity: 1.5,
          unit: "hour",
          unitPriceCents: 7500,
          confidence: 0.9,
        }],
        status: "draft_local",
        totalCents: 11250,
        failureStage: null,
      },
    ));
    assert.equal(committed, true);
    const voiced = await query(
      `SELECT q.status, li.name, li.quantity
       FROM quotes q
       JOIN quote_line_items li ON li.quote_id = q.id
       WHERE q.id = $1`,
      [voiceId],
    );
    const voicedRow = voiced.rows[0] as { status: string; name: string; quantity: string | number };
    assert.equal(voicedRow.status, "draft_local");
    assert.equal(voicedRow.name, "Labor");
    assert.equal(Number(voicedRow.quantity), 1.5);

    await query(
      `UPDATE quotes SET status = 'ai_failed', ai_failure_stage = 'timeout'
       WHERE id = $1 AND status = 'draft_local'`,
      [voiceId],
    );
    await query(
      `UPDATE quotes SET status = 'ai_processing', ai_failure_stage = NULL
       WHERE id = $1 AND status = 'ai_failed' AND voice_job_id = 'job-current'`,
      [voiceId],
    );
    const reopened = await query(`SELECT status FROM quotes WHERE id = $1`, [voiceId]);
    assert.equal((reopened.rows[0] as { status: string }).status, "ai_processing");

    await query(`DELETE FROM quotes WHERE id = $1`, [sentId]);
    const gone = await query(
      `SELECT COUNT(*)::int AS n FROM quote_line_items WHERE quote_id = $1`,
      [sentId],
    );
    assert.equal((gone.rows[0] as { n: number }).n, 0);

    await query(`DELETE FROM contractors WHERE id = $1`, [contractorId]);
    const contractorGone = await query(`SELECT id FROM quotes WHERE contractor_id = $1`, [contractorId]);
    assert.equal(contractorGone.rows.length, 0);
  });

  it("writes lines before status so marking a draft sent still saves its lines", async () => {
    const contractorId = await insertContractor();
    const draft = await query(
      `INSERT INTO quotes (contractor_id, status, total_cents)
       VALUES ($1, 'draft_local', 0)
       RETURNING id`,
      [contractorId],
    );
    const draftId = (draft.rows[0] as { id: string }).id;
    await query(
      `INSERT INTO quote_line_items (quote_id, name, quantity, unit_price_cents)
       VALUES ($1, 'Old', 1, 500)`,
      [draftId],
    );

    await expectTrigger(
      () => withTransaction(async (tx) => {
        await tx(`UPDATE quotes SET status = 'sent', sent_at = NOW() WHERE id = $1`, [draftId]);
        await tx(`DELETE FROM quote_line_items WHERE quote_id = $1`, [draftId]);
      }),
      "quote line items are write-once after send",
      QUOTE_MONEY_FROZEN_ERROR,
    );
    const rolledBack = await query(`SELECT status FROM quotes WHERE id = $1`, [draftId]);
    assert.equal((rolledBack.rows[0] as { status: string }).status, "draft_local");

    const app = quotesApp();
    const server = await listen(app);
    const headers = {
      authorization: bearer(contractorId),
      "content-type": "application/json",
    };
    try {
      const marked = await fetch(`${server.url}/quotes/${draftId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          status: "sent",
          lineItems: [{
            name: "Replace outlet",
            quantity: 1,
            unitPriceCents: 25000,
            unit: "each",
            catalogItemId: null,
          }],
        }),
      });
      const markedBody: unknown = await marked.json();
      assert.equal(marked.status, 200, JSON.stringify(markedBody));
    } finally {
      await server.close();
    }

    const saved = await query(
      `SELECT q.status, li.name, li.unit_price_cents
       FROM quotes q
       JOIN quote_line_items li ON li.quote_id = q.id
       WHERE q.id = $1`,
      [draftId],
    );
    assert.equal(saved.rows.length, 1);
    const savedRow = saved.rows[0] as { status: string; name: string; unit_price_cents: number };
    assert.equal(savedRow.status, "sent");
    assert.equal(savedRow.name, "Replace outlet");
    assert.equal(Number(savedRow.unit_price_cents), 25000);

    const bogus = await probeTrigger(
      `UPDATE quotes SET status = 'not-a-status' WHERE id = $1`,
      [draftId],
    );
    assert.equal(bogus.status, 500);
    assert.equal(bogus.error, "Internal server error");
  });
});
