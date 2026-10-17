import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditMigrations,
  auditWorkingTree,
  readMigrationsFromDisk,
  type MigrationFile,
} from "./migration-audit.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const migrationsDir = path.join(repoRoot, "apps/backend/src/db/migrations");

const DUPLICATE =
  "migration number 029 is used by 029_feedback.sql and 029_vat_percent_scale.sql. Renumber yours to 031.";

const EDITED =
  "025_fractional_quantity.sql was edited, but it is already on origin/master. Applied migrations are append-only: add a new file instead of changing this one.";

function disk(): MigrationFile[] {
  return readMigrationsFromDisk(migrationsDir);
}

describe("migration audit", () => {
  it("accepts the files on this branch against origin/master", () => {
    assert.deepEqual(auditWorkingTree(repoRoot), []);
    const result = spawnSync(process.execPath, ["scripts/check-migrations.mjs"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /30 migrations are contiguous from 001/);
  });

  it("rejects a duplicate number and names the next free number", () => {
    const head = disk().concat([
      { name: "029_vat_percent_scale.sql", contents: "-- clash\n" },
    ]);
    const errors = auditMigrations({ head, base: disk() });
    assert.ok(errors.includes(DUPLICATE), errors.join("\n"));
  });

  it("rejects a gap in the sequence", () => {
    const head = disk().filter((file) => file.name !== "004_voice.sql");
    const errors = auditMigrations({ head, base: head });
    assert.ok(
      errors.some((error) =>
        error.startsWith(
          "migration numbers are not sequential: 004 is missing. Numbers must be contiguous from 001 with no gaps.",
        ),
      ),
      errors.join("\n"),
    );
  });

  it("rejects an edit to a migration that is already on origin/master", () => {
    const base = disk();
    const head = base.map((file) =>
      file.name === "025_fractional_quantity.sql"
        ? { ...file, contents: `${file.contents}\n-- edited\n` }
        : file,
    );
    const errors = auditMigrations({ head, base });
    assert.deepEqual(errors, [EDITED]);
  });

  it("rejects deleting a migration that is already on origin/master", () => {
    const base = disk();
    const head = base.filter((file) => file.name !== "025_fractional_quantity.sql");
    const errors = auditMigrations({ head, base });
    assert.ok(
      errors.some((error) => error.startsWith("025_fractional_quantity.sql was removed, but it is already on origin/master")),
      errors.join("\n"),
    );
  });

  it("allows a new file at the next number", () => {
    const base = disk();
    const head = base.concat([
      { name: "031_quote_lifecycle_guard.sql", contents: "-- new\n" },
    ]);
    assert.deepEqual(auditMigrations({ head, base }), []);
  });

  it("rejects a name that is not NNN_snake_case.sql", () => {
    const base = disk();
    const head = base.concat([{ name: "031_BadName.sql", contents: "-- new\n" }]);
    const errors = auditMigrations({ head, base });
    assert.ok(
      errors.some((error) => error.startsWith("031_BadName.sql does not match NNN_snake_case.sql")),
      errors.join("\n"),
    );
  });
});
