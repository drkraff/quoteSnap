import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { redactForLog, redactRoutePath, redactString } from "./redact.js";
import { routeForLog } from "./logger.js";

const JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
const OPENAI_KEY = "sk-proj-abc123def456ghi789jklMNOP";
const APPROVAL_TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJK123456";
const PHONE = "+15555550100";
const SIGNED =
  "https://acct.r2.cloudflarestorage.com/bucket/audio/clip.m4a?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeefcafebabe";

describe("redactString", () => {
  it("redacts authorization schemes, JWTs, and OpenAI keys", () => {
    const input = `Authorization: Bearer ${JWT} basic Basic ${OPENAI_KEY} key ${OPENAI_KEY}`;
    const out = redactString(input);
    assert.equal(out.includes(JWT), false);
    assert.equal(out.includes(OPENAI_KEY), false);
    assert.match(out, /Bearer \[redacted\]/);
    assert.match(out, /Basic \[redacted\]/);
  });

  it("rewrites approval paths to /q/:redacted", () => {
    assert.equal(redactRoutePath(`/q/${APPROVAL_TOKEN}`), "/q/:redacted");
    assert.equal(redactRoutePath("/q/:token"), "/q/:redacted");
    assert.equal(
      redactString(`https://quotes.example/q/${APPROVAL_TOKEN}?x=1`),
      "https://quotes.example/q/:redacted?x=1",
    );
    assert.equal(redactString(`/q/${APPROVAL_TOKEN}/approve`), "/q/:redacted/approve");
  });

  it("redacts passwords, customer phones, and token query values", () => {
    const out = redactString(
      `password=hunter2 customerPhone=${PHONE} phone: (555) 555-0100 token=${APPROVAL_TOKEN} ?token=${APPROVAL_TOKEN}`,
    );
    assert.equal(out.includes("hunter2"), false);
    assert.equal(out.includes(PHONE), false);
    assert.equal(out.includes("555-0100"), false);
    assert.equal(out.includes(APPROVAL_TOKEN), false);
    assert.match(out, /password=\[redacted\]/);
    assert.match(out, /customerPhone=\[redacted\]/);
  });

  it("redacts signed audio and R2 URLs and leaves an unsigned path", () => {
    const out = redactString(`fetch ${SIGNED} ok`);
    assert.equal(out.includes("X-Amz-Signature"), false);
    assert.equal(out.includes("deadbeef"), false);
    assert.match(out, /\[redacted-url\]/);
    const plain = "https://acct.r2.cloudflarestorage.com/bucket/audio/clip.m4a";
    assert.equal(redactString(plain), plain);
  });

  it("redacts database URL userinfo", () => {
    const url = "postgresql://quotes:s3cret@db.internal:5432/quotesnap";
    const out = redactString(`connect ${url} failed`);
    assert.equal(out.includes("s3cret"), false);
    assert.match(out, /\[redacted\]@/);
  });

  it("leaves ordinary quote text in place", () => {
    const text = "14 linear feet of pipe at catalog item faucet";
    assert.equal(redactString(text), text);
  });
});

describe("voice cost fields", () => {
  it("keeps returned token counts while redacting an approval path on the same line", () => {
    const out = redactForLog({
      msg: "voice_cost",
      usage: {
        mapping: {
          promptTokens: 12,
          completionTokens: 3,
          totalTokens: 15,
          cachedPromptTokens: null,
        },
      },
      note: `https://quotes.example/q/${APPROVAL_TOKEN}`,
    }) as {
      usage: { mapping: { promptTokens: number; completionTokens: number; totalTokens: number } };
      note: string;
    };
    assert.equal(out.usage.mapping.promptTokens, 12);
    assert.equal(out.usage.mapping.completionTokens, 3);
    assert.equal(out.usage.mapping.totalTokens, 15);
    assert.equal(out.note, "https://quotes.example/q/:redacted");
  });
});

describe("redactForLog", () => {
  it("redacts sensitive keys without mutating the input", () => {
    const input = {
      headers: { Authorization: `Bearer ${JWT}`, "content-type": "application/json" },
      body: {
        password: "hunter2",
        customerPhone: PHONE,
        customer_phone: PHONE,
        name: "Ada",
      },
      stack: `Error\n    at /q/${APPROVAL_TOKEN}`,
      note: `see ${SIGNED}`,
    };
    const out = redactForLog(input) as {
      headers: { Authorization: string; "content-type": string };
      body: { password: string; customerPhone: string; customer_phone: string; name: string };
      note: string;
    };
    assert.equal(out.headers.Authorization, "[redacted]");
    assert.equal(out.headers["content-type"], "application/json");
    assert.equal(out.body.password, "[redacted]");
    assert.equal(out.body.customerPhone, "[redacted]");
    assert.equal(out.body.customer_phone, "[redacted]");
    assert.equal(out.body.name, "Ada");
    assert.equal("stack" in (out as object), false);
    assert.equal(JSON.stringify(out).includes(APPROVAL_TOKEN), false);
    assert.equal(JSON.stringify(out).includes("deadbeef"), false);
    assert.equal(input.body.password, "hunter2");
    assert.equal(input.body.customerPhone, PHONE);
  });

  it("redacts an Error message and drops the stack", () => {
    const err = new Error(`failed ${OPENAI_KEY} password=hunter2 ${PHONE} /q/${APPROVAL_TOKEN}`);
    const out = redactForLog(err) as { name: string; message: string; stack?: string };
    assert.equal(out.name, "Error");
    assert.equal(out.stack, undefined);
    assert.equal(out.message.includes(OPENAI_KEY), false);
    assert.equal(out.message.includes("hunter2"), false);
    assert.equal(out.message.includes(PHONE), false);
    assert.equal(out.message.includes(APPROVAL_TOKEN), false);
    assert.match(out.message, /\/q\/:redacted/);
  });
});

describe("routeForLog", () => {
  it("logs a raw approval URL as /q/:redacted", () => {
    assert.equal(
      routeForLog({
        method: "GET",
        originalUrl: `/q/${APPROVAL_TOKEN}?token=${APPROVAL_TOKEN}`,
      }),
      "GET /q/:redacted",
    );
  });

  it("rewrites the Express /q/:token pattern", () => {
    assert.equal(
      routeForLog({
        method: "POST",
        baseUrl: "/q",
        route: { path: "/:token/approve" },
        originalUrl: `/q/${APPROVAL_TOKEN}/approve`,
      }),
      "POST /q/:redacted/approve",
    );
  });
});
