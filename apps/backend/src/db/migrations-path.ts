import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * SQL files live in src/db/migrations. After `tsc`, this module is in dist/db/
 * and those .sql files are not copied, so we fall back to the source tree.
 */
export function resolveMigrationsDir(): string {
  const candidates = [
    path.join(here, "migrations"),
    path.join(here, "../../src/db/migrations"),
  ];

  for (const dir of candidates) {
    if (
      fs.existsSync(dir) &&
      fs.readdirSync(dir).some((f) => f.endsWith(".sql"))
    ) {
      return dir;
    }
  }

  throw new Error(
    `No SQL migrations found. Looked in: ${candidates.join(", ")}`
  );
}
