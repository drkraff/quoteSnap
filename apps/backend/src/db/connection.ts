import "dotenv/config";
import { Pool, QueryResult } from "pg";

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
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

export const query = (text: string, params?: unknown[]): Promise<QueryResult> =>
  pool.query(text, params);

export default pool;
