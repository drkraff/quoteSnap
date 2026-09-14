import { cpSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
cpSync(
  path.join(backendRoot, "src/db/migrations"),
  path.join(backendRoot, "dist/db/migrations"),
  { recursive: true }
);
