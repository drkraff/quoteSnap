import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { createFeedbackRouter } from "../routes/feedback-router.js";
import { authenticateToken } from "../middleware/auth.js";
import { ADMIN_UNAUTHORIZED, adminTokenMatches, bearerToken, createAdminAuth } from "./admin-auth.js";
import {
  FEEDBACK_RATE_LIMIT_MAX,
  FEEDBACK_RATE_LIMIT_MESSAGE,
  FEEDBACK_RATE_LIMIT_WINDOW_MS,
  createFeedbackLimiter,
  feedbackRateLimitKey,
} from "./limiter.js";
import { INSERT_FEEDBACK_SQL, type FeedbackQuery } from "./submit.js";
import { LIST_FEEDBACK_SQL } from "./list.js";
import {
  FEEDBACK_APP_VERSION_TOO_LONG,
  FEEDBACK_BODY_INVALID,
  FEEDBACK_MESSAGE_REQUIRED,
  FEEDBACK_MESSAGE_TOO_LONG,
  FEEDBACK_QUOTE_ID_INVALID,
  FEEDBACK_RATING_INVALID,
  FEEDBACK_SCREEN_TOO_LONG,
  FEEDBACK_SCREENSHOT_INVALID,
  FEEDBACK_SCREENSHOT_MAX_BYTES,
  FEEDBACK_SCREENSHOT_TOO_LARGE,
  FEEDBACK_SCREENSHOT_TYPE,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_SCREEN_MAX,
  parseFeedbackBody,
} from "./validate.js";

const SECRET = "test-secret-at-least-32-characters-long";
const CONTRACTOR_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONTRACTOR_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const FEEDBACK_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ADMIN_TOKEN = "admin-token-for-feedback-list";
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

type Call = { sql: string; params: unknown[] | undefined };

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

function asContractor(contractorId: string): RequestHandler {
  return (req, _res, next) => {
    req.contractor = { contractorId, email: null, phone: null };
    next();
  };
}

function appWith(query: FeedbackQuery, authenticate: RequestHandler = asContractor(CONTRACTOR_A)) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(
    "/feedback",
    createFeedbackRouter({
      query,
      authenticate,
      limiter: createFeedbackLimiter({ max: 20, validate: false }),
    }),
  );
  return app;
}

