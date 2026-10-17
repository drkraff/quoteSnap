/**
 * Migration files are append-only. Numbers are unique and contiguous.
 * CI runs this against origin/master so a duplicate like the 029 clash,
 * a gap, or an edit to an already-merged file fails before migrate.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATIONS_REL_DIR = "apps/backend/src/db/migrations";

const NAME_RE = /^(\d{3,})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

export type MigrationFile = {
  name: string;
  contents: string;
};

function padNumber(value: number): string {
  return String(value).padStart(3, "0");
}

function parsedNumber(name: string): { raw: string; value: number } | null {
  const match = NAME_RE.exec(name);
  if (!match?.[1]) return null;
  return { raw: match[1], value: Number(match[1]) };
}

function englishList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function auditMigrations(args: {
  head: MigrationFile[];
  base: MigrationFile[];
}): string[] {
  const errors: string[] = [];
  const head = [...args.head].sort((a, b) => a.name.localeCompare(b.name));
  if (head.length === 0) {
    return [`no migration files found in ${MIGRATIONS_REL_DIR}`];
  }

  const byNumber = new Map<number, string[]>();
  let maxNumber = 0;
  for (const file of head) {
    const parsed = parsedNumber(file.name);
    if (!parsed) {
      errors.push(
        `${file.name} does not match NNN_snake_case.sql. Rename it to a zero-padded number, an underscore, and snake_case.`,
      );
      continue;
    }
    const group = byNumber.get(parsed.value) ?? [];
    group.push(file.name);
    byNumber.set(parsed.value, group);
    if (parsed.value > maxNumber) maxNumber = parsed.value;
  }

  const next = padNumber(maxNumber + 1);
  for (const [value, names] of [...byNumber.entries()].sort((a, b) => a[0] - b[0])) {
    if (names.length < 2) continue;
    const sorted = [...names].sort();
    const label = parsedNumber(sorted[0]!)?.raw ?? padNumber(value);
    errors.push(
      `migration number ${label} is used by ${englishList(sorted)}. Renumber yours to ${next}.`,
    );
  }

  const present = [...byNumber.keys()].sort((a, b) => a - b);
  if (present.length > 0) {
    const missing: number[] = [];
    for (let n = 1; n <= present[present.length - 1]!; n += 1) {
      if (!byNumber.has(n)) missing.push(n);
    }
    if (missing.length > 0) {
      const labels = missing.map(padNumber);
      const verb = labels.length === 1 ? "is" : "are";
      errors.push(
        `migration numbers are not sequential: ${englishList(labels)} ${verb} missing. Numbers must be contiguous from 001 with no gaps.`,
      );
    }
  }

  const headByName = new Map(head.map((file) => [file.name, file.contents]));
  for (const file of [...args.base].sort((a, b) => a.name.localeCompare(b.name))) {
    const contents = headByName.get(file.name);
    if (contents === undefined) {
      errors.push(
        `${file.name} was removed, but it is already on origin/master. Applied migrations are append-only: add a new file instead of deleting this one.`,
      );
      continue;
    }
    if (contents !== file.contents) {
      errors.push(
        `${file.name} was edited, but it is already on origin/master. Applied migrations are append-only: add a new file instead of changing this one.`,
      );
    }
  }

  return errors;
}

function git(repoRoot: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function resolveBaseRef(repoRoot: string): string {
  const candidates = ["origin/master", "master"];
  for (const ref of candidates) {
    try {
      const sha = git(repoRoot, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).trim();
      if (sha) return ref;
    } catch {
      // Try the next ref. CI fetches origin/master with fetch-depth: 0.
    }
  }
  throw new Error(
    "Cannot compare migrations to origin/master. Fetch it with: git fetch origin master",
  );
}

export function readMigrationsFromGit(repoRoot: string, ref: string): MigrationFile[] {
  let listed = "";
  try {
    listed = git(repoRoot, ["ls-tree", "-r", "--name-only", `${ref}:${MIGRATIONS_REL_DIR}`]);
  } catch {
    return [];
  }
  return listed
    .split("\n")
    .map((name) => name.trim())
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      contents: git(repoRoot, ["show", `${ref}:${MIGRATIONS_REL_DIR}/${name}`]),
    }));
}

export function readMigrationsFromDisk(dir: string): MigrationFile[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      contents: readFileSync(path.join(dir, name), "utf8"),
    }));
}

export function findRepoRoot(start: string): string {
  let dir = path.resolve(start);
  for (;;) {
    if (readdirSync(dir).includes(".git")) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`No git root found from ${start}`);
    }
    dir = parent;
  }
}

export function auditWorkingTree(repoRoot: string): string[] {
  const baseRef = resolveBaseRef(repoRoot);
  return auditMigrations({
    head: readMigrationsFromDisk(path.join(repoRoot, MIGRATIONS_REL_DIR)),
    base: readMigrationsFromGit(repoRoot, baseRef),
  });
}

const isMain =
  process.argv[1] != null &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith("migration-audit.ts") ||
    process.argv[1].endsWith("migration-audit.js"));

if (isMain) {
  try {
    const repoRoot = findRepoRoot(process.cwd());
    const errors = auditWorkingTree(repoRoot);
    if (errors.length > 0) {
      for (const error of errors) console.error(error);
      process.exit(1);
    }
    const count = readMigrationsFromDisk(path.join(repoRoot, MIGRATIONS_REL_DIR)).length;
    console.log(
      `${count} migrations are contiguous from 001 and match ${resolveBaseRef(repoRoot)}.`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  }
}
