import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  VOICE_MIME_ERROR,
  voiceAudioMimeError,
  voiceAudioR2Key,
} from "./audio-upload.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FILE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("voiceAudioMimeError", () => {
  it("accepts the mobile audio/mp4 upload and rejects HTML", () => {
    assert.equal(voiceAudioMimeError("audio/mp4"), null);
    assert.equal(voiceAudioMimeError("audio/mp4; codecs=mp4a.40.2"), null);
    assert.equal(voiceAudioMimeError("text/html"), VOICE_MIME_ERROR);
    assert.equal(voiceAudioMimeError(""), VOICE_MIME_ERROR);
  });
});

describe("voiceAudioR2Key", () => {
  it("builds an audio key only from UUIDs", () => {
    assert.equal(
      voiceAudioR2Key(CONTRACTOR_ID, FILE_ID),
      `audio/${CONTRACTOR_ID}/${FILE_ID}.m4a`,
    );
    assert.throws(() => voiceAudioR2Key("../evil", FILE_ID), /invalid audio key/);
    assert.throws(() => voiceAudioR2Key(CONTRACTOR_ID, "not-a-uuid"), /invalid audio key/);
  });
});

describe("voice upload route", () => {
  it("checks the mime and builds the key before uploadToR2", () => {
    const source = readFileSync(path.join(here, "../routes/voice.ts"), "utf8");
    const route = source.slice(source.indexOf("'/upload'"));
    const mimeAt = route.indexOf("voiceAudioMimeError(");
    const keyAt = route.indexOf("voiceAudioR2Key(");
    const uploadAt = route.indexOf("uploadToR2(");
    assert.ok(mimeAt >= 0);
    assert.ok(keyAt > mimeAt);
    assert.ok(uploadAt > keyAt);
  });
});
