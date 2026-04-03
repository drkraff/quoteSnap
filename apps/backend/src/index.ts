import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import { router as authRouter } from "./routes/auth.js";
import { router as onboardingRouter } from "./routes/onboarding.js";
import { router as catalogRouter } from "./routes/catalog.js";
import { router as quotesRouter } from "./routes/quotes.js";
import { router as voiceRouter } from "./routes/voice.js";
import { initBoss } from "./workers/voice-processor.js";

const app = express();
const PORT = process.env["PORT"] ? parseInt(process.env["PORT"], 10) : 3000;

app.use(express.json());

// Auth routes
app.use("/auth", authRouter);

// Onboarding routes
app.use("/onboarding", onboardingRouter);

// Catalog routes
app.use("/catalog", catalogRouter);

// Quotes routes
app.use("/quotes", quotesRouter);

// Voice routes
app.use("/voice", voiceRouter);

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

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

async function startServer(): Promise<void> {
  await initBoss();
  app.listen(PORT, () => {
    console.info(`QuoteSnap backend running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
