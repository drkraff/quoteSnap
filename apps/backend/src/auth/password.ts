/** bcrypt hashes only the first 72 bytes. Longer secrets compare equal to that prefix. */
export const BCRYPT_MAX_BYTES = 72;

export const PASSWORD_TOO_SHORT = "Password must be at least 8 characters";
export const PASSWORD_TOO_LONG = "Password must be at most 72 bytes";

export function passwordExceedsBcryptLimit(password: string): boolean {
  return Buffer.byteLength(password, "utf8") > BCRYPT_MAX_BYTES;
}

/** Register check. Missing and short passwords keep the existing message. */
export function passwordPolicyError(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 8) {
    return PASSWORD_TOO_SHORT;
  }
  if (passwordExceedsBcryptLimit(password)) {
    return PASSWORD_TOO_LONG;
  }
  return null;
}
