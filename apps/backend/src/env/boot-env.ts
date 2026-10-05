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

/** Throws before listen when the access secret is missing, short, or the example. */
export function assertBootEnv(env: NodeJS.ProcessEnv = process.env): void {
  const error = jwtAccessSecretError(env["JWT_ACCESS_SECRET"]);
  if (error) {
    throw new Error(error);
  }
}
