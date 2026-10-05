import type { RequestHandler } from "express";

export const VOICE_UNAVAILABLE_MESSAGE = "Voice quotes are not available right now.";
export const PHOTOS_UNAVAILABLE_MESSAGE = "Photos are not available right now.";

export const R2_ENV_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
] as const;

export type OptionalFeatureName = "voice" | "photos";

export type OptionalFeatureReport = {
  missing: string[];
  disabled: OptionalFeatureName[];
};

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim() === "";
}

/** Which optional integrations are off. Does not throw. */
export function optionalFeatureReport(
  env: NodeJS.ProcessEnv,
): OptionalFeatureReport {
  const missing: string[] = [];
  if (isBlank(env["OPENAI_API_KEY"])) missing.push("OPENAI_API_KEY");
  for (const key of R2_ENV_KEYS) {
    if (isBlank(env[key])) missing.push(key);
  }
  const r2Missing = R2_ENV_KEYS.some((key) => missing.includes(key));
  const disabled: OptionalFeatureName[] = [];
  if (missing.includes("OPENAI_API_KEY") || r2Missing) disabled.push("voice");
  if (r2Missing) disabled.push("photos");
  return { missing, disabled };
}

/**
 * One warning when voice or photos cannot run. Auth and quotes still boot.
 * The line lists env names only, never secret values.
 */
export function logOptionalFeatureWarning(
  env: NodeJS.ProcessEnv,
  write: (
    level: "warn",
    fields: { msg: string; disabled: string[]; missing: string[] },
  ) => void,
): void {
  const report = optionalFeatureReport(env);
  if (report.disabled.length === 0) return;
  write("warn", {
    msg: "optional_features_disabled",
    disabled: report.disabled,
    missing: report.missing,
  });
}

export const voiceFeatureGate: RequestHandler = (_req, res, next) => {
  if (optionalFeatureReport(process.env).disabled.includes("voice")) {
    res.status(503).json({ error: VOICE_UNAVAILABLE_MESSAGE });
    return;
  }
  next();
};

export const photoFeatureGate: RequestHandler = (_req, res, next) => {
  if (optionalFeatureReport(process.env).disabled.includes("photos")) {
    res.status(503).json({ error: PHOTOS_UNAVAILABLE_MESSAGE });
    return;
  }
  next();
};
