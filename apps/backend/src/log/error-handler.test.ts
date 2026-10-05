import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import multer from "multer";
import { errorHandler, requestIdMiddleware, resolveRequestId } from "./http.js";
import { createApprovalRouter } from "../routes/approval-router.js";
import { createApprovalLimiter } from "../quotes/approval-security.js";
import { generateApprovalToken } from "../quotes/approval-token.js";

const JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

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

function captureConsoleError(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.error;
  console.error = (line?: unknown) => {
    lines.push(String(line));
  };
  return {
    lines,
    restore: () => {
      console.error = original;
    },
  };
}

describe("resolveRequestId", () => {
  it("keeps a short safe id and replaces JWTs and OpenAI keys", () => {
    assert.equal(resolveRequestId("req_123.abc"), "req_123.abc");
    const fromPaddedJwt = resolveRequestId(` ${JWT} `);
    assert.equal(fromPaddedJwt.includes("eyJ"), false);
    const replaced = resolveRequestId(JWT);
    assert.equal(replaced.includes("eyJ"), false);
    assert.notEqual(replaced, JWT);
    assert.notEqual(resolveRequestId("sk-proj-abc123def456ghi789"), "sk-proj-abc123def456ghi789");
    assert.equal(resolveRequestId("bad id with spaces").includes(" "), false);
  });
});

describe("errorHandler", () => {
  it("logs a structured line and returns a generic JSON 500", async () => {
    const captured = captureConsoleError();
    const app = express();
    app.use(requestIdMiddleware);
    app.get("/boom", () => {
      throw new Error(`database exploded sk-proj-abc123def456ghi789 password=hunter2 ${JWT}`);
    });
    app.use(errorHandler);
    const server = await listen(app);
    try {
      const res = await fetch(`${server.url}/boom`, {
        headers: { "X-Request-Id": "req-abc-1" },
      });
      const body: unknown = await res.json();
      assert.equal(res.status, 500);
      assert.deepEqual(body, { error: "Internal server error" });
      assert.equal(JSON.stringify(body).includes("database exploded"), false);
      assert.equal(JSON.stringify(body).includes("stack"), false);
      assert.equal(res.headers.get("x-request-id"), "req-abc-1");
      assert.equal(captured.lines.length, 1);
      const line = JSON.parse(captured.lines[0]!) as {
        level: string;
        msg: string;
        requestId: string;
        route: string;
        status: number;
        error: { name: string; message: string };
        stack?: string;
      };
      assert.equal(line.level, "error");
      assert.equal(line.msg, "unhandled_error");
      assert.equal(line.requestId, "req-abc-1");
      assert.equal(line.route, "GET /boom");
      assert.equal(line.status, 500);
      assert.equal(line.error.name, "Error");
      assert.equal(line.error.message.includes("sk-proj-abc123def456ghi789"), false);
      assert.equal(line.error.message.includes("hunter2"), false);
      assert.equal(line.error.message.includes(JWT), false);
      assert.equal(line.stack, undefined);
      assert.equal(JSON.stringify(line).includes("at "), false);
    } finally {
      captured.restore();
      await server.close();
    }
  });

  it("logs /q/<token> as /q/:redacted and omits the token from the JSON body", async () => {
    const token = "approvaltokenvalue-1234567890abcd";
    const captured = captureConsoleError();
    const app = express();
    app.use(requestIdMiddleware);
    app.get("/q/:token", () => {
      throw new Error(`lookup failed /q/${token}`);
    });
    app.use(errorHandler);
    const server = await listen(app);
    try {
      const res = await fetch(`${server.url}/q/${token}`);
      const body: unknown = await res.json();
      assert.deepEqual(body, { error: "Internal server error" });
      assert.equal(JSON.stringify(body).includes(token), false);
      const line = JSON.parse(captured.lines[0]!) as { route: string; error: { message: string } };
      assert.equal(line.route, "GET /q/:redacted");
      assert.equal(JSON.stringify(line).includes(token), false);
      assert.match(line.error.message, /\/q\/:redacted/);
    } finally {
      captured.restore();
      await server.close();
    }
  });
});

