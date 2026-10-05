import {
  QUOTE_COLUMNS,
  quoteRowToResponse,
  type QuoteRow,
} from "../routes/quotes-payload.js";
import type { QuoteResponse } from "../types/quotes.js";
import { parseQuoteCreateBody } from "./quote-write.js";

export type CreateQuoteQuery = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: unknown[] }>;

export const INSERT_QUOTE_SQL = `INSERT INTO quotes (contractor_id, status, customer_phone, total_cents, private_note, client_sentence, client_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (contractor_id, client_key) WHERE client_key IS NOT NULL
       DO NOTHING
       RETURNING ${QUOTE_COLUMNS}`;

export const SELECT_QUOTE_BY_CLIENT_KEY_SQL = `SELECT ${QUOTE_COLUMNS}
       FROM quotes
       WHERE contractor_id = $1 AND client_key = $2`;

export type CreateQuoteOutcome =
  | { status: 400; json: { error: string } }
  | { status: 200 | 201; json: { quote: QuoteResponse } };

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object"
    && err !== null
    && "code" in err
    && (err as { code: unknown }).code === "23505"
  );
}

/**
 * Insert a draft, or return the row already stored for this contractor and
 * client key. A retry does not rewrite cents, status, or notes.
 */
export async function createQuote(
  queryFn: CreateQuoteQuery,
  args: { contractorId: string; body: unknown },
): Promise<CreateQuoteOutcome> {
  const parsed = parseQuoteCreateBody(args.body);
  if (!parsed.ok) {
    return { status: 400, json: { error: parsed.error } };
  }

  const params = [
    args.contractorId,
    parsed.status,
    parsed.customerPhone,
    parsed.totalCents,
    parsed.privateNote,
    parsed.clientSentence,
    parsed.clientKey,
  ];

  let inserted: QuoteRow | undefined;
  try {
    const result = await queryFn(INSERT_QUOTE_SQL, params);
    inserted = result.rows[0] as QuoteRow | undefined;
  } catch (err) {
    if (!parsed.clientKey || !isUniqueViolation(err)) {
      throw err;
    }
  }

  if (inserted) {
    return { status: 201, json: { quote: quoteRowToResponse(inserted) } };
  }

  if (!parsed.clientKey) {
    throw new Error("INSERT quotes did not return a row");
  }

  const existing = await queryFn(SELECT_QUOTE_BY_CLIENT_KEY_SQL, [
    args.contractorId,
    parsed.clientKey,
  ]);
  const row = existing.rows[0] as QuoteRow | undefined;
  if (!row) {
    throw new Error("quote client_key conflict did not return the existing row");
  }
  return { status: 200, json: { quote: quoteRowToResponse(row) } };
}
