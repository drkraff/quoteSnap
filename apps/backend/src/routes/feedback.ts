import { query } from "../db/connection.js";
import { createFeedbackRouter } from "./feedback-router.js";

export const router = createFeedbackRouter({ query });