describe("malformed JSON bodies", () => {
  it("returns 400 with a plain message and a redacted log", async () => {
    const captured = captureConsoleError();
    const app = express();
    app.use(requestIdMiddleware);
    app.use(express.json());
    app.post("/echo", (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);
    const server = await listen(app);
    const secret = "sk-proj-abc123def456ghi789";
    const phone = "+15555550100";
    try {
      const res = await fetch(`${server.url}/echo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": "req-bad-json",
        },
        body: `{"password":"hunter2","customerPhone":"${phone}","note":"${secret}"`,
      });
      const body: unknown = await res.json();
      assert.equal(res.status, 400);
      assert.deepEqual(body, { error: "That request could not be read." });
      const text = JSON.stringify(body);
      assert.equal(text.includes("hunter2"), false);
      assert.equal(text.includes(phone), false);
      assert.equal(text.includes(secret), false);
      assert.equal(text.includes("SyntaxError"), false);
      assert.equal(text.includes("Unexpected"), false);
      assert.equal(text.includes("stack"), false);
      assert.equal(res.headers.get("x-request-id"), "req-bad-json");
      assert.equal(captured.lines.length, 1);
      const line = JSON.parse(captured.lines[0]!) as {
        status: number;
        msg: string;
        stack?: string;
        error: { message: string };
      };
      assert.equal(line.msg, "unhandled_error");
      assert.equal(line.status, 400);
      assert.equal(line.stack, undefined);
      const logged = JSON.stringify(line);
      assert.equal(logged.includes("hunter2"), false);
      assert.equal(logged.includes(phone), false);
      assert.equal(logged.includes(secret), false);
      // The parser message says "at position". A stack frame is "at name (file:line:col)".
      assert.doesNotMatch(logged, /at\s+\S+\s+\([^)]+:\d+:\d+\)/);
      assert.equal(logged.includes("\n    at "), false);
    } finally {
      captured.restore();
      await server.close();
    }
  });
});

describe("oversized bodies and multer limits", () => {
  it("maps an oversize JSON body to 413 with a plain message and a redacted log", async () => {
    const captured = captureConsoleError();
    const app = express();
    app.use(requestIdMiddleware);
    app.use(express.json());
    app.post("/echo", (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);
    const server = await listen(app);
    try {
      const payload = JSON.stringify({
        note: `sk-proj-abc123def456ghi789 phone=+15555550100 ${"x".repeat(120_000)}`,
      });
      const res = await fetch(`${server.url}/echo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": "req-too-big",
        },
        body: payload,
      });
      const body: unknown = await res.json();
      assert.equal(res.status, 413);
      assert.deepEqual(body, { error: "That upload is too large." });
      assert.equal(JSON.stringify(body).includes("sk-proj"), false);
      assert.equal(JSON.stringify(body).includes("+15555550100"), false);
      assert.equal(JSON.stringify(body).includes("stack"), false);
      const line = JSON.parse(captured.lines[0]!) as { status: number; error: { message: string } };
      assert.equal(line.status, 413);
      assert.equal(JSON.stringify(line).includes("sk-proj-abc123def456ghi789"), false);
      assert.equal(JSON.stringify(line).includes("+15555550100"), false);
      assert.equal(JSON.stringify(line).includes("at "), false);
    } finally {
      captured.restore();
      await server.close();
    }
  });

  it("maps a multer file-size limit to 413 and other multer limits to 400", async () => {
    const captured = captureConsoleError();
    const app = express();
    app.use(requestIdMiddleware);
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 16 },
    });
    app.post("/audio", upload.single("audio"), (_req, res) => {
      res.json({ ok: true });
    });
    app.post("/one-field", upload.single("audio"), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);
    const server = await listen(app);
    try {
      const tooBig = new FormData();
      tooBig.append("audio", new Blob([new Uint8Array(64)]), "clip.m4a");
      const sized = await fetch(`${server.url}/audio`, { method: "POST", body: tooBig });
      const sizedBody: unknown = await sized.json();
      assert.equal(sized.status, 413);
      assert.deepEqual(sizedBody, { error: "That upload is too large." });
      assert.equal(JSON.stringify(sizedBody).includes("LIMIT_FILE_SIZE"), false);

      const unexpected = new FormData();
      unexpected.append("photo", new Blob([new Uint8Array(4)]), "still.jpg");
      const rejected = await fetch(`${server.url}/one-field`, { method: "POST", body: unexpected });
      const rejectedBody: unknown = await rejected.json();
      assert.equal(rejected.status, 400);
      assert.deepEqual(rejectedBody, { error: "That upload could not be accepted." });
      assert.equal(JSON.stringify(rejectedBody).includes("MulterError"), false);

      for (const lineText of captured.lines) {
        const line = JSON.parse(lineText) as { status: number; stack?: string };
        assert.equal(line.stack, undefined);
        assert.ok(line.status === 413 || line.status === 400);
      }
    } finally {
      captured.restore();
      await server.close();
    }
  });
});

describe("approval page errors", () => {
  it("still returns the HTML 500 page and redacts the token in the log", async () => {
    const token = generateApprovalToken();
    const captured = captureConsoleError();
    const app = express();
    app.use(requestIdMiddleware);
    app.use(
      "/q",
      createApprovalRouter({
        queryFn: async () => {
          throw new Error(`db down token=${token} phone=+15555550100`);
        },
        now: () => new Date("2026-10-04T00:00:00.000Z"),
        limiter: createApprovalLimiter({ max: 20, validate: false }),
      }),
    );
    app.use(errorHandler);
    const server = await listen(app);
    try {
      const res = await fetch(`${server.url}/q/${token}`);
      const html = await res.text();
      assert.equal(res.status, 500);
      assert.match(res.headers.get("content-type") ?? "", /html/);
      assert.equal(html, "Something went wrong.");
      assert.equal(html.includes(token), false);
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
      const line = JSON.parse(captured.lines[0]!) as { route: string; msg: string };
      assert.equal(line.msg, "GET /q/:redacted error");
      assert.equal(line.route, "GET /q/:redacted");
      assert.equal(JSON.stringify(line).includes(token), false);
      assert.equal(JSON.stringify(line).includes("+15555550100"), false);

      const posted = await fetch(`${server.url}/q/${token}/approve`, { method: "POST" });
      const postedHtml = await posted.text();
      assert.equal(posted.status, 500);
      assert.match(posted.headers.get("content-type") ?? "", /html/);
      assert.equal(postedHtml, "Something went wrong.");
      const postedLine = JSON.parse(captured.lines[1]!) as { route: string; msg: string };
      assert.equal(postedLine.msg, "POST /q/:redacted/approve error");
      assert.equal(postedLine.route, "POST /q/:redacted/approve");
      assert.equal(JSON.stringify(postedLine).includes(token), false);
    } finally {
      captured.restore();
      await server.close();
    }
  });
});
