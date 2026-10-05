/** The value shipped in `.env.example` before boot refused it. */
export const JWT_EXAMPLE_PLACEHOLDER = "change-me-use-a-long-random-string-in-production";

export const JWT_ACCESS_SECRET_MIN_LENGTH = 32;

export function jwtAccessSecretError(secret: string | undefined): string | null {
  if (secret === undefined || secret.trim() === "") {
    return "JWT_ACCESS_SECRET is required";
  }
  if (secret === JWT_EXAMPLE_PLACEHOLDER) {
    return "JWT_ACCESS_SECRET is still the example placeholder";
  }
  if (secret.length < JWT_ACCESS_SECRET_MIN_LENGTH) {
    return "JWT_ACCESS_SECRET must be at least 32 characters";
  }
  return null;
}

const POSTGRES_URL = /^postgres(?:ql)?:\/\//i;

/**
 * Missing and non-Postgres URLs fail closed.
 * The message never includes the value (it may contain a password).
 */
export function databaseUrlError(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "") {
    return "DATABASE_URL environment variable is required";
  }
  const url = value.trim();
  if (POSTGRES_URL.test(url)) {
    try {
      const parsed = new URL(url);
      const host =
        parsed.hostname ||
        parsed.searchParams.get("host") ||
        parsed.searchParams.get("hostaddr");
      if (!host) return "DATABASE_URL is invalid";
      return null;
    } catch {
      // `new URL` rejects some libpq forms that still name a host in the query.
      if (/[?&](?:host|hostaddr)=[^&#\s]+/i.test(url)) return null;
      return "DATABASE_URL is invalid";
    }
  }
  if (/(?:^|\s)(?:host|hostaddr)\s*=\s*\S+/i.test(url)) return null;
  return "DATABASE_URL is invalid";
}

/** Throws before listen when the access secret or database URL is unusable. */
export function assertBootEnv(env: NodeJS.ProcessEnv = process.env): void {
  const error = jwtAccessSecretError(env["JWT_ACCESS_SECRET"]);
  if (error) {
    throw new Error(error);
  }
  const database = databaseUrlError(env["DATABASE_URL"]);
  if (database) {
    throw new Error(database);
  }
}
