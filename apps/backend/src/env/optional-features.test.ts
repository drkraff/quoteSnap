import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PHOTOS_UNAVAILABLE_MESSAGE,
  VOICE_UNAVAILABLE_MESSAGE,
  logOptionalFeatureWarning,
  optionalFeatureReport,
  photoFeatureGate,
  voiceFeatureGate,
} from "./optional-features.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const READY = {
  OPENAI_API_KEY: "sk-proj-abc123def456ghi789",
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "access",
  R2_SECRET_ACCESS_KEY: "super-secret-r2",
  R2_BUCKET: "quotesnap-audio",
};

function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((done, reject) => {
            server.close((err) => (err ? reject(err) : done()));
          }),
      });
    });
  });
}

describe("optionalFeatureReport", () => {
  it("names voice and photos when OpenAI or R2 is missing, without hard-failing", () => {
    const missingOpenAi = optionalFeatureReport({ ...READY, OPENAI_API_KEY: "  " });
    assert.deepEqual(missingOpenAi.disabled, ["voice"]);
    assert.deepEqual(missingOpenAi.missing, ["OPENAI_API_KEY"]);

    const missingBucket = optionalFeatureReport({ ...READY, R2_BUCKET: "" });
    assert.deepEqual(missingBucket.disabled, ["voice", "photos"]);
    assert.deepEqual(missingBucket.missing, ["R2_BUCKET"]);

    assert.deepEqual(optionalFeatureReport(READY).disabled, []);
    assert.doesNotThrow(() => optionalFeatureReport({}));
  });
});

describe("logOptionalFeatureWarning", () => {
  it("writes one structured warning and does not include secret values", () => {
    const lines: Array<{ level: string; fields: Record<string, unknown> }> = [];
    logOptionalFeatureWarning(
      { ...READY, R2_SECRET_ACCESS_KEY: "" },
      (level, fields) => {
        lines.push({ level, fields });
      },
    );
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.level, "warn");
    assert.equal(lines[0]!.fields.msg, "optional_features_disabled");
    assert.deepEqual(lines[0]!.fields.disabled, ["voice", "photos"]);
    const text = JSON.stringify(lines[0]);
    assert.equal(text.includes("sk-proj-abc123def456ghi789"), false);
    assert.equal(text.includes("super-secret-r2"), false);
    assert.equal(text.includes("R2_SECRET_ACCESS_KEY"), true);
  });

  it("stays quiet when voice and photos are configured", () => {
    let called = false;
    logOptionalFeatureWarning(READY, () => {
      called = true;
    });
    assert.equal(called, false);
  });
});

describe("feature gates", () => {
  it("returns 503 for voice upload and photo routes when their config is missing", async () => {
    const previous = {
      OPENAI_API_KEY: process.env["OPENAI_API_KEY"],
      R2_ACCOUNT_ID: process.env["R2_ACCOUNT_ID"],
      R2_ACCESS_KEY_ID: process.env["R2_ACCESS_KEY_ID"],
      R2_SECRET_ACCESS_KEY: process.env["R2_SECRET_ACCESS_KEY"],
      R2_BUCKET: process.env["R2_BUCKET"],
    };
    process.env["OPENAI_API_KEY"] = "";
    process.env["R2_ACCOUNT_ID"] = "acct";
    process.env["R2_ACCESS_KEY_ID"] = "access";
    process.env["R2_SECRET_ACCESS_KEY"] = "secret";
    process.env["R2_BUCKET"] = "bucket";

    const app = express();
    app.post("/voice/upload", voiceFeatureGate, (_req, res) => {
      res.status(202).json({ ok: true });
    });
    app.post("/quotes/:id/photos", photoFeatureGate, (_req, res) => {
      res.status(201).json({ ok: true });
    });
    app.get("/quotes/:id/photos/:photoId", photoFeatureGate, (_req, res) => {
      res.status(200).json({ ok: true });
    });
    const server = await listen(app);
    try {
      const voice = await fetch(`${server.url}/voice/upload`, { method: "POST" });
      const voiceBody: unknown = await voice.json();
      assert.equal(voice.status, 503);
      assert.deepEqual(voiceBody, { error: VOICE_UNAVAILABLE_MESSAGE });
      assert.equal(JSON.stringify(voiceBody).includes("OPENAI"), false);

      const photo = await fetch(`${server.url}/quotes/q/photos`, { method: "POST" });
      assert.equal(photo.status, 201);

      process.env["R2_BUCKET"] = "  ";
      const blockedPhoto = await fetch(`${server.url}/quotes/q/photos/p`);
      const blockedBody: unknown = await blockedPhoto.json();
      assert.equal(blockedPhoto.status, 503);
      assert.deepEqual(blockedBody, { error: PHOTOS_UNAVAILABLE_MESSAGE });

      const blockedVoice = await fetch(`${server.url}/voice/upload`, { method: "POST" });
      assert.equal(blockedVoice.status, 503);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await server.close();
    }
  });

  it("lets the routes through when OpenAI and R2 are set", async () => {
    const previous = { ...process.env };
    Object.assign(process.env, READY);
    const app = express();
    app.post("/voice/upload", voiceFeatureGate, (_req, res) => {
      res.status(202).json({ ok: true });
    });
    app.get("/photos", photoFeatureGate, (_req, res) => {
      res.status(200).json({ ok: true });
    });
    const server = await listen(app);
    try {
      assert.equal((await fetch(`${server.url}/voice/upload`, { method: "POST" })).status, 202);
      assert.equal((await fetch(`${server.url}/photos`)).status, 200);
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in previous)) delete process.env[key];
      }
      Object.assign(process.env, previous);
      await server.close();
    }
  });
});

describe("boot wiring", () => {
  it("warns after the JWT check and does not exit when optional keys are missing", () => {
    const source = readFileSync(path.join(here, "../index.ts"), "utf8");
    const start = source.slice(source.indexOf("async function startServer"));
    const bootAt = start.indexOf("assertBootEnv(");
    const warnAt = start.indexOf("logOptionalFeatureWarning(");
    const bossAt = start.indexOf("initBoss(");
    assert.ok(bootAt >= 0);
    assert.ok(warnAt > bootAt);
    assert.ok(bossAt > warnAt);
  });
});
