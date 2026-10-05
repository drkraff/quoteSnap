import "dotenv/config";
import type { Server } from "node:http";
import express, { Request, Response } from "express";
import { router as authRouter } from "./routes/auth.js";
import { router as onboardingRouter } from "./routes/onboarding.js";
import { router as catalogRouter } from "./routes/catalog.js";
import { router as quotesRouter } from "./routes/quotes.js";
import { router as rateCardRouter } from "./routes/rate-card.js";
import { router as voiceRouter } from "./routes/voice.js";
import { router as approvalRouter } from "./routes/approval.js";
import { boss, initBoss } from "./workers/voice-processor.js";
import pool from "./db/connection.js";
import { errorHandler, requestIdMiddleware } from "./log/http.js";
import { errorSummary, log } from "./log/logger.js";
import { applyApiHardening } from "./http/api-hardening.js";
import { installGracefulShutdown } from "./http/shutdown.js";
import { runBootOrExit } from "./http/boot.js";
import { mountHealth } from "./http/health.js";
import { probeDatabase } from "./http/ready.js";
import { assertBootEnv } from "./env/boot-env.js";
import { logOptionalFeatureWarning } from "./env/optional-features.js";

const app = express();
const PORT = process.env["PORT"] ? parseInt(process.env["PORT"], 10) : 3000;

app.use(requestIdMiddleware);
applyApiHardening(app);
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

// /health is liveness (no database). /ready checks the pool.
mountHealth(app, {
  ready: () => probeDatabase(() => pool.connect()),
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);

async function startServer(): Promise<void> {
  let server: Server | undefined;
  await runBootOrExit(
    {
      assertBootEnv: () => {
        assertBootEnv();
      },
      warnOptional: () => {
        logOptionalFeatureWarning(process.env, log);
      },
      initBoss: () => initBoss(),
      listen: () => {
        server = app.listen(PORT, () => {
          log("info", { msg: "server_listening", port: PORT });
        });
      },
      installShutdown: () => {
        if (!server) {
          throw new Error("server failed to listen");
        }
        const listening = server;
        installGracefulShutdown({
          closeServer: () => new Promise((resolve, reject) => {
            listening.close((err) => (err ? reject(err) : resolve()));
          }),
          stopBoss: () => boss.stop({ graceful: true, timeout: 20000 }),
          closePool: () => pool.end(),
          exit: (code) => {
            process.exit(code);
          },
          logError: (err) => {
            log("error", { msg: "shutdown_failed", error: errorSummary(err) });
          },
        });
      },
    },
    {
      exit: (code) => {
        process.exit(code);
      },
      logError: (err) => {
        log("error", { msg: "server_start_failed", error: errorSummary(err) });
      },
    },
  );
}

void startServer();

export default app;
