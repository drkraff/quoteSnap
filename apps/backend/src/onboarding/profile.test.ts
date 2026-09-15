import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { INVALID_TRADE_ERROR } from "./seed.js";
import {
  HOURLY_RATE_REQUIRED_ERROR,
  MARKUP_PERCENT_ERROR,
  SELECT_CONTRACTOR_FOR_PROFILE_SQL,
  UPDATE_CONTRACTOR_PROFILE_SQL,
  applyOnboardingProfile,
  parseMarkupPercent,
  parseOnboardingProfileBody,
  parsePositiveCents,
} from "./profile.js";

const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("parseOnboardingProfileBody", () => {
  it("accepts trade + hourly cents and optional markup without requiring a catalog", () => {
    assert.deepEqual(parseOnboardingProfileBody({ trade: "plumbing", hourlyRateCents: 7500 }), {
      ok: true,
      trade: "plumbing",
      hourlyRateCents: 7500,
      markupPercent: null,
    });
    assert.deepEqual(
      parseOnboardingProfileBody({
        trade: "electrical",
        hourlyRateCents: 12500,
        markupPercent: 20,
      }),
      {
        ok: true,
        trade: "electrical",
        hourlyRateCents: 12500,
        markupPercent: 20,
      },
    );
  });

  it("rejects missing hourly, zero, or non-integer cents", () => {
    for (const body of [
      { trade: "plumbing" },
      { trade: "plumbing", hourlyRateCents: 0 },
      { trade: "plumbing", hourlyRateCents: -1 },
      { trade: "plumbing", hourlyRateCents: 75.5 },
      { trade: "plumbing", hourlyRateCents: "7500" },
    ]) {
      const parsed = parseOnboardingProfileBody(body);
      assert.equal(parsed.ok, false);
      if (!parsed.ok) {
        assert.equal(parsed.error, HOURLY_RATE_REQUIRED_ERROR);
      }
    }
  });

  it("rejects invalid trade without writing", () => {
    const parsed = parseOnboardingProfileBody({ trade: "carpentry", hourlyRateCents: 7500 });
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.equal(parsed.error, INVALID_TRADE_ERROR);
    }
  });

  it("rejects markup outside 0-100 integers", () => {
    const parsed = parseOnboardingProfileBody({
      trade: "hvac",
      hourlyRateCents: 9000,
      markupPercent: 101,
    });
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.equal(parsed.error, MARKUP_PERCENT_ERROR);
    }
  });
});

describe("parsePositiveCents / parseMarkupPercent", () => {
  it("accepts positive integer cents only", () => {
    assert.equal(parsePositiveCents(1), 1);
    assert.equal(parsePositiveCents(7500), 7500);
    assert.equal(parsePositiveCents(0), null);
    assert.equal(parsePositiveCents(7.5), null);
  });

  it("treats omitted markup as null and 0 as a stored zero", () => {
    assert.deepEqual(parseMarkupPercent(undefined), { ok: true, value: null });
    assert.deepEqual(parseMarkupPercent(null), { ok: true, value: null });
    assert.deepEqual(parseMarkupPercent(0), { ok: true, value: 0 });
    assert.deepEqual(parseMarkupPercent(20), { ok: true, value: 20 });
    assert.deepEqual(parseMarkupPercent(100), { ok: true, value: 100 });
    assert.equal(parseMarkupPercent(101).ok, false);
  });
});

describe("applyOnboardingProfile", () => {
  it("updates trade + hourly and does not insert catalog items", async () => {
    const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
    const queryFn = async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql === SELECT_CONTRACTOR_FOR_PROFILE_SQL) {
        return { rows: [{ id: CONTRACTOR_ID }] };
      }
      if (sql === UPDATE_CONTRACTOR_PROFILE_SQL) {
        return {
          rows: [
            {
              id: CONTRACTOR_ID,
              email: "ada@example.com",
              phone: null,
              display_name: "Ada",
              trade: params?.[0],
              hourly_rate_cents: params?.[1],
              markup_percent: params?.[2],
            },
          ],
        };
      }
      throw new Error(`unexpected sql: ${sql}`);
    };

    const outcome = await applyOnboardingProfile(queryFn, {
      contractorId: CONTRACTOR_ID,
      trade: "plumbing",
      hourlyRateCents: 7500,
      markupPercent: 20,
    });

    assert.equal(outcome.status, 200);
    if (outcome.status !== 200) return;
    assert.deepEqual(outcome.json.contractor, {
      id: CONTRACTOR_ID,
      email: "ada@example.com",
      phone: null,
      displayName: "Ada",
      trade: "plumbing",
      hourlyRateCents: 7500,
      markupPercent: 20,
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.sql, SELECT_CONTRACTOR_FOR_PROFILE_SQL);
    assert.deepEqual(calls[0]?.params, [CONTRACTOR_ID]);
    assert.equal(calls[1]?.sql, UPDATE_CONTRACTOR_PROFILE_SQL);
    assert.deepEqual(calls[1]?.params, ["plumbing", 7500, 20, CONTRACTOR_ID]);
    assert.equal(
      calls.some((c) => /INSERT INTO catalog_items/i.test(c.sql)),
      false,
    );
    assert.equal(
      calls.some((c) => /FROM catalog_items/i.test(c.sql)),
      false,
    );
  });

  it("returns 404 when the contractor row is missing", async () => {
    const queryFn = async (sql: string) => {
      if (sql === SELECT_CONTRACTOR_FOR_PROFILE_SQL) {
        return { rows: [] };
      }
      throw new Error(`unexpected sql: ${sql}`);
    };
    const outcome = await applyOnboardingProfile(queryFn, {
      contractorId: CONTRACTOR_ID,
      trade: "hvac",
      hourlyRateCents: 9000,
      markupPercent: null,
    });
    assert.deepEqual(outcome, { status: 404, json: { error: "Contractor not found" } });
  });
});
