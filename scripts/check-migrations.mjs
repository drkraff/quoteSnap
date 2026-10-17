import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "apps/backend/package.json"));
const tsx = require.resolve("tsx");
const audit = path.join(root, "apps/backend/src/db/migration-audit.ts");
const result = spawnSync(process.execPath, ["--import", tsx, audit], {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status === null ? 1 : result.status);
