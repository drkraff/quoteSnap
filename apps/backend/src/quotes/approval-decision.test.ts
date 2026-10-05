import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { createApprovalRouter } from "../routes/approval-router.js";
import { createApprovalLimiter } from "./approval-security.js";
import {
  MARK_QUOTE_APPROVED_SQL,
  MARK_QUOTE_DECLINED_SQL,
  SELECT_APPROVAL_FOR_UPDATE_SQL,
} from "./approval-page.js";
import { generateApprovalToken, hashApprovalToken } from "./approval-token.js";
import type { SnapshotQueryFn } from "./quote-snapshot.js";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-04T23:04:00.000Z");

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

type QuoteState = {
  status: string;
  approved_at: Date | null;
  declined_at: Date | null;
};

/**
 * In-memory stand-in for Postgres `SELECT … FOR UPDATE` on the quote row.
 * The second transaction blocks until the holder commits or rolls back, then
 * reads the committed status. CI has no live Postgres; this is the harness.
 */
class LockedApprovalStore {
  committed: QuoteState = { status: "sent", approved_at: null, declined_at: null };
  waiters = 0;
  marks: string[] = [];
  onWaiter: (() => void) | null = null;
  onFirstLock: (() => void) | null = null;
  continueFirst: Promise<void> = Promise.resolve();
  failNextMark = false;
  private txSeq = 0;
  private holder: { txId: number; wait: Promise<void>; release: () => void } | null = null;
  private working = new Map<number, QuoteState>();
  private paused = false;
  private readonly tokenHash: string;
  private readonly payload: unknown;

  constructor(tokenHash: string, payload: unknown) {
    this.tokenHash = tokenHash;
    this.payload = payload;
  }

  async transaction<T>(fn: (query: SnapshotQueryFn) => Promise<T>): Promise<T> {
    const txId = ++this.txSeq;
    try {
      const result = await fn((sql, params) => this.query(txId, sql, params));
      this.commit(txId);
      return result;
    } catch (err) {
      this.rollback(txId);
      throw err;
    }
  }

  private row(state: QuoteState): Record<string, unknown> {
    return {
      expires_at: new Date("2026-10-07T23:04:00.000Z"),
      quote_id: QUOTE_ID,
      payload: this.payload,
      contractor_display_name: "Sam",
      contractor_trade: "plumbing",
      status: state.status,
      approved_at: state.approved_at,
      declined_at: state.declined_at,
    };
  }

  private async query(txId: number, sql: string, params?: unknown[]) {
    if (sql === SELECT_APPROVAL_FOR_UPDATE_SQL || sql.includes("FOR UPDATE")) {
      if (params?.[0] !== this.tokenHash) return { rows: [] };
      const state = await this.lock(txId);
      return { rows: [this.row(state)] };
    }
    if (sql === MARK_QUOTE_APPROVED_SQL || sql === MARK_QUOTE_DECLINED_SQL) {
      return this.mark(txId, sql, params?.[1] as Date);
    }
    if (sql.includes("FROM quote_approval_tokens")) {
      const state = this.working.get(txId) ?? this.committed;
      if (params?.[0] !== this.tokenHash) return { rows: [] };
      return { rows: [this.row(state)] };
    }
    throw new Error(`unexpected sql: ${sql}`);
  }

  private async lock(txId: number): Promise<QuoteState> {
    while (this.holder && this.holder.txId !== txId) {
      this.waiters += 1;
      this.onWaiter?.();
      const wait = this.holder.wait;
      try {
        await wait;
      } finally {
        this.waiters -= 1;
      }
    }
    if (!this.holder) {
      let release!: () => void;
      const wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      this.holder = { txId, wait, release };
      this.working.set(txId, { ...this.committed });
      if (!this.paused) {
        this.paused = true;
        this.onFirstLock?.();
        await this.continueFirst;
      }
    }
    return this.working.get(txId)!;
  }

  private mark(txId: number, sql: string, at: Date): { rows: unknown[] } {
    const state = this.working.get(txId);
    if (!state || this.holder?.txId !== txId) {
      throw new Error("update outside the locking transaction");
    }
    if (this.failNextMark) {
      this.failNextMark = false;
      throw new Error("approval update failed");
    }
    if (state.status !== "sent") {
      return { rows: [] };
    }
    this.marks.push(sql);
    if (sql === MARK_QUOTE_APPROVED_SQL) {
      state.status = "approved";
      state.approved_at = at;
      return { rows: [{ approved_at: at }] };
    }
    state.status = "declined";
    state.declined_at = at;
    return { rows: [{ declined_at: at }] };
  }

