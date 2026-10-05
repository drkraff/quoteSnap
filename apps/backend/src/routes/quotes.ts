import { query, withTransaction } from "../db/connection.js";
import { getFromR2 } from "../services/r2.js";
import { createQuotesRouter } from "./quotes-router.js";

export const router = createQuotesRouter({
  query,
  withTransaction,
  getFromR2,
});