describe("parseFeedbackBody", () => {
  it("accepts a note with optional rating, screen, quote, and a PNG screenshot", () => {
    const parsed = parseFeedbackBody({
      message: "  The total looked wrong  ",
      rating: 4,
      screen: "draft",
      quoteId: QUOTE_ID,
      appVersion: "1.0.0",
      platform: "android",
      screenshotBase64: PNG_BASE64,
      contractorId: CONTRACTOR_B,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.message, "The total looked wrong");
    assert.equal(parsed.value.rating, 4);
    assert.equal(parsed.value.screen, "draft");
    assert.equal(parsed.value.quoteId, QUOTE_ID);
    assert.equal(parsed.value.appVersion, "1.0.0");
    assert.equal(parsed.value.platform, "android");
    assert.equal(parsed.value.screenshot?.toString("base64"), PNG_BASE64);
    assert.equal("contractorId" in parsed.value, false);
  });

  it("allows a note with no rating, quote, or screenshot", () => {
    const parsed = parseFeedbackBody({ message: "Hello" });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.rating, null);
    assert.equal(parsed.value.quoteId, null);
    assert.equal(parsed.value.screenshot, null);
    assert.equal(parsed.value.screen, null);
  });

  it("rejects an empty message, a bad rating, a non-uuid quote, and a non-image", () => {
    assert.equal(parseFeedbackBody({}).ok, false);
    assert.deepEqual(parseFeedbackBody({ message: "   " }), {
      ok: false,
      error: FEEDBACK_MESSAGE_REQUIRED,
    });
    assert.equal((parseFeedbackBody([]) as { error: string }).error, FEEDBACK_BODY_INVALID);
    assert.equal(
      (parseFeedbackBody({ message: "Hi", rating: 0 }) as { error: string }).error,
      FEEDBACK_RATING_INVALID,
    );
    assert.equal(
      (parseFeedbackBody({ message: "Hi", rating: 6 }) as { error: string }).error,
      FEEDBACK_RATING_INVALID,
    );
    assert.equal(
      (parseFeedbackBody({ message: "Hi", rating: 1.5 }) as { error: string }).error,
      FEEDBACK_RATING_INVALID,
    );
    assert.equal(
      (parseFeedbackBody({ message: "Hi", rating: "5" }) as { error: string }).error,
      FEEDBACK_RATING_INVALID,
    );
    assert.equal(
      (parseFeedbackBody({ message: "Hi", quoteId: "local" }) as { error: string }).error,
      FEEDBACK_QUOTE_ID_INVALID,
    );
    assert.equal(
      (parseFeedbackBody({ message: "x".repeat(FEEDBACK_MESSAGE_MAX + 1) }) as { error: string }).error,
      FEEDBACK_MESSAGE_TOO_LONG,
    );
    assert.equal(
      (parseFeedbackBody({ message: "Hi", screen: "s".repeat(FEEDBACK_SCREEN_MAX + 1) }) as { error: string }).error,
      FEEDBACK_SCREEN_TOO_LONG,
    );
    assert.equal(
      (parseFeedbackBody({ message: "Hi", appVersion: "v".repeat(33) }) as { error: string }).error,
      FEEDBACK_APP_VERSION_TOO_LONG,
    );
    const gif = Buffer.from("GIF89a").toString("base64");
    assert.equal(
      (parseFeedbackBody({ message: "Hi", screenshotBase64: gif }) as { error: string }).error,
      FEEDBACK_SCREENSHOT_TYPE,
    );
    assert.equal(
      (parseFeedbackBody({ message: "Hi", screenshotBase64: "%%%" }) as { error: string }).error,
      FEEDBACK_SCREENSHOT_INVALID,
    );
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const jpegParsed = parseFeedbackBody({
      message: "Hi",
      screenshotBase64: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
    });
    assert.equal(jpegParsed.ok, true);
    if (!jpegParsed.ok) return;
    assert.equal(jpegParsed.value.screenshot?.equals(jpeg), true);

    const big = Buffer.alloc(FEEDBACK_SCREENSHOT_MAX_BYTES + 1);
    big[0] = 0x89;
    big[1] = 0x50;
    big[2] = 0x4e;
    big[3] = 0x47;
    assert.equal(
      (parseFeedbackBody({ message: "Hi", screenshotBase64: big.toString("base64") }) as { error: string }).error,
      FEEDBACK_SCREENSHOT_TOO_LARGE,
    );
  });
});

describe("admin token", () => {
  it("matches only the exact bearer token", () => {
    assert.equal(bearerToken("Bearer secret-token"), "secret-token");
    assert.equal(bearerToken("bearer secret-token"), "secret-token");
    assert.equal(bearerToken("secret-token"), null);
    assert.equal(adminTokenMatches("secret-token", "secret-token"), true);
    assert.equal(adminTokenMatches("secret-token", "other-token"), false);
    assert.equal(adminTokenMatches("short", "secret-token"), false);
  });
});