  private commit(txId: number): void {
    const state = this.working.get(txId);
    if (this.holder?.txId === txId && state) {
      this.committed = { ...state };
    }
    this.release(txId);
  }

  private rollback(txId: number): void {
    this.release(txId);
  }

  private release(txId: number): void {
    this.working.delete(txId);
    if (this.holder?.txId !== txId) return;
    this.holder.release();
    this.holder = null;
  }
}

async function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function appFor(store: LockedApprovalStore): express.Express {
  const app = express();
  app.use(
    "/q",
    createApprovalRouter({
      queryFn: async () => {
        throw new Error("decision statement outside a transaction");
      },
      now: () => NOW,
      limiter: createApprovalLimiter({ max: 100, validate: false }),
      withTransaction: (fn) => store.transaction(fn),
    }),
  );
  return app;
}

describe("approval decision transaction", () => {
  const payload = {
    customerPhone: null,
    totalCents: 25000,
    clientSentence: null,
    lineItems: [
      { name: "Faucet", quantity: 1, unitPriceCents: 25000, unit: "each", roomName: null },
    ],
  };

  it("holds FOR UPDATE across approve so a concurrent decline cannot interleave", async () => {
    const token = generateApprovalToken();
    const store = new LockedApprovalStore(hashApprovalToken(token), payload);
    const firstLocked = deferred();
    const releaseFirst = deferred();
    const waiterBlocked = deferred();
    store.onFirstLock = () => firstLocked.resolve();
    store.continueFirst = releaseFirst.promise;
    store.onWaiter = () => waiterBlocked.resolve();

    const app = appFor(store);
    const server = await listen(app);
    try {
      const approve = fetch(`${server.url}/q/${token}/approve`, { method: "POST" });
      await firstLocked.promise;
      const decline = fetch(`${server.url}/q/${token}/decline`, { method: "POST" });
      await waiterBlocked.promise;
      assert.equal(store.waiters, 1);
      assert.equal(store.committed.status, "sent");

      releaseFirst.resolve();
      const [approved, declined] = await Promise.all([approve, decline]);
      const approvedHtml = await approved.text();
      const declinedHtml = await declined.text();

      assert.equal(approved.status, 200);
      assert.equal(declined.status, 200);
      assert.match(approvedHtml, /You approved this quote/);
      assert.match(declinedHtml, /You approved this quote/);
      assert.equal(approvedHtml.includes("You declined this quote"), false);
      assert.equal(declinedHtml.includes("You declined this quote"), false);
      assert.equal(store.committed.status, "approved");
      assert.ok(store.committed.approved_at);
      assert.equal(store.committed.declined_at, null);
      assert.deepEqual(store.marks, [MARK_QUOTE_APPROVED_SQL]);
      assert.equal(store.marks.includes(MARK_QUOTE_DECLINED_SQL), false);
    } finally {
      await server.close();
    }
  });

  it("rolls the quote back to sent when the update throws, so the waiter can still decide", async () => {
    const token = generateApprovalToken();
    const store = new LockedApprovalStore(hashApprovalToken(token), payload);
    store.failNextMark = true;
    const app = appFor(store);
    const server = await listen(app);
    try {
      const failed = await fetch(`${server.url}/q/${token}/approve`, { method: "POST" });
      const failedHtml = await failed.text();
      assert.equal(failed.status, 500);
      assert.equal(failedHtml, "Something went wrong.");
      assert.equal(store.committed.status, "sent");
      assert.equal(store.committed.approved_at, null);

      const ok = await fetch(`${server.url}/q/${token}/decline`, { method: "POST" });
      const html = await ok.text();
      assert.equal(ok.status, 200);
      assert.match(html, /You declined this quote/);
      assert.equal(store.committed.status, "declined");
      assert.equal(store.committed.approved_at, null);
      assert.ok(store.committed.declined_at);
      assert.deepEqual(store.marks, [MARK_QUOTE_DECLINED_SQL]);
    } finally {
      await server.close();
    }
  });
});
