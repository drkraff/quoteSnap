export type LoginIdentifier = {
  field: "email" | "phone";
  value: string;
};

/**
 * Resolve a single login identifier. Email wins when both are provided so a
 * mixed email+phone payload cannot OR-match a different contractor (LIMIT 1).
 */
export function resolveLoginIdentifier(
  email?: string | null,
  phone?: string | null
): LoginIdentifier | null {
  const emailValue = typeof email === "string" ? email.trim() : "";
  const phoneValue = typeof phone === "string" ? phone.trim() : "";

  if (emailValue) {
    return { field: "email", value: emailValue };
  }
  if (phoneValue) {
    return { field: "phone", value: phoneValue };
  }
  return null;
}