describe("feedback limiter config", () => {
  it("is per contractor", () => {
    assert.equal(FEEDBACK_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
    assert.equal(FEEDBACK_RATE_LIMIT_MAX, 10);
    assert.equal(feedbackRateLimitKey(CONTRACTOR_A), `contractor:${CONTRACTOR_A}`);
    assert.notEqual(feedbackRateLimitKey(CONTRACTOR_A), feedbackRateLimitKey(CONTRACTOR_B));
    assert.equal(feedbackRateLimitKey("  "), "contractor:missing");
  });
});

describe("POST /feedback", () => {
  it("rejects a missing access token before querying", async () => {
    const calls: Call[] = [];
    const app = express();
    app.use(express.json());
    app.use(
      "/feedback",
      createFeedbackRouter({
        query: async (sql, params) => {
          calls.push({ sql, params });
          return { rows: [] };
        },
        authenticate: (req, res, next) => {
          const previous = process.env["JWT_ACCESS_SECRET"];
          process.env["JWT_ACCESS_SECRET"] = SECRET;
          try {
            authenticateToken(req, res, next);
          } finally {
            if (previous === undefined) delete process.env["JWT_ACCESS_SECRET"];
            else process.env["JWT_ACCESS_SECRET"] = previous;
          }
        },
      }),
    );
    const server = await listen(app);
    try {
      const response = await fetch(`${server.url}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Hi" }),
      });
      const body: unknown = await response.json();
      assert.equal(response.status, 401);
      assert.deepEqual(body, { error: "Invalid or expired token" });
      assert.equal(calls.length, 0);
    } finally {
      await server.close();
    }
  });

  it("inserts the JWT contractor id and does not take contractorId from the body", async () => {
    const calls: Call[] = [];
    const app = appWith(async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: FEEDBACK_ID, created_at: new Date("2026-10-15T12:00:00.000Z") }] };
    });
    const server = await listen(app);
    try {
      const response = await fetch(`${server.url}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "The keypad covered the total",
          rating: 2,
          screen: "draft",
          quoteId: QUOTE_ID,
          appVersion: "1.0.0",
          platform: "ios",
          screenshotBase64: PNG_BASE64,
          contractorId: CONTRACTOR_B,
        }),
      });
      const body: unknown = await response.json();
      assert.equal(response.status, 201);
      assert.deepEqual(body, { id: FEEDBACK_ID, createdAt: "2026-10-15T12:00:00.000Z" });
      assert.equal(calls.length, 1);
      assert.match(calls[0]?.sql ?? "", /INSERT INTO feedback/);
      assert.equal(calls[0]?.sql, INSERT_FEEDBACK_SQL);
      assert.equal(calls[0]?.params?.[0], CONTRACTOR_A);
      assert.equal(calls[0]?.params?.[1], "The keypad covered the total");
      assert.equal(calls[0]?.params?.[2], 2);
      assert.equal(calls[0]?.params?.[3], "draft");
      assert.equal(calls[0]?.params?.[4], QUOTE_ID);
      assert.equal(calls[0]?.params?.[5], "1.0.0");
      assert.equal(calls[0]?.params?.[6], "ios");
      assert.ok(Buffer.isBuffer(calls[0]?.params?.[7]));
      assert.equal((calls[0]?.params?.[7] as Buffer).toString("base64"), PNG_BASE64);
      assert.equal(JSON.stringify(calls[0]?.params).includes(CONTRACTOR_B), false);
    } finally {
      await server.close();
    }
  });

  it("returns 400 and does not query when the note is invalid", async () => {
    let queried = false;
    const app = appWith(async () => {
      queried = true;
      return { rows: [] };
    });
    const server = await listen(app);
    try {
      const response = await fetch(`${server.url}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "   ", rating: 9 }),
      });
      const body: unknown = await response.json();
      assert.equal(response.status, 400);
      assert.deepEqual(body, { error: FEEDBACK_MESSAGE_REQUIRED });
      assert.equal(queried, false);
    } finally {
      await server.close();
    }
  });

  it("hides a database failure behind a generic 500", async () => {
    const app = appWith(async () => {
      throw new Error("password=secret in the driver");
    });
    const server = await listen(app);
    try {
      const response = await fetch(`${server.url}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Hi" }),
      });
      const body: unknown = await response.json();
      assert.equal(response.status, 500);
      assert.deepEqual(body, { error: "Internal server error" });
      assert.equal(JSON.stringify(body).includes("secret"), false);
    } finally {
      await server.close();
    }
  });

  it("rate limits a contractor after the cap and still accepts another contractor", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      "/feedback",
      createFeedbackRouter({
        query: async () => ({
          rows: [{ id: FEEDBACK_ID, created_at: new Date("2026-10-15T12:00:00.000Z") }],
        }),
        authenticate: (req, _res, next) => {
          req.contractor = {
            contractorId: req.header("x-contractor-id") ?? CONTRACTOR_A,
            email: null,
            phone: null,
          };
          next();
        },
        limiter: createFeedbackLimiter({ max: 2, validate: false }),
      }),
    );
    const server = await listen(app);
    const post = (contractorId: string) =>
      fetch(`${server.url}/feedback`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-contractor-id": contractorId,
        },
        body: JSON.stringify({ message: "Again" }),
      });
    try {
      assert.equal((await post(CONTRACTOR_A)).status, 201);
      assert.equal((await post(CONTRACTOR_A)).status, 201);
      const blocked = await post(CONTRACTOR_A);
      const blockedBody: unknown = await blocked.json();
      assert.equal(blocked.status, 429);
      assert.deepEqual(blockedBody, FEEDBACK_RATE_LIMIT_MESSAGE);
      assert.equal((await post(CONTRACTOR_B)).status, 201);
    } finally {
      await server.close();
    }
  });

  it("does not spend the rate limit on a note that fails validation", async () => {
    let inserts = 0;
    const app = express();
    app.use(express.json());
    app.use(
      "/feedback",
      createFeedbackRouter({
        query: async () => {
          inserts += 1;
          return { rows: [{ id: FEEDBACK_ID, created_at: new Date("2026-10-15T12:00:00.000Z") }] };
        },
        authenticate: asContractor(CONTRACTOR_A),
        limiter: createFeedbackLimiter({ max: 1, validate: false }),
      }),
    );
    const server = await listen(app);
    try {
      const bad = await fetch(`${server.url}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "" }),
      });
      assert.equal(bad.status, 400);
      const good = await fetch(`${server.url}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Still allowed" }),
      });
      assert.equal(good.status, 201);
      assert.equal(inserts, 1);
    } finally {
      await server.close();
    }
  });
});

