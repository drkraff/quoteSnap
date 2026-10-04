import { query } from "../db/connection.js";
import { createApprovalRouter } from "./approval-router.js";

/** Public approval page. Token in the path; no contractor session. */
export const router = createApprovalRouter({ queryFn: query });
