import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import { router as authRouter } from "./routes/auth.js";

const app = express();
const PORT = process.env["PORT"] ? parseInt(process.env["PORT"], 10) : 3000;

app.use(express.json());

// Auth routes
app.use("/auth", authRouter);

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

app.listen(PORT, () => {
  console.info(`QuoteSnap backend running on port ${PORT}`);
});

export default app;
