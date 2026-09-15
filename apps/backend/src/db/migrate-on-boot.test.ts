import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMigrationsDir } from "./migrations-path.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "../..");
const repoRoot = path.resolve(backendRoot, "../..");

describe("resolveMigrationsDir", () => {
  it("finds numbered SQL files including 009_quote_archive.sql through 020_rate_card_imported_source.sql", () => {
    const dir = resolveMigrationsDir();
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    assert.ok(files.includes("001_foundation.sql"));
    assert.ok(files.includes("009_quote_archive.sql"));
    assert.ok(files.includes("010_rate_card_entries.sql"));
    assert.ok(files.includes("011_quote_line_item_unit.sql"));
    assert.ok(files.includes("012_contractor_hourly.sql"));
    assert.ok(files.includes("013_ai_failure_stage.sql"));
    assert.ok(files.includes("014_private_notes.sql"));
    assert.ok(files.includes("015_quote_line_item_price_source.sql"));
    assert.ok(files.includes("016_quote_line_item_option_group.sql"));
    assert.ok(files.includes("017_client_sentence.sql"));
    assert.ok(files.includes("018_quote_rooms.sql"));
    assert.ok(files.includes("019_quote_attachments.sql"));
    assert.ok(files.includes("020_rate_card_imported_source.sql"));
    assert.ok(existsSync(path.join(dir, "009_quote_archive.sql")));
    assert.ok(existsSync(path.join(dir, "010_rate_card_entries.sql")));
    assert.ok(existsSync(path.join(dir, "011_quote_line_item_unit.sql")));
    assert.ok(existsSync(path.join(dir, "012_contractor_hourly.sql")));
    assert.ok(existsSync(path.join(dir, "013_ai_failure_stage.sql")));
    assert.ok(existsSync(path.join(dir, "014_private_notes.sql")));
    assert.ok(existsSync(path.join(dir, "015_quote_line_item_price_source.sql")));
    assert.ok(existsSync(path.join(dir, "016_quote_line_item_option_group.sql")));
    assert.ok(existsSync(path.join(dir, "017_client_sentence.sql")));
    assert.ok(existsSync(path.join(dir, "018_quote_rooms.sql")));
    assert.ok(existsSync(path.join(dir, "019_quote_attachments.sql")));
    assert.ok(existsSync(path.join(dir, "020_rate_card_imported_source.sql")));
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
