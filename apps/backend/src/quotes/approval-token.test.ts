import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  APPROVAL_TOKEN_BYTES,
  DEFAULT_QUOTE_APPROVAL_TTL_MS,
  approvalExpiresAt,
  buildApprovalUrl,
  generateApprovalToken,
  hashApprovalToken,
  isApprovalTokenShape,
  resolvePublicBaseUrl,
  resolveQuoteApprovalTtlMs,
} from "./approval-token.js";
import {
  SMS_TRANSPORT_UNAVAILABLE_ERROR,
  createDryRunSmsSender,
  redactPhone,
  resolveSmsSender,
} from "./sms-sender.js";

describe("generateApprovalToken", () => {
  it("returns 32 random bytes and never stores that raw value as the hash", () => {
    const first = generateApprovalToken();
    const second = generateApprovalToken();
    assert.equal(Buffer.from(first, "base64url").length, APPROVAL_TOKEN_BYTES);
    assert.equal(first.length, 43);
    assert.equal(isApprovalTokenShape(first), true);
    assert.notEqual(first, second);

    const hash = hashApprovalToken(first);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(hash, hashApprovalToken(first));
    assert.notEqual(hash, first);
    assert.equal(hash.includes(first), false);
  });

  it("rejects malformed shapes without a distinct error code", () => {
    assert.equal(isApprovalTokenShape(""), false);
    assert.equal(isApprovalTokenShape("abc"), false);
    assert.equal(isApprovalTokenShape("<script>alert(1)</script>"), false);
    assert.equal(isApprovalTokenShape("a".repeat(200)), false);
    assert.equal(isApprovalTokenShape(`${generateApprovalToken()}=`), false);
  });
});

describe("resolveQuoteApprovalTtlMs", () => {
  it("defaults to 72 hours", () => {
    assert.equal(resolveQuoteApprovalTtlMs(undefined), 72 * 60 * 60 * 1000);
    assert.equal(resolveQuoteApprovalTtlMs(undefined), DEFAULT_QUOTE_APPROVAL_TTL_MS);
    assert.equal(resolveQuoteApprovalTtlMs(""), DEFAULT_QUOTE_APPROVAL_TTL_MS);
    assert.equal(resolveQuoteApprovalTtlMs("   "), DEFAULT_QUOTE_APPROVAL_TTL_MS);
  });

  it("parses a positive millisecond override and rejects junk", () => {
    assert.equal(resolveQuoteApprovalTtlMs("60000"), 60_000);
    assert.equal(resolveQuoteApprovalTtlMs("0"), DEFAULT_QUOTE_APPROVAL_TTL_MS);
    assert.equal(resolveQuoteApprovalTtlMs("-5"), DEFAULT_QUOTE_APPROVAL_TTL_MS);
    assert.equal(resolveQuoteApprovalTtlMs("nope"), DEFAULT_QUOTE_APPROVAL_TTL_MS);
    const now = new Date("2026-10-04T00:00:00.000Z");
    assert.equal(
      approvalExpiresAt(now, resolveQuoteApprovalTtlMs(undefined)).toISOString(),
      "2026-10-07T00:00:00.000Z",
    );
  });
});

describe("resolvePublicBaseUrl", () => {
  it("defaults to localhost and strips a trailing slash", () => {
    assert.equal(resolvePublicBaseUrl(undefined), "http://localhost:3000");
    assert.equal(resolvePublicBaseUrl(" https://quotes.example/ "), "https://quotes.example");
    const token = generateApprovalToken();
    assert.equal(
      buildApprovalUrl("https://quotes.example/", token),
      `https://quotes.example/q/${token}`,
    );
  });
});

describe("resolveSmsSender", () => {
  it("selects the dry-run logger by default and for log", async () => {
    const lines: string[] = [];
    const resolved = resolveSmsSender(undefined, (line) => lines.push(line));
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    assert.equal(resolved.sender.mode, "dry-run");
    const named = resolveSmsSender("log", (line) => lines.push(line));
    assert.equal(named.ok, true);

    const sender = createDryRunSmsSender((line) => lines.push(line));
    const result = await sender.sendQuoteLink({
      toPhone: "+15555550100",
      approvalUrl: "https://quotes.example/q/abc",
      quoteId: "q1",
    });
    assert.deepEqual(result, { mode: "dry-run" });
    assert.equal(lines.length, 1);
    assert.match(lines[0]!, /\[sms:dry-run\]/);
    assert.match(lines[0]!, /url=https:\/\/quotes\.example\/q\/:redacted/);
    assert.equal(lines[0]!.includes("/q/abc"), false);
    assert.equal(lines[0]!.includes("+15555550100"), false);
    assert.equal(lines[0]!.includes("5555550100"), false);
    assert.match(lines[0]!, /to=\*\*\*0100/);
    assert.equal(redactPhone("no-digits"), "***");
  });

  it("refuses any transport other than dry-run/log", () => {
    const refused = resolveSmsSender("twilio");
    assert.deepEqual(refused, { ok: false, error: SMS_TRANSPORT_UNAVAILABLE_ERROR });
  });
});
