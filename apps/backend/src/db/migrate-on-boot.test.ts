import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMigrationsDir } from "./migrations-path.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(here, "../..");
const repoRoot = path.join(backendRoot, "..");

describe("resolveMigrationsDir", () => {
  it("finds numbered SQL files including 009_quote_archive.sql", () => {
    const dir = resolveMigrationsDir();
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    assert.ok(files.includes("001_foundation.sql"));
    assert.ok(files.includes("009_quote_archive.sql"));
    assert.ok(existsSync(path.join(dir, "009_quote_archive.sql")));
  });
});

describe("production start chains migrate before listen", () => {
  it("backend start runs compiled migrate then the API (not tsx, not in-request)", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(backendRoot, "package.json"), "utf8")
    ) as { scripts: Record<string, string> };

    assert.equal(
      pkg.scripts["start"],
      "node dist/db/migrate.js && node dist/index.js"
    );
    assert.match(pkg.scripts["build"] ?? "", /copy-migrations/);
    assert.match(pkg.scripts["migrate"] ?? "", /tsx .*migrate\.ts/);
  });

  it("root start is the backend start (Railway default npm start)", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(repoRoot, "package.json"), "utf8")
    ) as { scripts: Record<string, string> };

    assert.equal(pkg.scripts["start"], "npm run start --workspace=apps/backend");
    assert.equal(pkg.scripts["build"], "npm run build --workspace=apps/backend");
  });
});
