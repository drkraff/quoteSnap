import "dotenv/config";
import { Pool, QueryResult } from "pg";
import { errorSummary, log } from "../log/logger.js";

if (!process.env["DATABASE_URL"]) {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
});

pool.on("error", (err: Error) => {
  log("error", { msg: "idle_client_error", error: errorSummary(err) });
});

export type QueryFn = (text: string, params?: unknown[]) => Promise<QueryResult>;

export const query: QueryFn = (text, params) => pool.query(text, params);

/** Run work on a single pooled client inside BEGIN/COMMIT; ROLLBACK on throw. */
export async function withTransaction<T>(fn: (query: QueryFn) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const txQuery: QueryFn = (text, params) => client.query(text, params);
    const result = await fn(txQuery);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      log("error", {
        msg: "transaction_rollback_failed",
        error: errorSummary(rollbackErr),
      });
    }
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
