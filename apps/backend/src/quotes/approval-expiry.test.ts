import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPIRE_SENT_QUOTES_SQL,
  QUOTE_APPROVAL_EXPIRY_CRON,
  QUOTE_APPROVAL_EXPIRY_QUEUE,
  expireSentApprovalQuotes,
  startQuoteApprovalExpiry,
} from "./approval-expiry.js";

describe("expireSentApprovalQuotes", () => {
  it("marks only sent quotes whose token is past expires_at", async () => {
    const calls: Array<{ text: string; params: unknown[] }> = [];
    const now = new Date("2026-10-07T00:00:00.000Z");
    const ids = await expireSentApprovalQuotes(async (text, params) => {
      calls.push({ text, params: params ?? [] });
      return { rows: [{ id: "q1" }] };
    }, now);

    assert.deepEqual(ids, ["q1"]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.text, EXPIRE_SENT_QUOTES_SQL);
    assert.match(calls[0]!.text, /SET status = 'expired'/);
    assert.match(calls[0]!.text, /q\.status = 'sent'/);
    assert.match(calls[0]!.text, /t\.expires_at <= \$1/);
    assert.equal(calls[0]!.text.includes("quote_snapshots"), false);
    assert.equal(calls[0]!.text.includes("approved"), false);
    assert.equal(calls[0]!.text.includes("total_cents"), false);
    assert.deepEqual(calls[0]!.params, [now]);
  });

  it("returns an empty list when nothing is due", async () => {
    const ids = await expireSentApprovalQuotes(async () => ({ rows: [] }), new Date());
    assert.deepEqual(ids, []);
  });
});

describe("startQuoteApprovalExpiry", () => {
  it("schedules a UTC minute cron whose worker runs the expire update", async () => {
    const events: string[] = [];
    let worker: ((jobs: unknown[]) => Promise<void>) | undefined;
    const queries: string[] = [];
    const boss = {
      createQueue: async (name: string) => {
        events.push(`create:${name}`);
      },
      schedule: async (
        name: string,
        cron: string,
        data: object | null,
        options: { tz?: string },
      ) => {
        events.push(`schedule:${name}:${cron}:${data}:${options.tz}`);
      },
      work: async (name: string, handler: (jobs: unknown[]) => Promise<void>) => {
        events.push(`work:${name}`);
        worker = handler;
      },
    };

    await startQuoteApprovalExpiry(boss as never, async (text) => {
      queries.push(text);
      return { rows: [] };
    });
    assert.ok(worker);
    await worker!([]);

    assert.deepEqual(events, [
      `create:${QUOTE_APPROVAL_EXPIRY_QUEUE}`,
      `schedule:${QUOTE_APPROVAL_EXPIRY_QUEUE}:${QUOTE_APPROVAL_EXPIRY_CRON}:null:UTC`,
      `work:${QUOTE_APPROVAL_EXPIRY_QUEUE}`,
    ]);
    assert.deepEqual(queries, [EXPIRE_SENT_QUOTES_SQL]);
    assert.equal(QUOTE_APPROVAL_EXPIRY_CRON, "* * * * *");
  });

  it("is started from initBoss next to the ai-processing reaper", () => {
    const source = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "../workers/voice-processor.ts"),
      "utf8",
    );
    assert.match(source, /startQuoteApprovalExpiry\(boss, query\)/);
  });
});
