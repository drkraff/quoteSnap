import "dotenv/config";
import express, { Request, Response } from "express";
import { router as authRouter } from "./routes/auth.js";
import { router as onboardingRouter } from "./routes/onboarding.js";
import { router as catalogRouter } from "./routes/catalog.js";
import { router as quotesRouter } from "./routes/quotes.js";
import { router as rateCardRouter } from "./routes/rate-card.js";
import { router as voiceRouter } from "./routes/voice.js";
import { router as approvalRouter } from "./routes/approval.js";
import { initBoss } from "./workers/voice-processor.js";
import { errorHandler, requestIdMiddleware } from "./log/http.js";
import { errorSummary, log } from "./log/logger.js";

const app = express();
const PORT = process.env["PORT"] ? parseInt(process.env["PORT"], 10) : 3000;

app.use(requestIdMiddleware);
app.use(express.json());

// Auth routes
app.use("/auth", authRouter);

// Onboarding routes
app.use("/onboarding", onboardingRouter);

// Catalog routes
app.use("/catalog", catalogRouter);

// Quotes routes
app.use("/quotes", quotesRouter);

// Rate card (learned unit prices; exact name+unit+optional trade)
app.use("/rate-card", rateCardRouter);

// Voice routes
app.use("/voice", voiceRouter);

// Public customer approval page (snapshot HTML; no app, no session)
app.use("/q", approvalRouter);

// GET /health — liveness probe
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);

async function startServer(): Promise<void> {
  await initBoss();
  app.listen(PORT, () => {
    log("info", { msg: "server_listening", port: PORT });
  });
}

startServer().catch((err) => {
  log("error", { msg: "server_start_failed", error: errorSummary(err) });
  process.exit(1);
});

export default app;