describe("GET /feedback", () => {
  it("lists notes for the admin token and refuses everyone else", async () => {
    const png = Buffer.from(PNG_BASE64, "base64");
    const calls: Call[] = [];
    const app = express();
    app.use(
      "/feedback",
      createFeedbackRouter({
        query: async (sql, params) => {
          calls.push({ sql, params });
          return {
            rows: [
              {
                id: FEEDBACK_ID,
                contractor_id: CONTRACTOR_A,
                message: "The total looked wrong",
                rating: 4,
                screen: "quote",
                quote_id: QUOTE_ID,
                app_version: "1.0.0",
                platform: "android",
                screenshot: png,
                created_at: new Date("2026-10-15T12:00:00.000Z"),
              },
            ],
          };
        },
        adminAuth: createAdminAuth({ ADMIN_TOKEN } as NodeJS.ProcessEnv),
        authenticate: authenticateToken,
      }),
    );
    const server = await listen(app);
    const contractorJwt = jwt.sign(
      { contractorId: CONTRACTOR_A, email: "a@example.com", phone: null },
      SECRET,
      { algorithm: "HS256", expiresIn: "15m" },
    );
    try {
      const missing = await fetch(`${server.url}/feedback`);
      assert.equal(missing.status, 401);
      assert.deepEqual(await missing.json(), { error: ADMIN_UNAUTHORIZED });

      const wrong = await fetch(`${server.url}/feedback`, {
        headers: { authorization: "Bearer not-the-token" },
      });
      assert.equal(wrong.status, 401);

      const contractor = await fetch(`${server.url}/feedback`, {
        headers: { authorization: `Bearer ${contractorJwt}` },
      });
      assert.equal(contractor.status, 401);
      assert.equal(calls.length, 0);

      const listed = await fetch(`${server.url}/feedback?limit=5&offset=0`, {
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      const body: unknown = await listed.json();
      assert.equal(listed.status, 200);
      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.sql, LIST_FEEDBACK_SQL);
      assert.deepEqual(calls[0]?.params, [5, 0]);
      assert.deepEqual(body, {
        feedback: [
          {
            id: FEEDBACK_ID,
            contractorId: CONTRACTOR_A,
            message: "The total looked wrong",
            rating: 4,
            screen: "quote",
            quoteId: QUOTE_ID,
            appVersion: "1.0.0",
            platform: "android",
            screenshotBase64: PNG_BASE64,
            createdAt: "2026-10-15T12:00:00.000Z",
          },
        ],
        limit: 5,
        offset: 0,
      });
    } finally {
      await server.close();
    }
  });

  it("refuses the list when ADMIN_TOKEN is unset, without querying", async () => {
    let queried = false;
    const app = express();
    app.use(
      "/feedback",
      createFeedbackRouter({
        query: async () => {
          queried = true;
          return { rows: [] };
        },
        adminAuth: createAdminAuth({} as NodeJS.ProcessEnv),
      }),
    );
    const server = await listen(app);
    try {
      const response = await fetch(`${server.url}/feedback`, {
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: ADMIN_UNAUTHORIZED });
      assert.equal(queried, false);
    } finally {
      await server.close();
    }
  });

  it("rejects a bad page size before querying", async () => {
    let queried = false;
    const app = express();
    app.use(
      "/feedback",
      createFeedbackRouter({
        query: async () => {
          queried = true;
          return { rows: [] };
        },
        adminAuth: createAdminAuth({ ADMIN_TOKEN } as NodeJS.ProcessEnv),
      }),
    );
    const server = await listen(app);
    try {
      const response = await fetch(`${server.url}/feedback?limit=0`, {
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      const body: unknown = await response.json();
      assert.equal(response.status, 400);
      assert.deepEqual(body, { error: "limit must be a whole number" });
      assert.equal(queried, false);
    } finally {
      await server.close();
    }
  });
});
