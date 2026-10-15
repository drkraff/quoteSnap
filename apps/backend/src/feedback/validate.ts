import { isUuid } from "../uuid.js";

export const FEEDBACK_MESSAGE_MAX = 4000;
export const FEEDBACK_SCREEN_MAX = 64;
export const FEEDBACK_APP_VERSION_MAX = 32;
export const FEEDBACK_PLATFORM_MAX = 32;
/** 1MB. Matches the feedback.screenshot check in 029_feedback.sql. */
export const FEEDBACK_SCREENSHOT_MAX_BYTES = 1_048_576;

export const FEEDBACK_BODY_INVALID = "Feedback could not be read";
export const FEEDBACK_MESSAGE_REQUIRED = "Message is required";
export const FEEDBACK_MESSAGE_TOO_LONG = "Message is too long";
export const FEEDBACK_RATING_INVALID = "Rating must be a whole number from 1 to 5";
export const FEEDBACK_QUOTE_ID_INVALID = "Quote id must be a UUID";
export const FEEDBACK_SCREEN_INVALID = "Screen must be text";
export const FEEDBACK_SCREEN_TOO_LONG = "Screen name is too long";
export const FEEDBACK_APP_VERSION_INVALID = "App version must be text";
export const FEEDBACK_APP_VERSION_TOO_LONG = "App version is too long";
export const FEEDBACK_PLATFORM_INVALID = "Platform must be text";
export const FEEDBACK_PLATFORM_TOO_LONG = "Platform is too long";
export const FEEDBACK_SCREENSHOT_INVALID = "Screenshot could not be read";
export const FEEDBACK_SCREENSHOT_TYPE = "Screenshot must be a PNG or JPEG image";
export const FEEDBACK_SCREENSHOT_TOO_LARGE = "Screenshot is too large";

export type FeedbackBody = {
  message: string;
  rating: number | null;
  screen: string | null;
  quoteId: string | null;
  appVersion: string | null;
  platform: string | null;
  screenshot: Buffer | null;
};

export type ParseFeedbackResult =
  | { ok: true; value: FeedbackBody }
  | { ok: false; error: string };

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(
  value: unknown,
  max: number,
  invalid: string,
  tooLong: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: invalid };
  const trimmed = value.split("\0").join("").trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > max) return { ok: false, error: tooLong };
  return { ok: true, value: trimmed };
}

function optionalRating(
  value: unknown,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
    return { ok: false, error: FEEDBACK_RATING_INVALID };
  }
  return { ok: true, value };
}

function optionalQuoteId(
  value: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || !isUuid(value.trim())) {
    return { ok: false, error: FEEDBACK_QUOTE_ID_INVALID };
  }
  return { ok: true, value: value.trim() };
}

/** PNG or JPEG magic. Anything else is rejected so the column stays a still. */
export function isPngOrJpeg(bytes: Buffer): boolean {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return true;
  }
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function decodeScreenshot(value: unknown): { ok: true; value: Buffer | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: FEEDBACK_SCREENSHOT_INVALID };
  let raw = value.trim().replace(/\s+/g, "");
  const dataPrefix = /^data:image\/[a-z0-9.+-]+;base64,/i.exec(raw);
  if (dataPrefix) raw = raw.slice(dataPrefix[0].length);
  if (raw.length === 0) return { ok: true, value: null };
  if (raw.length % 4 !== 0 || !BASE64_RE.test(raw)) {
    return { ok: false, error: FEEDBACK_SCREENSHOT_INVALID };
  }
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length === 0) return { ok: false, error: FEEDBACK_SCREENSHOT_INVALID };
  if (bytes.length > FEEDBACK_SCREENSHOT_MAX_BYTES) {
    return { ok: false, error: FEEDBACK_SCREENSHOT_TOO_LARGE };
  }
  if (!isPngOrJpeg(bytes)) return { ok: false, error: FEEDBACK_SCREENSHOT_TYPE };
  return { ok: true, value: bytes };
}

export function parseFeedbackBody(body: unknown): ParseFeedbackResult {
  if (!isRecord(body)) return { ok: false, error: FEEDBACK_BODY_INVALID };

  const messageText = optionalText(
    body["message"],
    FEEDBACK_MESSAGE_MAX,
    FEEDBACK_MESSAGE_REQUIRED,
    FEEDBACK_MESSAGE_TOO_LONG,
  );
  if (!messageText.ok) return messageText;
  if (messageText.value === null) return { ok: false, error: FEEDBACK_MESSAGE_REQUIRED };

  const rating = optionalRating(body["rating"]);
  if (!rating.ok) return rating;

  const screen = optionalText(
    body["screen"],
    FEEDBACK_SCREEN_MAX,
    FEEDBACK_SCREEN_INVALID,
    FEEDBACK_SCREEN_TOO_LONG,
  );
  if (!screen.ok) return screen;

  const quoteId = optionalQuoteId(body["quoteId"]);
  if (!quoteId.ok) return quoteId;

  const appVersion = optionalText(
    body["appVersion"],
    FEEDBACK_APP_VERSION_MAX,
    FEEDBACK_APP_VERSION_INVALID,
    FEEDBACK_APP_VERSION_TOO_LONG,
  );
  if (!appVersion.ok) return appVersion;

  const platform = optionalText(
    body["platform"],
    FEEDBACK_PLATFORM_MAX,
    FEEDBACK_PLATFORM_INVALID,
    FEEDBACK_PLATFORM_TOO_LONG,
  );
  if (!platform.ok) return platform;

  const screenshot = decodeScreenshot(body["screenshotBase64"]);
  if (!screenshot.ok) return screenshot;

  return {
    ok: true,
    value: {
      message: messageText.value,
      rating: rating.value,
      screen: screen.value,
      quoteId: quoteId.value,
      appVersion: appVersion.value,
      platform: platform.value,
      screenshot: screenshot.value,
    },
  };
}
