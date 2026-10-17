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

const NUMBER_RE = /^(\d{3,})_/;

const EDITED =
  "025_fractional_quantity.sql was edited, but it is already on origin/master. Applied migrations are append-only: add a new file instead of changing this one.";

function disk(): MigrationFile[] {
  return readMigrationsFromDisk(migrationsDir);
}

function padNumber(value: number): string {
  return String(value).padStart(3, "0");
}

/** One past the highest NNN_ prefix on disk. */
function nextMigrationNumber(files: MigrationFile[]): string {
  let highest = 0;
  for (const file of files) {
    const match = NUMBER_RE.exec(file.name);
    if (match?.[1]) highest = Math.max(highest, Number(match[1]));
  }
  return padNumber(highest + 1);
}

describe("migration audit", () => {
  it("accepts the files on this branch against origin/master", () => {
    assert.deepEqual(auditWorkingTree(repoRoot), []);
    const result = spawnSync(process.execPath, ["scripts/check-migrations.mjs"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const count = disk().length;
    assert.match(result.stdout, new RegExp(`${count} migrations are contiguous from 001`));
  });

  it("rejects a duplicate number and names the next free number", () => {
    const files = disk();
    const next = nextMigrationNumber(files);
    const head = files.concat([
      { name: "029_vat_percent_scale.sql", contents: "-- clash\n" },
    ]);
    const errors = auditMigrations({ head, base: files });
    const expected =
      `migration number 029 is used by 029_feedback.sql and 029_vat_percent_scale.sql. Renumber yours to ${next}.`;
    assert.ok(errors.includes(expected), errors.join("\n"));
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
    const next = nextMigrationNumber(base);
    const head = base.concat([
      { name: `${next}_new_migration.sql`, contents: "-- new\n" },
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
