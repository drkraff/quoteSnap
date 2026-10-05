import "dotenv/config";
import { Pool, QueryResult } from "pg";
import { databaseUrlError } from "../env/boot-env.js";
import { log } from "../log/logger.js";
import { attachIdleClientErrorHandler } from "./pool-errors.js";
import { runTransaction, type TxQueryFn } from "./transaction.js";

const databaseError = databaseUrlError(process.env["DATABASE_URL"]);
if (databaseError) {
  throw new Error(databaseError);
}

const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
});

attachIdleClientErrorHandler(pool, log);

export type QueryFn = (text: string, params?: unknown[]) => Promise<QueryResult>;

export const query: QueryFn = (text, params) => pool.query(text, params);

/** Run work on a single pooled client inside BEGIN/COMMIT; ROLLBACK on throw. */
export async function withTransaction<T>(fn: (query: QueryFn) => Promise<T>): Promise<T> {
  return runTransaction(() => pool.connect(), fn as (query: TxQueryFn) => Promise<T>);
}

export default pool;
